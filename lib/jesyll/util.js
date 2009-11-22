// Stuff that is a dependency of the main app and the converter plugins in
// converters.js.

var json = require("json"),
    jsontemplate = require("json-template");

// Allow comments, even though it bastardizes the JSON a bit.  This
// JSON is never served over the network.
var parseJsonConfig = exports.parseJsonConfig = function(contents) {
  contents = contents.replace(/^\s*#.*$/gm, '');
  try {
    var obj = json.parse(contents);
  } catch (e) {
    print('Syntax error in JSON:');
    print(contents);
    throw e;
  }
  return obj;
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

  // arguments isn't a realy array, so make it one
  for (var i = 0; i < arguments.length; i++) {
    objs.push(arguments[i]);
  }

  that.get = function(name) {
    for (var i = objs.length-1; i >= 0; i--) {
      var obj = objs[i],
          value = obj[name];
      if (value !== undefined) {
        return value;
      }

      // Now look to see if a template was defined
      var templateStr = obj['$' + name];
      if (templateStr !== undefined) {
        print('EXPANDING ' + templateStr);
        // TODO: Use toObject instead of this
        value = jsontemplate.expand(templateStr, that.toObject());
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
        print('READING ' + filename);
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
    for (var i = 0; i < objs.length; i++) {
      var obj = objs[i];
      // Assume they are simple JSON objects, no hasOwnProperty check
      for (var key in obj) {
        result[key] = obj[key];
      }
    }
    return result;
  };

  // Set the file system -- use in a method chaining style.  var o =
  // VarStack(...).useFileSystem(fs)
  that.useFileSystem = function(fs) {
    that.fs = fs;
    return that;
  }

  return that;
}
