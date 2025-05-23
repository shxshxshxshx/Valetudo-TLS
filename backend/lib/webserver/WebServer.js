const basicAuth = require("express-basic-auth");
const compression = require("compression");
const dynamicMiddleware = require("express-dynamic-middleware");
const express = require("express");
const http = require("http");
const https = require("https");
const path = require("path");
const swaggerUi = require("swagger-ui-express");
const swaggerValidation = require("openapi-validator-middleware");

const listEndpoints = require("express-list-endpoints");

const Logger = require("../Logger");

const notFoundPages = require("./res/404");

const Middlewares = require("./middlewares");
const ProfileRouter = require("./ProfileRouter");
const RobotRouter = require("./RobotRouter");
const ValetudoRouter = require("./ValetudoRouter");


const fs = require("fs");
const MQTTRouter = require("./MQTTRouter");
const NetworkAdvertisementManagerRouter = require("./NetworkAdvertisementManagerRouter");
const NTPClientRouter = require("./NTPClientRouter");
const SSDPRouter = require("./SSDPRouter");
const SystemRouter = require("./SystemRouter");
const TimerRouter = require("./TimerRouter");
const Tools = require("../utils/Tools");
const UpdaterRouter = require("./UpdaterRouter");
const ValetudoEventRouter = require("./ValetudoEventRouter");
const OidcAuth = require("express-openid-connect");
const {isAdmin, isUser} = require("./middlewares/auth/OidcMiddleware");

