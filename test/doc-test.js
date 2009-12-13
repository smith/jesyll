// Tests for doc.js

var assert = require("test/assert"),
    file = require("file"),
    json = require("json");

var log = require("jesyll/log"),
    doc = require("jesyll/doc");


exports.testParseFrontMatter = function() {
    assert.eq(
        {title: "Title", layout: "Layout"},
        doc.parseFrontMatter(["  title: Title \n", " layout: Layout \n"]));
}

exports.testParseFrontMatterJson = function() {
    assert.eq(
        {title: "Title", layout: "Layout"},
        doc.parseFrontMatter(
            ['{\n', '"title": "Title",', '"layout": "Layout"}'])
        );
}

exports.testExtractMetadata = function() {
    assert.eq(
        { year: 2009, month: 11, day: 11, title: "Welcome to Jesyll",
          filename: "_2009-11-11-Welcome-to-Jesyll", ext: "",
          "relative-path": "foo/_2009-11-11-Welcome-to-Jesyll",
        },
        doc.extractMetadata("foo/_2009-11-11-Welcome-to-Jesyll"));

    assert.eq(
        { year: 2009, month: 11, day: 11, title: "Welcome to Jesyll",
          filename: "2009-11-11-Welcome-to-Jesyll.textile", ext: "textile",
          "relative-path": "bar/baz/2009-11-11-Welcome-to-Jesyll.textile"
        },
        doc.extractMetadata("bar/baz/2009-11-11-Welcome-to-Jesyll.textile"));

    assert.eq(
        { title: "Welcome to Jesyll", 
          filename: "Welcome-to-Jesyll.textile", ext: "textile",
          "relative-path": "spam/Welcome-to-Jesyll.textile",
        },
        doc.extractMetadata("spam/Welcome-to-Jesyll.textile"));

    assert.eq(
        { title: "Welcome to Jesyll" ,
          filename: "Welcome-to-Jesyll", ext: "",
          "relative-path": "Welcome-to-Jesyll"
        },
        doc.extractMetadata("Welcome-to-Jesyll"));

    assert.eq(
        { title: "Welcome to Jesyll",
          filename: "__Welcome-to-Jesyll", ext: "",
          "relative-path": "__Welcome-to-Jesyll"
        },
        doc.extractMetadata("__Welcome-to-Jesyll"));
}

if (require.main === module.id)
    require("test/runner").run(exports);
