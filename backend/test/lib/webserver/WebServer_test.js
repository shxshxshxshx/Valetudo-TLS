const assert = require("node:assert/strict");
const forge = require("node-forge");
const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const os = require("node:os");
const path = require("node:path");
const {describe, it} = require("node:test");
const {once} = require("node:events");

const defaults = require("../../../lib/res/default_config.json");
const WebServer = require("../../../lib/webserver/WebServer");
const {mapRoles} = require("../../../lib/webserver/middlewares/auth/OidcMiddleware");

async function startWebServer(context, configure = () => {}) {
    const settings = structuredClone(defaults);
    settings.webserver.port = 0;
    settings.webserver.blockExternalAccess = false;
    configure(settings);
    const listeners = [];
    const config = {
        get: key => settings[key],
        onUpdate: listener => listeners.push(listener),
        set: (key, value) => {
            settings[key] = value;
            listeners.forEach(listener => listener(key));
        }
    };
    const stopCamera = context.mock.fn(async () => {});
    const webserver = new WebServer({
        config: config,
        robot: {
            capabilities: {
                DuststreamingCapability: {
                    getType: () => "DuststreamingCapability",
                    selfDestruct: stopCamera
                }
            },
            onStateUpdated: () => {},
            onStateAttributesUpdated: () => {},
            onMapUpdated: () => {},
            initModelSpecificWebserverRoutes: () => {}
        },
        phoenixManager: {canReincarnate: () => true, cycleData: {generation: 7}}
    });
    context.after(() => webserver.shutdown());
    await once(webserver.webserver, "listening");
    const baseUrl = `http://127.0.0.1:${webserver.webserver.address().port}`;
    const request = (requestPath, options = {}) => fetch(`${baseUrl}${requestPath}`, {
        signal: AbortSignal.timeout(5000),
        ...options
    });

    return {config: config, webserver: webserver, request: request, stopCamera: stopCamera};
}

