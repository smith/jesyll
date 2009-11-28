// Tests for jesyll.js

var assert = require("test/assert"),
    file = require("file"),
    json = require("json");

var log = require("jesyll/log"),
    jesyll = require("jesyll");

exports.testParseFrontMatter = function() {
    assert.eq(
        {title: "Title", layout: "Layout"},
        jesyll.parseFrontMatter(["  title: Title \n", " layout: Layout \n"]));
}

exports.testParseFrontMatterJson = function() {
    assert.eq(
        {title: "Title", layout: "Layout"},
        jesyll.parseFrontMatter(
            ['{\n', '"title": "Title",', '"layout": "Layout"}'])
        );
}

exports.testExtractMetadata = function() {
    assert.eq(
        { year: 2009, month: 11, day: 11, title: "Welcome to Jesyll",
          filename: "_2009-11-11-Welcome-to-Jesyll", ext: "",
          "relative-path": "foo/_2009-11-11-Welcome-to-Jesyll",
        },
        jesyll.extractMetadata("foo/_2009-11-11-Welcome-to-Jesyll"));

    assert.eq(
        { year: 2009, month: 11, day: 11, title: "Welcome to Jesyll",
          filename: "2009-11-11-Welcome-to-Jesyll.textile", ext: "textile",
          "relative-path": "bar/baz/2009-11-11-Welcome-to-Jesyll.textile"
        },
        jesyll.extractMetadata("bar/baz/2009-11-11-Welcome-to-Jesyll.textile"));

    assert.eq(
        { title: "Welcome to Jesyll", 
          filename: "Welcome-to-Jesyll.textile", ext: "textile",
          "relative-path": "spam/Welcome-to-Jesyll.textile",
        },
        jesyll.extractMetadata("spam/Welcome-to-Jesyll.textile"));

    assert.eq(
        { title: "Welcome to Jesyll" ,
          filename: "Welcome-to-Jesyll", ext: "",
          "relative-path": "Welcome-to-Jesyll"
        },
        jesyll.extractMetadata("Welcome-to-Jesyll"));

    assert.eq(
        { title: "Welcome to Jesyll",
          filename: "__Welcome-to-Jesyll", ext: "",
          "relative-path": "__Welcome-to-Jesyll"
        },
        jesyll.extractMetadata("__Welcome-to-Jesyll"));
}


// Demo of Object.create, for posterity
exports.testObject = function() {
    var b = {x:1, y:1};
    print(json.stringify(b));
    var c = Object.create(b);
    print(json.stringify(c));
    c.x = 9;
    c.z = 7;
    print(json.stringify(c));
    print(c.x + " " + c.y + " " + c.z);

    var config = {a: 100, b: 200};
    var flags = {a: 3, c: 5};
    var options = Object.create(config);
    for (var name in flags) { 
      options[name] = flags[name];
    }
    print("config: " + config.a + " " + config.b + " " + config.c);
    print("flags: " + flags.a + " " + flags.b + " " + flags.c);
    print("options: " + options.a + " " + options.b + " " + options.c);
}


if (require.main === module.id)
    require("test/runner").run(exports);
