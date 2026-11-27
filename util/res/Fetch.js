const fetchApi = require("@whatwg-node/node-fetch");

// openid-client checks Web API brands on prototypes; the ponyfill puts them on instances.
for (const className of ["Headers", "Request", "Response"]) {
    Object.defineProperty(fetchApi[className].prototype, Symbol.toStringTag, {
        value: className,
        configurable: true
    });
}

module.exports = fetchApi;
