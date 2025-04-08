const express = require("express");

const { mapRoles } = require("./middlewares/auth/OidcMiddleware");

class ProfileRouter {
    /**
     *
     * @param {object} options
     * @param {import("../Configuration")} options.config
     * @param {import("../utils/ValetudoHelper")} options.valetudoHelper
     * @param {*} options.validator
     */
    constructor(options) {
        this.router = express.Router({mergeParams: true});

        this.config = options.config;
        this.validator = options.validator;
        this.valetudoHelper = options.valetudoHelper;

        this.initRoutes();
    }

    initRoutes() {
        this.router.get("/", (req, res) => {
            let webserverConfig = this.config.get("webserver");
            if (webserverConfig.auth.sso.oidc.enabled) {
                res.json({
                    name: req.oidc.user.name,
                    email: req.oidc.user.email,
                    avatar: req.oidc.user.avatar,
                    roles: mapRoles(req.oidc.user.groups, this.config),
                    ssoEnabled: true
                });
            } else if (webserverConfig.auth.basicAuth.enabled) {
                res.json({
                    name: webserverConfig.auth.basicAuth.username,
                    email: "",
                    avatar: "",
                    roles: ["admin", "user"],
                    ssoEnabled: false
                });
            } else {
                res.json({
                    name: "Valetudo",
                    email: "",
                    avatar: "",
                    roles: ["admin", "user"],
                    ssoEnabled: false
                });
            }
        });
    }

    getRouter() {
        return this.router;
    }
}

module.exports = ProfileRouter;
