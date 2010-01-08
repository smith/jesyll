// Stuff that is a dependency of the main app and the converter plugins in
// converters.js.

var log = require("jesyll/log"),
    json = require("json"),
    jsontemplate = require("json-template"),
    os = require("os");


// Like Python's str.strip()
var trim = exports.trim = function(str) {
  return str.replace(/^\s+/, '')
            .replace(/\s+$/, '');
}

var isArray = function(value) {
  return value && value.constructor === Array;
}

// Allow comments, even though it bastardizes the JSON a bit.  This
// JSON is never served over the network.
var parseJsonConfig = exports.parseJsonConfig = function(contents) {
  contents = contents.replace(/^\s*#.*$/gm, '');
  try {
    var obj = json.parse(contents);
  } catch (e) {
    log.error('Syntax error in JSON:');
    log.error(contents);
    throw e;
  }
  return obj;
}

// Implements the interface for JSON Template's data dictionaries -- on top of
// the VarStack.getPath() interface.
//
// We just maintain the location of the cursor as a path.  Many template
// expansions happen over a given VarStack -- each one uses a StackedContext.
//
// TODO:
//
// - Implement looking up the stack

var StackedContext = exports.StackedContext = function(varStack) {
  var that = {};
  var path = [];
  var iteration = [];  // Stack to keep track of iteration

  that.pushName = function(name) {
    path.push(name);
    iteration.push({iterating: false, len: 0});
    //log.info('pushName %s returning %s', name, varStack.getPath(path));
    return varStack.getPath(path);  // pushName returns the value too
  };

  that.pop = function() {
    iteration.pop();
    path.pop();
  };

  that.next = function() {
    var stacktop = iteration[iteration.length-1];
    if (!stacktop.iterating) {
      var len = varStack.getPath(path).length;  // Check the current length
      stacktop = {iterating: true, len: len};  // Now were iterating
      iteration.push(stacktop);
      path.push(0);
      return true;
    } 
    
    var index = path[path.length-1];
    if (index == stacktop.len-1) {
      iteration.pop();
      path.pop();
      return undefined;  // sentinel to say that we're done
    }

    // Mutate the top of the path
    path[path.length-1]++;
    return true;
  };

  that.get = function(name) {
    var items = name.split('.');  // for {dest.dir} syntax
    path.push.apply(path, items);  // extend it with all items
    //log.info('StackedContext getPath %s', path);
    var value = varStack.getPath(path);
    // remove items.length elements from the end -- the ones we just added
    path.splice(path.length - items.length, items.length);
    //log.info('StackedContext %s returning %s', name, value);
    return value;
  };

  that.toString = function() {
    return '<StackedContext ' + json.stringify(path) + '>';
  }

  return that;
}

// Trivial wrapper around an Array to work around the fact that we can't
// subclass Array.
function OperationList(arrayValues) {
  this.arrayValues = arrayValues;
}

// VarStack is the central abstraction for configuration in Jesyll.  A sequence
// of JSON files / front matter gets converted to a VarStack.
//
// Variables can be plain JSON objects, or special expressions:
//
// url: "http://foo"                          'url' is a plain string
// $url: "http://{domain}/index.html"         'url' is a template
// &url: "dir/url.txt"                        The value of 'url' is in url.txt
//
// The $ and & operators can be combined.

var VarStack = exports.VarStack = function() {
  var that = {};

  var fs = null;  // file system object
  var objs = [];

  // Compiles keys beginning with & and $ into read() functions and template
  // objects
  function compile(obj) {
    //print('COMPILING');
    var compiled = {};
    for (name in obj) {
      var value = obj[name];
          operations = new OperationList([value]);

      while (true) {
        var firstChar = name.charAt(0);
        if (firstChar == '$' || firstChar == '&'){
          name = name.slice(1);
          operations.arrayValues.push(firstChar);
        } else {
          if (operations.arrayValues.length == 1) {
            compiled[name] = value;
          } else {
            compiled[name] = operations;
          }
          break;
        }
      }
    }
    return compiled;
  }

  // Compile each argument and push it on the stack
  // Accept either VarStack([a, b]) or VarStack(a, b)
  var entries = isArray(arguments[0]) ? arguments[0] : arguments;
  for (var i = 0; i < entries.length; i++) {
    //log.info('pushing %s', json.stringify(entries));
    objs.push(compile(entries[i]));
  }

  that._objs = function() { return objs; }  // only for testing

  // For a "single level" object
  that.get = function(name) {
    return that.getPath([name]);
  };

  that.evalValue = function(operations) {
    var current = operations[0];

    for (var j = 1; j < operations.length; j++) {
      switch (operations[j]) {

        case '$':
          log.push();
          log.info("evalValue: Expanding template '%s'", current);
          var t = jsontemplate.fromString(current);
          // RECURSIVE construction of VarStack
          current = t.expand(StackedContext(that));
          log.pop();
          break;

        case '&':
          log.debug('evalValue: Reading file %s', current);
          if (fs) {
            current = fs.contentsOf(current);
          } else {
            throw {
              name: 'NoFileSystem',
              message: "Can't expand &files without useFileSystem(fs)",
            };
          }
          break;

        default:
          break;
      }
    }
    //log.info("evalValue: Value is '%s'", current);
    return current;
  }

  // Given a "path" like ['foo', 'bar'], the value of the variable, looking
  // through the stack of objects.
  //
  // Algorithm: start with the entire stack of objects.  Try to look up each
  // path component, and only keep the ones where the lookup was successful.
  // Repeated until the path is exhausted, and return the topmost match.
  that.getPath = function(path) {
    //log.info('%% getPath %s', path)

    // considerNow is reversed -- top has lower indices
    var considerNow = [];
    for (var i = objs.length-1; i >= 0; i--) {
      considerNow.push(objs[i]);
    }
    var considerNext = [];

    for (var i = 0; i < path.length; i++) {
      var pathElement = path[i];
      // Easiest to put this logic here, instead of in StackedContext. A @ is
      // basicaly a noop.
      if (pathElement === '@') {
        continue;
      }
      //log.info('Looking for %s', pathElement)
      for (var j = 0; j < considerNow.length; j++) {
        var context = considerNow[j],
            value = context[pathElement];
        if (value instanceof OperationList) {  
          // BUG TODO: Even though a higher stack element has doc-dest, I might
          // still evaluate a lower doc-dest that depends on undefined variables
          value = that.evalValue(value.arrayValues);
          considerNext.push(value);
        } else if (value !== undefined) {
          //log.info('consider %s for %s', v, pathElement);
          considerNext.push(value);
        }
      }
      if (considerNext.length == 0) {
        return undefined;
      }
      considerNow = considerNext;
      considerNext = [];
    }
    //log.info('getPath returning %s', json.stringify(considerNow[0], null, 2));
    return considerNow[0];  // return the topmost one
  }

  // Push a new object on the variable stack (e.g. a document).
  that.push = function(obj) {
    objs.push(compile(obj));
  };

  // Pop from the variable stack.  (Not to be confused with StackedContext.pop!)
  that.pop = function() {
    return objs.pop();
  };

  // Get size of stack
  that.size = function() {
    return objs.length;
  };

  // TODO: Delete?
  that.prepend = function() {
    var args = [0, 0];
    for (var i = 0; i < arguments.length; i++) {
      args.push(arguments[i]);
    }
    // JS is weird -- need to repeat objs here
    objs.splice.apply(objs, args);
  };

  // For debugging, show what names are on which stack levels
  that.debugString = function() {
    var parts = ['---\n'];
    for (var i = 0; i < objs.length; i++) {
      parts.push(i);
      parts.push(' ');
      for (var name in objs[i]) {
        parts.push(name);
        parts.push(' ');
      }
      parts.push('\n');
    }
    parts.push('---\n');
    return parts.join('');
  }

  // A shorter version of debugString
  that.toString = function() {
    return '<VarStack (' + objs.length + ' items)>';
  }

  // Set the file system -- use in a method chaining style.  var o =
  // VarStack(...).useFileSystem(fs)
  that.useFileSystem = function(fileSystem) {
    fs = fileSystem;
    return that;
  }

  return that;
}

var ProcRunner = exports.ProcRunner = function(logger) {
  var that = {};
  that.stdout = function (cmd) {
    logger.debug('Running: %s', cmd);
    return os.command(cmd);
  }
  return that;
}
