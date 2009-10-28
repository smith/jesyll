var assert = require("test/assert"),
    jesyll = require("jesyll");

exports.testDummy = function() {
    assert.isEqual("foo", jesyll.dummy("foo"));
}

if (require.main === module.id)
    require("test/runner").run(exports);
