// Stuff that is a dependency of the main app and the converter plugins in
// converters.js.

var log = require("jesyll/log"),
    json = require("json"),
    jsontemplate = require("json-template"),
    os = require("os");

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
var StackedContext = exports.StackedContext = function(objs) {
  var that = {};
  var path = [];
  var stack = [{index: -1}];

  that.PushSection = function(name) {
    path.push(name);
    // Now need to return the value
    return that.getPath(path);
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
    for (var i = objs.length-1; i >= 0; i--) {
      var value = objs[i][name];
      if (value !== undefined) {
        return value;
      }
    }
    return undefined;
  };

  // Gets the current path variable
  that.getPath = function(path) {
    var considerNow = objs;
    var considerNext = [];

    var values = [];
    var value = null;
    for (var i = 0; i < path.length; i++) {
      var pathElement = path[i];
      log.info('Looking for %s', pathElement)
      for (var j = considerNow.length-1; j >= 0; j--) {
        var context = considerNow[j],
            v = context[pathElement];
        if (v !== undefined) {
          log.info('consider %s for %s', v, pathElement);
          considerNext.push(v);
        }
      }
      if (considerNext.length == 0) {
        return undefined;
      }
      considerNext.reverse();
      considerNow = considerNext;
      considerNext = [];
    }
    return considerNow[considerNow.length-1];  // return the topmost one
  }

  return that;
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
  var that = {fs: null};  // file system object
  var objs = [];

  // arguments isn't a real array, so make it one
  for (var i = 0; i < arguments.length; i++) {
    objs.push(arguments[i]);
  }

  that.get = function(name) {
    //log.debug('GETTING ' + name);
    for (var i = objs.length-1; i >= 0; i--) {
      var obj = objs[i],
          value = obj[name];
      if (value !== undefined) {
        return value;
      }

      // Now look to see if a template was defined
      var templateStr = obj['$' + name];
      if (templateStr !== undefined) {
        log.debug('EXPANDING %s', templateStr);
        // TODO: 
        //
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
        value = jsontemplate.expand(templateStr, that);
        // NOTE: The caching below doesn't work in many circumstances
        /*
        obj[name] = value;
        delete obj['$' + name];
        */
        return value;
      }

      // Check for a filename
      var filename = obj['&' + name];
      if (filename !== undefined) {
        log.debug('READING %s', filename);
        if (that.fs) {
          return that.fs.contentsOf(filename);
        } else {
          throw {
            name: 'NoFileSystem',
            message: "Can't expand &files without useFileSystem(fs)",
          };
        }
        return value;
      }
    }
    return undefined;
  };

  that.push = function(obj) {
    objs.push(obj);
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
  that.useFileSystem = function(fs) {
    that.fs = fs;
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
