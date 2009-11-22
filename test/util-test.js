// Tests for util.js

var assert = require("test/assert"),
    util = require("jesyll/util");

exports.testComposite = function() {
    var defaults = {a: 0, b: 0, c: 0};
    var config = {a: 100, b: 200};
    var flags = {a: 3, c: 5};

    var c = util.ObjComposite(defaults, config, flags);

    print("c: " + c.get('a') + " " + c.get('b') + " " + c.get('c'));
    assert.isEqual(c.get('a'), 3);
    assert.isEqual(c.get('b'), 200);
    assert.isEqual(c.get('c'), 5);

    var flags2 = {};
    var c = new util.ObjComposite(defaults, config, flags2);
    assert.isEqual(c.get('a'), 100);
    assert.isEqual(c.get('b'), 200);
    assert.isEqual(c.get('c'), 0);
}

exports.testObjectStack = function() {
    var defaults = {a: 0, b: 0, c: 0};
    var config = {a: 100, b: 200};
    var flags = {a: 3, c: 5};

    var c = util.ObjectStack(defaults, config, flags);

    print("c: " + c.get('a') + " " + c.get('b') + " " + c.get('c'));
    assert.isEqual(c.get('a'), 3);
    assert.isEqual(c.get('b'), 200);
    assert.isEqual(c.get('c'), 5);

    var flags2 = {};
    var c = new util.ObjectStack(defaults, config, flags2);
    assert.isEqual(c.get('a'), 100);
    assert.isEqual(c.get('b'), 200);
    assert.isEqual(c.get('c'), 0);

    assert.isEqual(
        c.toObject(),
        { a: 100, b: 200, c: 0 });
}


if (require.main === module.id)
    require("test/runner").run(exports);
