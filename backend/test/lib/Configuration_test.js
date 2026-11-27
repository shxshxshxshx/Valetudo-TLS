const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {describe, it} = require("node:test");

const Configuration = require("../../lib/Configuration");
const defaults = require("../../lib/res/default_config.json");

describe("Authentication configuration migration", () => {
    it("preserves legacy credentials and robot settings when adding TLS/OIDC defaults", context => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), "valetudo-config-test-"));
        context.after(() => fs.rmSync(directory, {recursive: true, force: true}));
        const configPath = path.join(directory, "config.json");
        const legacyConfig = structuredClone(defaults);
        legacyConfig.robot.implementation = "MockValetudoRobot";
        legacyConfig.webserver = {
            port: 8080,
            blockExternalAccess: false,
            basicAuth: {enabled: true, username: "legacy-user", password: "legacy-password"}
        };
        fs.writeFileSync(configPath, JSON.stringify(legacyConfig));

        const previousConfigPath = process.env.VALETUDO_CONFIG_PATH;
        let config;
        try {
            process.env.VALETUDO_CONFIG_PATH = configPath;
            config = new Configuration();
        } finally {
            if (previousConfigPath === undefined) {
                delete(process.env.VALETUDO_CONFIG_PATH);
            } else {
                process.env.VALETUDO_CONFIG_PATH = previousConfigPath;
            }
        }

        assert.deepEqual(config.get("webserver").auth.basicAuth, legacyConfig.webserver.basicAuth);
        assert.equal(config.get("webserver").port, 8080);
        assert.equal(config.get("webserver").ssl.enabled, false);
        assert.equal(config.get("webserver").auth.sso.oidc.enabled, false);
        assert.equal(config.get("robot").implementation, "MockValetudoRobot");
        assert.equal(config.get("webserver").basicAuth, undefined);
        assert.equal(fs.existsSync(`${configPath}.backup`), false);
        assert.deepEqual(JSON.parse(fs.readFileSync(configPath, "utf8")), config.getAll());
    });
});
