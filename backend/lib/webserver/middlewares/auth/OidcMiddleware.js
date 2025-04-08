const Configuration = require("../../../Configuration");

const isAdmin = function isAdmin(req, res, next, config) {
    if (!config.get("webserver").auth.sso.oidc.enabled) { //Skip validation if OIDC is disabled
        return next();
    }

    if (mapRoles(req.oidc.user.groups, config).includes("admin")) {
        return next();
    } else {
        res.status(403).json({error: "InsufficientPermissions"});
    }
};

const isUser = function isUser(req, res, next, config) {
    if (!config.get("webserver").auth.sso.oidc.enabled) { //Skip validation if OIDC is disabled
        return next();
    }

    if (mapRoles(req.oidc.user.groups, config).includes("user")) {
        return next();
    } else if (mapRoles(req.oidc.user.groups, config).includes("admin")) { //Also Permit Admins
        return next();
    } else {
        res.status(403).json({error: "InsufficientPermissions"});
    }
};



/**
 * @param {string[]} groups
 * @param {Configuration} config
 * @return {string[]}
 */
const mapRoles = function mapRoles(groups, config) {
    let webserverConfig = config.get("webserver");
    let roles = [];
    if (webserverConfig.auth.sso.oidc.groupMap === undefined) {
        return ["admin", "user"];
    }

    if (webserverConfig.auth.sso.oidc.groupMap.admin === undefined || webserverConfig.auth.sso.oidc.groupMap.admin.length === 0) {
        roles.push("admin"); // Default everybody to admin if no admin groups are configured
    } else if (webserverConfig.auth.sso.oidc.groupMap.admin.filter(group => groups.includes(group)).length > 0) {
        roles.push("admin");
    }
    if (webserverConfig.auth.sso.oidc.groupMap.user === undefined || webserverConfig.auth.sso.oidc.groupMap.user.length === 0) {
        roles.push("user"); // Default everybody to user if no user groups are configured
    } else if (webserverConfig.auth.sso.oidc.groupMap.user.filter(group => groups.includes(group)).length > 0) {
        roles.push("user");
    }
    return roles;
};


module.exports = {
    isAdmin: isAdmin,
    isUser: isUser,
    mapRoles: mapRoles
};
