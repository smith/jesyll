// Stuff that is a dependency of the main app and the converter plugins in
// converters.js.

var log = require("jesyll/log"),
    json = require("json"),
    jsontemplate = require("json-template"),
    os = require("os");

var isArray = function(value) {
  return value.constructor === Array;
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

// Implements the interface for JSON Template's data dictionaries, but with a
// stack of JSON objects.
//
// StackedContext basically maintains the location of the cursor as a path.
// Many template expansions happen over a given VarStack -- each one uses a
// StackedContext.
//
// TODO:
//
// - Write specific tests for t.expand(StackedContext(vars))
// - Implement looking up the stack
// - Implement foo.bar -- need to split it and convert it to a path
var StackedContext = exports.StackedContext = function(varStack) {
  var that = {};
  var path = [];

  that.PushSection = function(name) {
    path.push(name);
    // Now need to return the value
    return varStack.getPath(path);
  };

  that.Pop = function() {
    path.pop();
  };

  that.next = function() {
    var stacktop = stack[stack.length-1];

    if (stacktop.index == -1) {
      stacktop = {index: 0};
      stack.push(stacktop);
    }

    var contextArray = stack[stack.length-2].context;
  };

  that.get = function(name) {
    var items = name.split('.');  // for {dest.dir} syntax
    path.push.apply(path, items);  // extend it with all items
    log.info('StackedContext getPath %s', path);
    var value = varStack.getPath(path);
    // remove items.length elements from the end -- the ones we just added
    path.splice(path.length - items.length, items.length);
    log.info('StackedContext %s returning %s', name, value);
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
// Things you can do with one:
//
// - get a value
//   - getting values lazily expands & and $ prefixes
// - Convert it to a plain object, for use with JSON Template
// - push a new object on the stack
// - pop
//
// TODO: Push a VarStack on another VarStack?  Or perhaps be able to extend one
// *downward*
// Make a new copy of a varstack?  Then you can cache stuff in it.
// vars.new(doc);  // Directory
// $raw: "{raw-base}{filename}"
//   filename is *higher* on the stack than raw.  But that means you can *cache*
//   raw in the stack entry of *filename* (but not in the entry of raw)

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
        // 1. Remove obj['$' + name] from the current stack
        // 2. Call template.expand(that)
        //   - This will recursively call .get(var)
        //   - .pushContext()
        //   - .pop()
        //   - .next()
        //
        //   These 4 functions will be complicated to implement on the
        //   VarStack.  It would be nice to implement them all in terms of a
        //   .get() wrapper?
        //
        //   vars.get('dest.extension')
        //   vars.get('dest').get('extension')
        //
        // Is there any way to compile it into a list of fields accessed?
        //

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
    log.info("evalValue: Value of %s is '%s'", name, current);
    return current;
  }

  // Gets the current path variable
  // Algorithm: start with the entire stack of objects.  Try to look up each
  // path component, and only keep the ones where the lookup was successful.
  // Return the topmost match.
  that.getPath = function(path) {
    log.info('%% getPath %s', path)

    // considerNow is reversed -- top has lower indices
    var considerNow = [];
    for (var i = objs.length-1; i >= 0; i--) {
      considerNow.push(objs[i]);
    }
    var considerNext = [];

    for (var i = 0; i < path.length; i++) {
      var pathElement = path[i];
      //log.info('Looking for %s', pathElement)
      for (var j = 0; j < considerNow.length; j++) {
        var context = considerNow[j],
            value = context[pathElement];
        if (value instanceof OperationList) {  
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
    log.info('getPath returning %s', json.stringify(considerNow[0], null, 2));
    return considerNow[0];  // return the topmost one
  }

  that.push = function(obj) {
    objs.push(compile(obj));
  };

  that.pop = function() {
    return objs.pop();
  };

  that.prepend = function() {
    var args = [0, 0];
    for (var i = 0; i < arguments.length; i++) {
      args.push(arguments[i]);
    }
    // JS is weird -- need to repeat objs here
    objs.splice.apply(objs, args);
  };

  // Convert the object stack to a single object, for passing to JSON Template
  // TODO: This doesn't expand templates, read files
  that.toObject = function(name) {
    var result = {};
    var specialKeys = [];
    for (var i = 0; i < objs.length; i++) {
      var obj = objs[i];
      // Assume they are simple JSON objects, no hasOwnProperty check
      for (var key in obj) {
        var c = key.charAt(0);
        if (c == '$' || c == '&') {
          specialKeys.push(key.slice(1));
        } else {
          result[key] = obj[key];
        }
      }
    }
    // Take into account $ and &
    //for (var i = 0; i < specialKeys.length; i++) {
    //  var key = specialKeys[i];
    //  result[key] = that.get(key);
    //}
    return result;
  };

  // For debugging
  that.debugString = function() {
    var parts = ['---\n'];
    for (var i = 0; i < objs.length; i++) {
      parts.push(i);
      parts.push(' ');
      parts.push(json.stringify(objs[i], null, 2));
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
