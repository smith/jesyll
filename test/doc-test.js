// Tests for doc.js

var assert = require("test/assert"),
    file = require("file"),
    json = require("json");

var log = require("oil/log"),
    doc = require("recipe/doc");


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
        { year: 2009, month: 11, day: 11, title: "Welcome to Recipe",
          filename: "_2009-11-11-Welcome-to-Recipe", ext: "",
          "relative-path": "foo/_2009-11-11-Welcome-to-Recipe",
        },
        doc.extractMetadata("foo/_2009-11-11-Welcome-to-Recipe"));

    assert.eq(
        { year: 2009, month: 11, day: 11, title: "Welcome to Recipe",
          filename: "2009-11-11-Welcome-to-Recipe.textile", ext: "textile",
          "relative-path": "bar/baz/2009-11-11-Welcome-to-Recipe.textile"
        },
        doc.extractMetadata("bar/baz/2009-11-11-Welcome-to-Recipe.textile"));

    assert.eq(
        { title: "Welcome to Recipe", 
          filename: "Welcome-to-Recipe.textile", ext: "textile",
          "relative-path": "spam/Welcome-to-Recipe.textile",
        },
        doc.extractMetadata("spam/Welcome-to-Recipe.textile"));

    assert.eq(
        { title: "Welcome to Recipe" ,
          filename: "Welcome-to-Recipe", ext: "",
          "relative-path": "Welcome-to-Recipe"
        },
        doc.extractMetadata("Welcome-to-Recipe"));

    assert.eq(
        { title: "Welcome to Recipe",
          filename: "__Welcome-to-Recipe", ext: "",
          "relative-path": "__Welcome-to-Recipe"
        },
        doc.extractMetadata("__Welcome-to-Recipe"));
}

if (require.main === module.id)
    require("test/runner").run(exports);
