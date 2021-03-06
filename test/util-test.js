// Tests for util.js

var assert = require("test/assert"),
    util = require("recipe/util");
    log = require("oil/log");
    json = require("json");
    jsontemplate = require("json-template");

exports.setup = function() {
  exports.defaults = {a: 0, b: 0, c: 0};
  exports.config = {a: 100, b: 200};
  exports.flags = {a: 3, c: 5};

  exports.vars = new util.VarStack(
      exports.defaults, exports.config, exports.flags);
}

exports.testVarStack = function() {
    var vars = exports.vars;

    assert.isEqual(vars.get('a'), 3);
    assert.isEqual(vars.get('b'), 200);
    assert.isEqual(vars.get('c'), 5);

    vars = new util.VarStack(exports.defaults, exports.config, {});
    assert.isEqual(vars.get('a'), 100);
    assert.isEqual(vars.get('b'), 200);
    assert.isEqual(vars.get('c'), 0);
}

exports.testVarStack = function() {
    var vars = new util.VarStack(exports.defaults, exports.config, {});

    vars.push({a: 199, d: 99});

    var top = vars.pop();
    assert.eq(top, {a: 199, d: 99});

    // Bug fix for array values
    var defaults = {
      'source-extensions': ['markdown', 'json']
    };
    var options = new util.VarStack(defaults, {});
    assert.eq(['markdown', 'json'], options.get('source-extensions'));
}

// Test that templates work
exports.testVarStackTemplates = function() {
    var o1 = {foo: "bar", spam: "eggs"};
    var o2 = {foo: "ham", $spam: "spam is {foo}"};

    var c = new util.VarStack(o1, o2);

    assert.isEqual(c.get('foo'), 'ham');
    // The template is on the same level as the variable here
    assert.isEqual('spam is ham', c.get('spam'));

    // Here I change the template
    var o3 = {foo: "ham", $spam: "spam is not {foo}"};
    c.push(o3);
    assert.isEqual('spam is not ham', c.get('spam')); 
}

// Test that a template can use a variable that itself is defined by a template
exports.testVarStackDoubleTemplates = function() {
    var o1 = {baseUrl: "http://foo", spam: "eggs"};
    var o2 = {$url: "{baseUrl}/index.html"};
    var o3 = {$link: '<a href="{url}">Link</a>'};

    var vars = new util.VarStack(o1, o2);

    assert.isEqual('http://foo/index.html', vars.get('url'));
    print(vars.get('url'));

    vars.push(o3);

    assert.isEqual(
        '<a href="http://foo/index.html">Link</a>', vars.get('link'));
    print(vars.get('link'));
}

exports.testTemplateBelowValue= function() {
    var o1 = {foo: "bar", spam: "eggs"};
    var o2 = {foo: "ham", $spam: "spam is {foo}"};

    var c = new util.VarStack(o1, o2);

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

    var c = new util.VarStack(o1);

    assert.isEqual('bar', c.get('foo'));

    c.push(o2);
    assert.isEqual('eggs', c.get('foo'));

    c.pop();
    assert.isEqual('bar', c.get('foo'));
}

exports.testInfiniteLoop = function() {
    return;
    var o1 = {foo: "bar", spam: "eggs"};
    var o2 = {$foo: "{foo}"};

    var c = new util.VarStack(o1, o2);
    print('RUNNING');

    assert.isEqual('eggs', c.get('foo'));
}

exports.testTemplateWithFileSystem = function() {
    var o1 = {foo: "bar", spam: "eggs"};
    var o2 = {foo: "ham", '&spam': "spam-file.txt"};

    var c = new util.VarStack(o1, o2);

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
    var c = new util.VarStack(o1, o2).useFileSystem(fs);
    assert.isEqual('ham', c.get('foo'));
    assert.isEqual('<file contents>', c.get('spam'));
}

// A variable is a template on a file system
exports.testTemplateOnFileSystem = function() {
    var o1 = {baseUrl: "http://foo", spam: "eggs"};
    var o2 = {$url: "{baseUrl}/index.html"};
    var o3 = {"&$link": 'dummy'};

    var fs = {
      contentsOf: function(name) {
        if (name === 'dummy') {
          return 'meta: []\n\nIn a file: <a href="[url]">Link</a>';
        } else {
          return null;
        }
      }
    }

    var vars = new util.VarStack(o1, o2).useFileSystem(fs);

    assert.isEqual('http://foo/index.html', vars.get('url'));

    vars.push(o3);

    assert.isEqual(
        'In a file: <a href="http://foo/index.html">Link</a>',
        vars.get('link'));
}