class WebServer {
    /**
     * @param {object} options
     * @param {import("../core/ValetudoRobot")} options.robot
     * @param {import("../mqtt/MqttController")} options.mqttController
     * @param {import("../NetworkAdvertisementManager")} options.networkAdvertisementManager
     * @param {import("../NTPClient")} options.ntpClient
     * @param {import("../updater/Updater")} options.updater
     * @param {import("../scheduler/Scheduler")} options.scheduler
     * @param {import("../ValetudoEventStore")} options.valetudoEventStore
     * @param {import("../Configuration")} options.config
     * @param {import("../utils/ValetudoHelper")} options.valetudoHelper
     */
    constructor(options) {
        const self = this;

        this.robot = options.robot;
        this.config = options.config;
        this.valetudoHelper = options.valetudoHelper;

        this.valetudoEventStore = options.valetudoEventStore;

        this.webserverConfig = this.config.get("webserver");

        this.port = this.webserverConfig.port;

        this.basicAuthInUse = false; //TODO: redo auth
        this.oidcInUse = false;
        this.sslInUse = false;
        this.sslConfig = {};

        this.app = express();
        this.app.use(compression());
        this.app.use(express.json());

        this.app.disable("x-powered-by");

        this.app.use(Middlewares.CSPMiddleware);
        this.app.use(Middlewares.VersionMiddleware);
        this.app.use(Middlewares.ServerMiddleware);

        if (this.webserverConfig.blockExternalAccess) {
            this.app.use(Middlewares.ExternalAccessCheckMiddleware);
        }

        const authMiddleware = this.createAuthMiddleware();
        const oidcMiddleware = OidcAuth.auth({
            issuerBaseURL: this.webserverConfig.auth.sso.oidc.issuer,
            baseURL: this.webserverConfig.baseUrl,
            clientID: this.webserverConfig.auth.sso.oidc.clientId,
            secret: this.webserverConfig.auth.sso.oidc.clientSecret,
            idTokenSigningAlg: this.webserverConfig.auth.sso.oidc.tokenSigningAlgorithm ?? "RS256",
            idpLogout: true
        });
        const dynamicAuth = dynamicMiddleware.create([]);
        this.app.use(dynamicAuth.handle());

        if (this.webserverConfig.auth.basicAuth.enabled === true && !this.oidcInUse) {
            dynamicAuth.use(authMiddleware);
            this.basicAuthInUse = true;
        }
        if (this.webserverConfig.auth.sso.oidc.enabled === true) {
            dynamicAuth.use(oidcMiddleware);
            this.oidcInUse = true;
        }
        if (this.webserverConfig.ssl.enabled === true) {
            this.sslInUse = true;
            this.sslConfig = {
                key: fs.readFileSync(this.webserverConfig.ssl.keyLocation),
                cert: fs.readFileSync(this.webserverConfig.ssl.certLocation)
            };
        }

        this.config.onUpdate((key) => {
            if (key === "webserver") {
                this.webserverConfig = this.config.get("webserver");

                if (this.oidcInUse && !this.webserverConfig.auth.sso.oidc.enabled) {
                    dynamicAuth.unuse(oidcMiddleware);
                    this.oidcInUse = false;
                } else if (!this.oidcInUse && this.webserverConfig.auth.sso.oidc.enabled) {
                    dynamicAuth.use(oidcMiddleware);
                    this.oidcInUse = true;
                }

                if (this.basicAuthInUse && !this.webserverConfig.auth.basicAuth.enabled) {
                    dynamicAuth.unuse(authMiddleware);
                    this.basicAuthInUse = false;
                } else if (!this.basicAuthInUse && (this.webserverConfig.auth.basicAuth.enabled && !this.webserverConfig.auth.sso.oidc.enabled)) {
                    dynamicAuth.use(authMiddleware);
                    this.basicAuthInUse = true;
                }

                if (this.sslInUse && !this.webserverConfig.ssl.enabled) {
                    this.sslInUse = false;
                } else if (!this.sslInUse && this.webserverConfig.ssl.enabled) {
                    this.sslInUse = true;
                }
            }
        });

        let server;
        if (this.sslInUse) {
            server = https.createServer(this.sslConfig, this.app);
        } else {
            server = http.createServer(this.app);
        }

        this.loadApiSpec();
        this.validator = function superBasicValidationMiddleware(req, res, next) {
            // We can save a lot of code in our routers by always at least making sure that req.body exists
            // even if it is not being validated by the schema
            if (req.method === "PUT" || req.method === "POST") {
                if (Tools.IS_EMPTY_OBJECT_OR_UNDEFINED_OR_NULL(req.body)) {
                    res.sendStatus(400);
                } else {
                    next();
                }
            } else {
                next();
            }
        };

        if (this.openApiSpec) {
            this.app.use("/swagger/", swaggerUi.serve, swaggerUi.setup(this.openApiSpec, {
                customCss: ".swagger-ui .topbar { display: none }"
            }));

            swaggerValidation.init(this.openApiSpec);
            this.validator = swaggerValidation.validate;
        }

        this.robotRouter = new RobotRouter({robot: this.robot, validator: this.validator});
        this.valetudoRouter = new ValetudoRouter({config: this.config, robot: this.robot, validator: this.validator});

        this.app.use("/api/v2/profile/", new ProfileRouter({config: this.config, validator: this.validator, valetudoHelper: this.valetudoHelper}).getRouter());

        this.app.get("/custom-logout", (req, res) => res.send("Bye!"));

        this.app.use(express.static(path.join(__dirname, "../../..", "frontend/build")));

        this.app.use((res, req, next) => isUser(res, req, next, this.config));

        this.app.use("/api/v2/robot/", this.robotRouter.getRouter());

        this.app.use("/api/v2/valetudo/", this.valetudoRouter.getRouter());

        this.app.use("/api/v2/mqtt/", (res, req, next) => isAdmin(res, req, next, this.config), new MQTTRouter({config: this.config, mqttController: options.mqttController, validator: this.validator}).getRouter());

        this.app.use("/api/v2/networkadvertisement/", (res, req, next) => isAdmin(res, req, next, this.config), new NetworkAdvertisementManagerRouter({config: this.config, networkAdvertisementManager: options.networkAdvertisementManager, validator: this.validator}).getRouter());

        this.app.use("/api/v2/ntpclient/", (res, req, next) => isAdmin(res, req, next, this.config), new NTPClientRouter({config: this.config, ntpClient: options.ntpClient, validator: this.validator}).getRouter());

        this.app.use("/api/v2/timers/", (res, req, next) => isAdmin(res, req, next, this.config), new TimerRouter({config: this.config, robot: this.robot, validator: this.validator, scheduler: options.scheduler}).getRouter());

        this.app.use("/api/v2/system/", (res, req, next) => isAdmin(res, req, next, this.config), new SystemRouter({}).getRouter());

        this.app.use("/api/v2/events/", new ValetudoEventRouter({valetudoEventStore: this.valetudoEventStore, validator: this.validator}).getRouter());

        this.app.use("/api/v2/updater/", (res, req, next) => isAdmin(res, req, next, this.config), new UpdaterRouter({config: this.config, updater: options.updater, validator: this.validator}).getRouter());

        this.app.use("/_ssdp/", new SSDPRouter({config: this.config, robot: this.robot, valetudoHelper: this.valetudoHelper}).getRouter());

        this.app.get("/api/v2", (req, res) => {
            let endpoints = listEndpoints(this.app);
            let endpointsMap;
            endpoints = endpoints.sort((a,b) => {
                if (a.path > b.path) {
                    return 1;
                } else if (b.path > a.path) {
                    return -1;
                } else {
                    return 0;
                }
            });
            endpointsMap = endpoints.reduce((acc, curr) => {
                acc[curr.path] = {methods: curr.methods}; return acc;
            }, {});

            res.json(endpointsMap);
        });


        this.robot.initModelSpecificWebserverRoutes(this.app);


        this.app.use((err, req, res, next) => {
            if (err instanceof swaggerValidation.InputValidationError) {
                Logger.warn(`Received "${req.method} "to "${req.originalUrl}" with invalid payload`, err.errors);
                res.status(400).json({message: "Request payload is invalid.", error: err.errors});
            } else {
                Logger.error("Unhandled WebServer Error", err);
                res.sendStatus(500);
            }
        });

        this.app.get("*", (req, res) => {
            res.status(404).send(Tools.GET_RANDOM_ARRAY_ELEMENT(Object.values(notFoundPages)));
        });

        server.listen(this.port, function() {
            Logger.info("Webserver running on port", self.port);
        });

        this.webserver = server;
    }

