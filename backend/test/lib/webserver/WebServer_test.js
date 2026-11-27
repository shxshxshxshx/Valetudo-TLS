const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const forge = require("node-forge");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const tls = require("node:tls");
const {describe, it} = require("node:test");
const {once} = require("node:events");

const defaults = require("../../../lib/res/default_config.json");
const WebServer = require("../../../lib/webserver/WebServer");

async function startWebServer(context, configure = () => {}) {
    const settings = structuredClone(defaults);
    settings.webserver.port = 0;
    settings.webserver.blockExternalAccess = false;
    settings.webserver.baseUrl = "http://localhost";
    settings.webserver.ssl = {enabled: false, keyLocation: "", certLocation: ""};
    settings.webserver.auth = {
        basicAuth: settings.webserver.basicAuth,
        sso: {
            oidc: {
                enabled: true,
                issuer: "http://localhost",
                clientId: "test-client",
                clientSecret: "local-test-session-secret-with-at-least-32-characters"
            }
        }
    };
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
    Object.freeze(Object.prototype); // Match the production entry point before handling requests.
    context.after(() => webserver.shutdown());
    await once(webserver.webserver, "listening");
    const baseUrl = `http://127.0.0.1:${webserver.webserver.address().port}`;
    // Exercise robot builds without relying on Node's WebAssembly-based fetch client in the test process.
    const request = (requestPath, options = {}) => new Promise((resolve, reject) => {
        const clientRequest = http.request(`${baseUrl}${requestPath}`, {
            method: options.method ?? "GET",
            headers: options.headers
        }, response => {
            const chunks = [];
            response.on("data", chunk => chunks.push(chunk));
            response.on("error", reject);
            response.on("end", () => {
                const body = Buffer.concat(chunks).toString("utf8");
                resolve({
                    status: response.statusCode,
                    headers: {
                        get: name => response.headers[name.toLowerCase()] ?? null,
                        getSetCookie: () => response.headers["set-cookie"] ?? []
                    },
                    text: async () => body,
                    json: async () => JSON.parse(body)
                });
            });
        });
        clientRequest.setTimeout(15000, () => clientRequest.destroy(new Error("HTTP test request timed out")));
        clientRequest.on("error", reject);
        clientRequest.end(options.body?.toString());
    });

    return {config: config, webserver: webserver, request: request, stopCamera: stopCamera};
}