// A variable is a template for a filename
exports.testTemplateForFilename = function() {
    var o1 = {"templates-dir": "custom-templates"};
    var o2 = {"$&code": '{templates-dir}/{filename}.jsont'};
    var o3 = {"filename": "javascript"};

    var fs = {
      contentsOf: function(name) {
        if (name === 'custom-templates/javascript.jsont') {
          return 'function () {}';
        } else if (name === 'custom-templates/python.jsont') {
          return 'def foo():';
        } else {
          return null;
        }
      }
    }

    var vars = new util.VarStack(o1, o2).useFileSystem(fs);

    assert.isEqual('custom-templates', vars.get('templates-dir'));

    vars.push(o3);
    assert.isEqual('function () {}', vars.get('code'));

    vars.push({"filename": "python"});
    assert.isEqual('def foo():', vars.get('code'));
}

exports.testPrepend = function() {
    var o3 = {foo: "bar", spam: "eggs"},
        o4 = {foo: "ham", $spam: "spam is {foo}"};

    var c = new util.VarStack(o3, o4);

    assert.isEqual('ham', c.get('foo'));
    assert.isEqual('spam is ham', c.get('spam'));

    var o1 = {name: "bob", age: 10},
        o2 = {name: "carol"};

    // Order is: o1, o2, o3, o4
    c.prepend(o1, o2);

    assert.isEqual('ham', c.get('foo'));
    assert.isEqual('spam is ham', c.get('spam'));
    assert.isEqual('carol', c.get('name'));
    assert.isEqual(10, c.get('age'));
}

exports.testGetPath = function() {
    print('--------------');
    var objs = [
        // 0
        { foo: 'bar', spam: 'eggs',
          dest: { dir: '/home' },
        },
        // 1
        { foo: "ham", 
          dest: {
            dir: '/usr/lib',
            filename: 'out.txt',
          }
        },
        // 2
        { foo: "ham", $spam: "spam is {foo}",
          dest: {
            dir: '/top/lib',
          }
        }
    ];

    var varStack = new util.VarStack(objs);
    assert.eq('ham', varStack.getPath(['foo']));

    print('! spam: ' + varStack.getPath(['spam']));

    print('! dest: ' + varStack.getPath(['dest']));
    assert.eq('/top/lib', varStack.getPath(['dest', 'dir']));

    assert.eq('out.txt', varStack.getPath(['dest', 'filename']));

    // Now test the Stacked Context

    var sc = new util.StackedContext(varStack);
    print('dest: ' + sc.pushName('dest'));
    assert.eq('/top/lib', sc.get('dir'));
    assert.eq('out.txt', sc.get('filename'));
}

exports.testCompileElement = function() {
  var vars = new util.VarStack({foo: 'bar', '$spam': '{foo}'});
  assert.eq(
      ['{foo}', '$'],
      vars._objs()[0].spam.arrayValues);
}

exports.testExpandingTemplateWithStackedContext = function() {
    print('--------------');
    var objs = [
        // 0
        { 'base-url': 'http://foo.com' },
        // 1
        { filename: "foo.py" },
    ];
    var vars = new util.VarStack(objs);
    var context = new util.StackedContext(vars);
    var t = jsontemplate.Template('filename: {filename}');
    assert.eq('filename: foo.py', t.expand(context));

    var t = jsontemplate.Template('base-url: {base-url}');
    assert.eq('base-url: http://foo.com', t.expand(context));
}

exports.testTemplateWithPushAndPops = function() {
    print('--------------');
    var objs = [
        { dest: {
            dir: '/usr/lib',
          }
        },
        { dest: {
            filename: 'out.txt',
          }
        }
    ];
    var vars = new util.VarStack(objs);
    var context = new util.StackedContext(vars);
    var t = jsontemplate.Template('{.section dest}{dir}/{filename}{.end}')
    assert.eq('/usr/lib/out.txt', t.expand(context));

    // TODO: This foo.bar lookup doesn't work.
    var t = jsontemplate.Template('{dest.dir}/{dest.filename}')
    assert.eq('/usr/lib/out.txt', t.expand(context));
}

exports.testTemplateWithSections = function() {
    var context = new util.StackedContext(new util.VarStack());  // empty
    var t = jsontemplate.Template('{.section foo}{@}{.end}')
    assert.eq('', t.expand(context));

    context = new util.StackedContext(new util.VarStack({bar: true}));
    assert.eq('', t.expand(context));

    context = new util.StackedContext(new util.VarStack({foo: 'bar'}));
    assert.eq('bar', t.expand(context));
}

exports.testTemplateWithRepeatedSections = function() {
    var context = new util.StackedContext(new util.VarStack());  // empty
    var t = jsontemplate.Template('{.repeated section foo}{@} {.end}')
    assert.eq('', t.expand(context));

    var context = new util.StackedContext(new util.VarStack({foo: [1, 2, 3]}));

    assert.eq('1 2 3 ', t.expand(context));
}

exports.testProcRunner = function() {
    return;  // disabled on v8
    var logger = require('oil/log').Logger();
    var runner = util.ProcRunner(logger);
    print(runner.stdout('ls'));
}

if (require.main === module.id)
    require("test/runner").run(exports);