    /**
     * @private
     * @returns {(req: any, res: any, next: any) => void}
     */
    createAuthMiddleware() {
        const basicAuthMiddleware = basicAuth({
            authorizer: (username, password) => {
                const basicAuthConf = this.config.get("webserver").basicAuth;

                const userMatches = basicAuth.safeCompare(username, basicAuthConf.username);
                const passwordMatches = basicAuth.safeCompare(password, basicAuthConf.password);

                return userMatches && passwordMatches;
            },
            challenge: true,
            unauthorizedResponse: (req) => {
                return req.auth ? "Invalid credentials" : "No credentials provided";
            }
        });

        return function authMiddleware(req, res, next) {
            try {
                basicAuthMiddleware(req, res, next);
            } catch (e) { /* basicAuth throws [ERR_HTTP_HEADERS_SENT] here if invalid credentials are sent */
                Logger.error("Error in BasicAuthMiddleware", e);
            }
        };
    }

    /**
     * Shutdown webserver
     *
     * @public
     * @returns {Promise<void>}
     */
    shutdown() {
        return new Promise((resolve, reject) => {
            Logger.debug("Webserver shutdown in progress...");
            this.robotRouter.shutdown();
            this.valetudoRouter.shutdown();

            //closing the server
            this.webserver.close(() => {
                Logger.debug("Webserver shutdown done");
                resolve();
            });
        });
    }

    /**
     * @private
     */
    loadApiSpec() {
        let spec;

        try {
            spec = JSON.parse(fs.readFileSync(path.join(__dirname, "../res/valetudo.openapi.schema.json")).toString());
        } catch (e) {
            Logger.warn("Failed to load OpenApi spec. Swagger endpoint and payload validation will be unavailable.", e.message);

            return;
        }


        const capabilityRoutePathRegex = /\/api\/v2\/robot\/capabilities\/(?<capabilityName>[A-Za-z]+)/;
        const supportedCapabilities = Object.keys(this.robot.capabilities);

        Object.keys(spec.paths).forEach(pathName => {
            const regexResult = capabilityRoutePathRegex.exec(pathName);
            const capabilityName = regexResult?.groups?.capabilityName;

            if (capabilityName !== undefined && !supportedCapabilities.includes(capabilityName)) {
                delete(spec.paths[pathName]);
            }
        });

        spec.tags = spec.tags.filter(tag => {
            return !(tag.name.endsWith("Capability") && !supportedCapabilities.includes(tag.name));
        });


        this.openApiSpec = spec;
    }
}

module.exports = WebServer;
