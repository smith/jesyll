// Tests for util.js

var assert = require("test/assert"),
    util = require("jesyll/util");

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

exports.testVarStackTemplates = function() {
    var o1 = {foo: "bar", spam: "eggs"};
    var o2 = {foo: "ham", $spam: "spam is {foo}"};

    var c = util.VarStack(o1, o2);

    assert.isEqual(c.get('foo'), 'ham');
    // The template is on the same level as the variable here
    assert.isEqual(c.get('spam'), 'spam is ham');

    // Here I change the template
    var o3 = {foo: "ham", $spam: "spam is not {foo}"};
    c.push(o3);
    assert.isEqual(c.get('spam'), 'spam is not ham');
}

exports.testVarStackDoubleTemplates = function() {
    var o1 = {baseUrl: "http://foo", spam: "eggs"};
    var o2 = {$url: "{baseUrl}/index.html"};
    var o3 = {$link: '<a href="{baseUrl}">Link</a>"'};

    var vars = util.VarStack(o1, o2);

    assert.isEqual('http://foo/index.html', vars.get('url'));

    assert.isEqual(
        '<a href="http://foo/index.html">Link</a>', vars.get('link'));
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

exports.testTemplateTakesPrecedenceOverValue = function() {
    var o1 = {foo: "bar", spam: "eggs"};
    var o2 = {$foo: "{spam}"};

    var c = util.VarStack(o1);

    assert.isEqual('bar', c.get('foo'));

    c.push(o2);
    assert.isEqual('eggs', c.get('foo'));

    c.pop();
    assert.isEqual('bar', c.get('foo'));
}

exports.testInfiniteLoop = function() {
    var o1 = {foo: "bar", spam: "eggs"};
    var o2 = {$foo: "{foo}"};

    var c = util.VarStack(o1, o2);
    print('RUNNING');

    assert.isEqual('eggs', c.get('foo'));
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

exports.testPrepend = function() {
    var o3 = {foo: "bar", spam: "eggs"},
        o4 = {foo: "ham", $spam: "spam is {foo}"};

    var c = util.VarStack(o3, o4);

    assert.isEqual(c.get('foo'), 'ham');
    assert.isEqual(c.get('spam'), 'spam is ham');

    var o1 = {name: "bob", age: 10},
        o2 = {name: "carol"};

    // Order is: o1, o2, o3, o4
    c.prepend(o1, o2);

    assert.isEqual(c.get('foo'), 'ham');
    assert.isEqual(c.get('spam'), 'spam is ham');
    assert.isEqual('carol', c.get('name'));
    assert.isEqual(10, c.get('age'));
}


if (require.main === module.id)
    require("test/runner").run(exports);
