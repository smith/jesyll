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

exports.testVarStack = function() {
    var defaults = {a: 0, b: 0, c: 0};
    var config = {a: 100, b: 200};
    var flags = {a: 3, c: 5};

    var c = util.VarStack(defaults, config, flags);

    assert.isEqual(c.get('a'), 3);
    assert.isEqual(c.get('b'), 200);
    assert.isEqual(c.get('c'), 5);

    var flags2 = {};
    var c = new util.VarStack(defaults, config, flags2);
    assert.isEqual(c.get('a'), 100);
    assert.isEqual(c.get('b'), 200);
    assert.isEqual(c.get('c'), 0);

    assert.eq(
        c.toObject(),
        { a: 100, b: 200, c: 0 });

    c.push({a: 199, d: 99});
    assert.eq(
        c.toObject(),
        { a: 199, b: 200, c: 0, d: 99 });

    var top = c.pop();
    assert.eq(top, {a: 199, d: 99});

    // The same as it was before
    assert.eq(
        c.toObject(),
        { a: 100, b: 200, c: 0 });
}

exports.testObjectStackTemplates = function() {
    var o1 = {foo: "bar", spam: "eggs"};
    var o2 = {foo: "ham", $spam: "spam is {foo}"};

    var c = util.VarStack(o1, o2);

    assert.isEqual(c.get('foo'), 'ham');
    assert.isEqual(c.get('spam'), 'spam is ham');

    // Here I change the template
    var o3 = {foo: "ham", $spam: "spam is not {foo}"};
    c.push(o3);
    assert.isEqual(c.get('spam'), 'spam is not ham');
}

exports.testTemplateBelowValue= function() {
    var o1 = {foo: "bar", spam: "eggs"};
    var o2 = {foo: "ham", $spam: "spam is {foo}"};

    var c = util.VarStack(o1, o2);

    assert.isEqual(c.get('foo'), 'ham');
    assert.isEqual(c.get('spam'), 'spam is ham');

    // Here I change the value from the template
    var o3 = {foo: "spam"};
    c.push(o3);
    assert.isEqual('spam is spam', c.get('spam'));
}

exports.testTemplateWithFileSystem= function() {
    var o1 = {foo: "bar", spam: "eggs"};
    var o2 = {foo: "ham", '&spam': "spam-file.txt"};

    var c = util.VarStack(o1, o2);

    assert.isEqual(c.get('foo'), 'ham');
    try {
      c.get('spam');
    } catch (e) {
      assert.eq('NoFileSystem', e.name);
      var gotError = true;
    }
    assert.eq(true, gotError);

    var fs = {
      contentsOf: function(name) {
        return '<file contents>';
      }
    }
    var c = util.VarStack(o1, o2).useFileSystem(fs);
    assert.isEqual('ham', c.get('foo'));
    assert.isEqual('<file contents>', c.get('spam'));
}


if (require.main === module.id)
    require("test/runner").run(exports);
