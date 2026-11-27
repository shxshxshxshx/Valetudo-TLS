const assert = require("node:assert/strict");
const {describe, it} = require("node:test");

const Utf8TextDecoder = require("../../../../util/res/Utf8TextDecoder");

describe("UTF-8 decoding without ICU", () => {
    it("decodes valid UTF-8 and respects typed-array boundaries", () => {
        const decoder = new Utf8TextDecoder("utf-8", {fatal: true});
        const bytes = Buffer.from([0xff, 0xc3, 0xbc, 0xff]);
        assert.equal(decoder.decode(bytes.subarray(1, 3)), "ü");
        assert.equal(decoder.fatal, true);
    });

    it("rejects malformed UTF-8 rather than replacing invalid bytes", () => {
        const decoder = new Utf8TextDecoder("utf-8", {fatal: true});
        for (const bytes of [[0xff], [0xc0, 0xaf], [0xed, 0xa0, 0x80], [0xf0, 0x9f]]) {
            assert.throws(() => decoder.decode(Uint8Array.from(bytes)), /not valid UTF-8/);
        }
    });

    it("preserves non-fatal decoding and fails closed for unsupported strict streaming", () => {
        assert.equal(new Utf8TextDecoder().decode(Uint8Array.from([0xff])), "�");
        assert.throws(() => new Utf8TextDecoder("utf-8", {fatal: true}).decode(new Uint8Array(), {stream: true}), /streaming/);
    });
});
