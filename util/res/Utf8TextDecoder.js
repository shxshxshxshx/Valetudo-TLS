const {isUtf8} = require("node:buffer");
const {TextDecoder} = require("node:util");

// The robot runtimes omit ICU, including TextDecoder's fatal mode. Keep strict UTF-8 validation for OIDC.
class Utf8TextDecoder extends TextDecoder {
    constructor(encoding = "utf-8", options = {}) {
        super(encoding, {...options, fatal: false});
        this.requireValidUtf8 = Boolean(options.fatal);

        if (this.requireValidUtf8 && this.encoding !== "utf-8") {
            throw new TypeError("Strict decoding is only supported for UTF-8");
        }
    }

    get fatal() {
        return this.requireValidUtf8;
    }

    decode(input, options = {}) {
        if (this.requireValidUtf8) {
            if (options.stream) {
                throw new TypeError("Strict streaming decoding is not supported by the robot runtime");
            }

            const bytes = ArrayBuffer.isView(input) ?
                new Uint8Array(input.buffer, input.byteOffset, input.byteLength) : new Uint8Array(input);

            if (!isUtf8(bytes)) {
                throw new TypeError("The encoded data is not valid UTF-8");
            }
        }

        return super.decode(input, options);
    }
}

module.exports = Utf8TextDecoder;
