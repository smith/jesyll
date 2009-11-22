var assert = require("test/assert"),
    file = require("file"),
    json = require("json"),
    jesyll = require("jesyll");

exports.testParseFrontMatter = function() {
    assert.eq(
        {title: "Title", layout: "Layout"},
        jesyll.parseFrontMatter(["  title: Title \n", " layout: Layout \n"]));
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
          "relative-path": "bar/baz/2009-11-11-Welcome-to-Jesyll.textile",
          "body-type": "textile"
        },
        jesyll.extractMetadata("bar/baz/2009-11-11-Welcome-to-Jesyll.textile"));

    assert.eq(
        { title: "Welcome to Jesyll", "body-type": "textile",
          filename: "Welcome-to-Jesyll.textile", ext: "textile",
          "relative-path": "spam/Welcome-to-Jesyll.textile",
          "body-type": "textile"
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

exports.testWalk = function() {
    return;  // DISABLED
    //var paths = jesyll.walk('.');
    var paths = jesyll.walk('/home/andy/hg/json-template');
    for (var i=0; i<paths.length; i++) {
      print(paths[i]);
    }
}

exports.testFileSystem = function() {
    var fs = jesyll.FileSystem('');
    print(fs.list());
    print(fs.open('nw.sh', 'r'));
    //fs.mkdir('junk');
    //assert.eq('ds', fs.contentsOf('nw.sh1'));
    //assert.eq('ds', fs.contentsOf('nw.sh'));

    fs = jesyll.FileSystem('/usr/');
    print(fs.path());
    print(fs.path('foo'));
    assert.eq(fs.path(), '/usr/')
    assert.eq(fs.path('lib'), '/usr/lib')

    fs = jesyll.FileSystem('/usr');
    assert.eq(fs.path(), '/usr/')
    assert.eq(fs.path('lib'), '/usr/lib')

}

if (require.main === module.id)
    require("test/runner").run(exports);