describe("TLS/OIDC webserver integration", () => {
    it("starts with default HTTP settings and retains upstream runtime information", async context => {
        const {request} = await startWebServer(context);
        const profileResponse = await request("/api/v2/profile/");
        assert.equal(profileResponse.status, 200);
        assert.deepEqual((await profileResponse.json()).roles, ["admin", "user"]);

        const runtimeResponse = await request("/api/v2/system/runtime/info");
        assert.equal(runtimeResponse.status, 200);
        assert.deepEqual((await runtimeResponse.json()).phoenix, {canReincarnate: true, generation: 7});
    });

    it("authenticates with nested basic-auth settings and applies API configuration updates", async context => {
        const {request} = await startWebServer(context, settings => {
            settings.webserver.auth.basicAuth = {enabled: true, username: "test-user", password: "test-password"};
        });
        const denied = await request("/api/v2/profile/");
        assert.equal(denied.status, 401);
        await denied.text();

        const headers = {Authorization: `Basic ${Buffer.from("test-user:test-password").toString("base64")}`};
        const profileResponse = await request("/api/v2/profile/", {headers: headers});
        assert.equal(profileResponse.status, 200);
        assert.equal((await profileResponse.json()).name, "test-user");

        const configurationResponse = await request("/api/v2/valetudo/config/interfaces/http/auth/basic", {headers: headers});
        assert.deepEqual(await configurationResponse.json(), {enabled: true, username: "test-user", password: ""});

        const updateResponse = await request("/api/v2/valetudo/config/interfaces/http/auth/basic", {
            method: "PUT",
            headers: {...headers, "Content-Type": "application/json"},
            body: JSON.stringify({enabled: false, username: "test-user", password: ""})
        });
        assert.equal(updateResponse.status, 200);
        await updateResponse.text();
        const publicResponse = await request("/api/v2/profile/");
        assert.equal(publicResponse.status, 200);
        await publicResponse.text();
    });

    it("activates OIDC without basic-auth conflicts and preserves the camera killswitch", async context => {
        const issuer = http.createServer((request, response) => {
            const issuerUrl = `http://127.0.0.1:${issuer.address().port}`;
            response.setHeader("Content-Type", "application/json");
            response.end(JSON.stringify({
                issuer: issuerUrl,
                authorization_endpoint: `${issuerUrl}/authorize`,
                token_endpoint: `${issuerUrl}/token`,
                jwks_uri: `${issuerUrl}/jwks`,
                response_types_supported: ["id_token"],
                id_token_signing_alg_values_supported: ["RS256"],
                subject_types_supported: ["public"]
            }));
        });
        issuer.listen(0, "127.0.0.1");
        context.after(() => new Promise(resolve => issuer.close(resolve)));
        await once(issuer, "listening");
        const issuerUrl = `http://127.0.0.1:${issuer.address().port}`;
        const {config, webserver, request, stopCamera} = await startWebServer(context, settings => {
            settings.webserver.auth.basicAuth.enabled = true;
        });
        const webserverConfig = structuredClone(config.get("webserver"));
        webserverConfig.auth.sso.oidc = {
            enabled: true,
            issuer: issuerUrl,
            clientId: "test-client",
            clientSecret: "local-test-session-secret-with-at-least-32-characters",
            scope: "openid profile email groups"
        };
        config.set("webserver", webserverConfig);
        assert.equal(webserver.basicAuthInUse, false);
        const killswitchResponse = await request("/_killswitch/camera");
        assert.equal(killswitchResponse.status, 200);
        await killswitchResponse.text();
        assert.equal(stopCamera.mock.callCount(), 1);

        const loginResponse = await request("/api/v2/profile/", {redirect: "manual"});
        assert.equal(loginResponse.status, 302);
        const location = new URL(loginResponse.headers.get("location"));
        assert.equal(location.origin, issuerUrl);
        assert.equal(location.searchParams.get("client_id"), "test-client");
        assert.equal(location.searchParams.get("scope"), "openid profile email groups");
        await loginResponse.text();

        webserverConfig.auth.sso.oidc.enabled = false;
        config.set("webserver", webserverConfig);
        assert.equal(webserver.basicAuthInUse, true);
        const basicResponse = await request("/api/v2/profile/");
        assert.equal(basicResponse.status, 401);
        await basicResponse.text();
    });

    it("serves the profile over TLS using configured certificate files", async context => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), "valetudo-tls-test-"));
        context.after(() => fs.rmSync(directory, {recursive: true, force: true}));
        const keyPair = forge.pki.rsa.generateKeyPair(2048);
        const certificate = forge.pki.createCertificate();
        certificate.publicKey = keyPair.publicKey;
        certificate.serialNumber = "01";
        certificate.validity.notBefore = new Date(Date.now() - 60000);
        certificate.validity.notAfter = new Date(Date.now() + 60000);
        const attributes = [{name: "commonName", value: "localhost"}];
        certificate.setSubject(attributes);
        certificate.setIssuer(attributes);
        certificate.sign(keyPair.privateKey, forge.md.sha256.create());
        const keyLocation = path.join(directory, "key.pem");
        const certLocation = path.join(directory, "cert.pem");
        fs.writeFileSync(keyLocation, forge.pki.privateKeyToPem(keyPair.privateKey));
        fs.writeFileSync(certLocation, forge.pki.certificateToPem(certificate));

        const {webserver} = await startWebServer(context, settings => {
            settings.webserver.ssl = {enabled: true, keyLocation: keyLocation, certLocation: certLocation};
        });
        await new Promise((resolve, reject) => {
            https.get({
                hostname: "127.0.0.1",
                port: webserver.webserver.address().port,
                path: "/api/v2/profile/",
                rejectUnauthorized: false
            }, response => {
                let body = "";
                response.on("data", chunk => {
                    body += chunk;
                });
                response.on("end", () => {
                    try {
                        assert.equal(response.statusCode, 200);
                        assert.equal(JSON.parse(body).name, "Valetudo");
                        resolve();
                    } catch (error) {
                        reject(error);
                    }
                });
            }).on("error", reject);
        });
    });

    it("handles identities without group claims without granting configured roles", () => {
        const config = {get: () => ({auth: {sso: {oidc: {groupMap: {admin: ["admins"], user: ["users"]}}}}})};
        assert.deepEqual(mapRoles(undefined, config), []);
        assert.deepEqual(mapRoles("admins", config), []);
        assert.deepEqual(mapRoles(["admins"], config), ["admin"]);
    });
});
