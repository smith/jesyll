var assert = require("test/assert"),
    jesyll = require("jesyll");

exports.testParseSourceDoc = function() {
    assert.isEqual("foo", jesyll.parseSourceDoc("foo"));
}

if (require.main === module.id)
    require("test/runner").run(exports);
