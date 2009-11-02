var assert = require("test/assert"),
    json = require("json"),
    jesyll = require("jesyll");


exports.testParseSourceDoc = function() {
    assert.isEqual("foo", jesyll.parseSourceDoc("foo"));
}

exports.testParseMetadata = function() {
    assert.eq(
        {title: "Title", layout: "Layout"},
        jesyll.parseMetadata(["  title: Title \n", " layout: Layout \n"]));
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

exports.testComposite = function() {
    var defaults = {a: 0, b: 0, c: 0};
    var config = {a: 100, b: 200};
    var flags = {a: 3, c: 5};

    var c = Composite(defaults, config, flags);

    print("c: " + c.get('a') + " " + c.get('b') + " " + c.get('c'));
    assert.isEqual(c.get('a'), 3);
    assert.isEqual(c.get('b'), 200);
    assert.isEqual(c.get('c'), 5);

    var flags2 = {};
    var c = new Composite(defaults, config, flags2);
    assert.isEqual(c.get('a'), 100);
    assert.isEqual(c.get('b'), 200);
    assert.isEqual(c.get('c'), 0);
}

if (require.main === module.id)
    require("test/runner").run(exports);
