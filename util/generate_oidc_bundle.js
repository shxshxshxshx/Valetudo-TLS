const babel = require("@babel/core");
const fs = require("fs");
const path = require("path");
const webpack = require("webpack");

const bundlePath = path.join(__dirname, "../backend/lib/res/express-openid-connect.cjs");
// pkg supports CommonJS in its snapshot, but its ESM resolver bypasses the snapshot filesystem.
webpack({
    mode: "production",
    target: "node22",
    entry: require.resolve("express-openid-connect"),
    devtool: false,
    output: {
        path: path.join(__dirname, "../backend/lib/res"),
        filename: "express-openid-connect.cjs",
        library: {type: "commonjs2"}
    },
    // Share the application's Express instance rather than bundling a second copy.
    externals: {express: "commonjs express"},
    plugins: [new webpack.ProvidePlugin({
        TextDecoder: path.join(__dirname, "res/Utf8TextDecoder.js"),
        fetch: [path.join(__dirname, "res/Fetch.js"), "fetch"],
        Headers: [path.join(__dirname, "res/Fetch.js"), "Headers"],
        Request: [path.join(__dirname, "res/Fetch.js"), "Request"],
        Response: [path.join(__dirname, "res/Fetch.js"), "Response"]
    }), new webpack.BannerPlugin({
        banner: "// @ts-nocheck\n/* eslint-disable */",
        raw: true,
        stage: webpack.Compilation.PROCESS_ASSETS_STAGE_REPORT
    })]
}, (error, stats) => {
    if (error || stats.hasErrors()) {
        console.error(error || stats.toString({all: false, errors: true}));
        process.exitCode = 1;
        return;
    }

    // The robot runtimes omit ICU, so expand Unicode property escapes after minification.
    const transformed = babel.transformFileSync(bundlePath, {
        babelrc: false,
        configFile: false,
        compact: true,
        sourceType: "script",
        plugins: [["@babel/plugin-transform-unicode-property-regex", {useUnicodeFlag: false}]]
    });
    fs.writeFileSync(bundlePath, transformed.code);
    console.log("Generated CommonJS OIDC bundle for packaged robot runtimes");
});
