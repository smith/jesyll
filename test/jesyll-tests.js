var assert = require("test/assert"),
    jesyll = require("jesyll");

exports.testParseSourceDoc = function() {
    assert.isEqual("foo", jesyll.parseSourceDoc("foo"));
}

exports.testParseMetadata = function() {
    assert.eq(
        {title: "Title", layout: "Layout"},
        jesyll.parseMetadata(["  title: Title \n", " layout: Layout \n"]));
}

if (require.main === module.id)
    require("test/runner").run(exports);
