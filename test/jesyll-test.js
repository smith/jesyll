// Tests for jesyll.js

var assert = require("test/assert"),
    file = require("file"),
    json = require("json");

var log = require("jesyll/log"),
    jesyll = require("jesyll");

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