describe("TLS/OIDC webserver integration", () => {
    it("refuses startup when both authentication providers are disabled", async context => {
        await assert.rejects(startWebServer(context, settings => {
            settings.webserver.auth.sso.oidc.enabled = false;
        }), /OIDC authentication must be enabled/);
    });

    it("refuses Basic Auth as a replacement for OIDC", async context => {
        await assert.rejects(startWebServer(context, settings => {
            settings.webserver.auth.sso.oidc.enabled = false;
            settings.webserver.basicAuth.enabled = true;
        }), /OIDC authentication must be enabled/);
    });

    it("refuses startup when OIDC configuration is missing", async context => {
        await assert.rejects(startWebServer(context, settings => {
            delete(settings.webserver.auth);
        }), /OIDC authentication must be enabled/);
    });

    it("validates OIDC configuration during startup", async context => {
        await assert.rejects(startWebServer(context, settings => {
            settings.webserver.auth.sso.oidc.clientSecret = "";
        }), /secret/);
    });

    it("completes OIDC login and applies the existing user/admin gates", async context => {
        const signingKeys = crypto.generateKeyPairSync("rsa", {modulusLength: 2048});
        const publicKey = {...signingKeys.publicKey.export({format: "jwk"}), kid: "test-signing-key", alg: "RS256", use: "sig"};
        const issuer = http.createServer((request, response) => {
            const issuerUrl = `http://127.0.0.1:${issuer.address().port}`;
            response.setHeader("Content-Type", "application/json");
            if (request.url === "/jwks") {
                response.end(JSON.stringify({keys: [publicKey]}));
                return;
            }
            response.end(JSON.stringify({
                issuer: issuerUrl,
                authorization_endpoint: `${issuerUrl}/authorize`,
                token_endpoint: `${issuerUrl}/token`,
                jwks_uri: `${issuerUrl}/jwks`,
                end_session_endpoint: `${issuerUrl}/logout`,
                response_types_supported: ["id_token"],
                id_token_signing_alg_values_supported: ["RS256"],
                subject_types_supported: ["public"]
            }));
        });
        issuer.listen(0, "127.0.0.1");
        context.after(() => new Promise(resolve => issuer.close(resolve)));
        await once(issuer, "listening");
        const issuerUrl = `http://127.0.0.1:${issuer.address().port}`;
        const {request, stopCamera} = await startWebServer(context, settings => {
            Object.assign(settings.webserver.auth.sso.oidc, {
                enabled: true,
                issuer: issuerUrl,
                groupMap: {admin: ["admins"], user: ["users"]}
            });
        });
        const killswitchResponse = await request("/_killswitch/camera", {method: "POST", redirect: "manual"});
        assert.equal(killswitchResponse.status, 302);
        await killswitchResponse.text();
        assert.equal(stopCamera.mock.callCount(), 0);

        const signIn = async groups => {
            const loginResponse = await request("/api/v2/profile/", {redirect: "manual"});
            assert.equal(loginResponse.status, 302);
            const location = new URL(loginResponse.headers.get("location"));
            assert.equal(location.origin, issuerUrl);
            assert.equal(location.searchParams.get("client_id"), "test-client");
            assert.equal(location.searchParams.get("scope"), "openid profile email");
            await loginResponse.text();

            const issuedAt = Math.floor(Date.now() / 1000);
            const tokenHeader = Buffer.from(JSON.stringify({alg: "RS256", kid: "test-signing-key"})).toString("base64url");
            const tokenClaims = Buffer.from(JSON.stringify({
                iss: issuerUrl,
                aud: "test-client",
                sub: "test-user",
                name: "Test User",
                email: "test@example.invalid",
                groups: groups,
                nonce: location.searchParams.get("nonce"),
                iat: issuedAt,
                exp: issuedAt + 300
            })).toString("base64url");
            const signingInput = `${tokenHeader}.${tokenClaims}`;
            const signature = crypto.sign("RSA-SHA256", Buffer.from(signingInput), signingKeys.privateKey).toString("base64url");
            const transactionCookies = loginResponse.headers.getSetCookie().map(cookie => cookie.split(";")[0]).join("; ");
            const callbackResponse = await request("/callback", {
                method: "POST",
                redirect: "manual",
                headers: {"Content-Type": "application/x-www-form-urlencoded", Cookie: transactionCookies},
                body: new URLSearchParams({
                    state: location.searchParams.get("state"),
                    id_token: `${signingInput}.${signature}`
                })
            });
            assert.equal(callbackResponse.status, 302, await callbackResponse.text());
            const sessionCookies = callbackResponse.headers.getSetCookie().map(cookie => cookie.split(";")[0]).join("; ");
            return {Cookie: sessionCookies};
        };

        const headers = await signIn(["users"]);
        const authenticatedProfile = await request("/api/v2/profile/", {headers: headers});
        assert.equal(authenticatedProfile.status, 200);
        const profile = await authenticatedProfile.json();
        assert.equal(profile.name, "Test User");
        assert.deepEqual(profile.roles, ["user"]);

        const userKillswitch = await request("/_killswitch/camera", {method: "POST", headers: {...headers, Origin: "http://localhost"}});
        assert.equal(userKillswitch.status, 403);
        await userKillswitch.text();
        assert.equal(stopCamera.mock.callCount(), 0);

        const adminHeaders = await signIn(["admins"]);
        const getKillswitch = await request("/_killswitch/camera", {headers: adminHeaders});
        assert.equal(getKillswitch.status, 405);
        await getKillswitch.text();

        for (const origin of [undefined, ...Array(6).fill("https://untrusted.example")]) {
            const crossSiteKillswitch = await request("/_killswitch/camera", {
                method: "POST",
                headers: {...adminHeaders, ...(origin ? {Origin: origin} : {})}
            });
            assert.equal(crossSiteKillswitch.status, 403);
            await crossSiteKillswitch.text();
        }
        assert.equal(stopCamera.mock.callCount(), 0);

        const adminKillswitch = await request("/_killswitch/camera", {method: "POST", headers: {...adminHeaders, Origin: "http://localhost"}});
        assert.equal(adminKillswitch.status, 200);
        await adminKillswitch.text();
        assert.equal(stopCamera.mock.callCount(), 1);

        const adminRuntime = await request("/api/v2/system/runtime/info", {headers: adminHeaders});
        assert.equal(adminRuntime.status, 200);
        assert.deepEqual((await adminRuntime.json()).phoenix, {canReincarnate: true, generation: 7});

        const runtimeResponse = await request("/api/v2/system/runtime/info", {headers: headers});
        assert.equal(runtimeResponse.status, 403);
        await runtimeResponse.text();

        const cameraSettingsResponse = await request("/api/v2/valetudo/config/duststreaming", {
            method: "PUT",
            headers: {...headers, "Content-Type": "application/json"},
            body: JSON.stringify({enabled: false})
        });
        assert.equal(cameraSettingsResponse.status, 403);
        await cameraSettingsResponse.text();
        assert.equal(stopCamera.mock.callCount(), 1);

        const adminCameraSettings = await request("/api/v2/valetudo/config/duststreaming", {
            method: "PUT",
            headers: {...adminHeaders, "Content-Type": "application/json"},
            body: JSON.stringify({enabled: false})
        });
        assert.equal(adminCameraSettings.status, 200);
        await adminCameraSettings.text();
        assert.equal(stopCamera.mock.callCount(), 2);

        const logoutResponse = await request("/logout", {headers: headers, redirect: "manual"});
        assert.equal(logoutResponse.status, 302);
        await logoutResponse.text();
    });

    it("starts TLS with configured certificate files and OIDC enabled", async context => {
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
            const socket = tls.connect({
                host: "127.0.0.1",
                port: webserver.webserver.address().port,
                rejectUnauthorized: false
            }, () => {
                socket.end();
                resolve();
            });
            socket.on("error", reject);
        });
    });

});
