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

// Keys can be preceded by $filename or $template -- the $ means "special".
// In that case, a transformation is first applied.
//
// Args:
//   jsonData: Raw object with $special key prefixes
//   templateData: Data dictionary for use with templates
//   sourceTree: FileSystem object to load $filenames out of
var expandSpecial = exports.expandSpecial = function(
    jsonData, templateData, sourceTree) {
  for (var key in jsonData) {
    var match = key.match(/\$filename\/(.+)/);
    if (match) {
      newKey = match[1];
      var filename = jsonData[key];
      try {
        var f = sourceTree.open(filename);
      } catch (e) {
        throw {
          name: 'FileNotFound',
          message: sourceTree.path(filename)
        };
      }
      var contents = f.read();
      jsonData[newKey] = contents;
      delete jsonData[key];
    }
    var match = key.match(/\$template\/(.+)/);
    if (match) {
      newKey = match[1];
      // Use the default constructor, e.g. with {} metacharacters
      var template = jsontemplate.Template(jsonData[key]);
      var value = template.expand(templateData);
      jsonData[newKey] = value;
      delete jsonData[key];
    }
  }
  return jsonData;
};


// A stack of objects can be combined into a ObjComposite object.  Unfortunately
// JS makes it impossible to do simple attribute access here, so we have to use
// a .get() method.
var ObjComposite = exports.ObjComposite = function() {
  var objs = arguments;
  return {
    get: function(name) {
      for (var i = objs.length-1; i >= 0; i--) {
        var value = objs[i][name];
        if (value !== undefined) {
          return value;
        }
      }
      return undefined;
    }
  };
}

// Like an ObjComposite, but accepts Composites.
var Composite = exports.Composite = function() {
  var objs = arguments;
  return {
    get: function(name) {
      for (var i = objs.length-1; i >= 0; i--) {
        var value = objs[i].get(name);
        if (value !== undefined) {
          return value;
        }
      }
      return undefined;
    }
  };
}

// Things to do:
// - Convert to a plain object, for use with JSON Template
// - get a value
// - push a new object on the stack
// - pop
// - Lazily expand & and $ prefixes

var ObjectStack = exports.ObjectStack = function() {
  var that = {};
  var objs = [];

  // arguments isn't a realy array, so make it one
  for (var i = 0; i < arguments.length; i++) {
    objs.push(arguments[i]);
  }

  that.get = function(name) {
    for (var i = objs.length-1; i >= 0; i--) {
      var value = objs[i][name];
      if (value !== undefined) {
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

  // Convert the object stack to a single object, for passing to JSON Template
  that.toObject = function(name) {
    var result = {};
    print('iterating over ' + objs.length);
    for (var i = 0; i < objs.length; i++) {
      var obj = objs[i];
      // Assume they are simple JSON objects, no hasOwnProperty check
      for (var key in obj) {
        result[key] = obj[key];
      }
    }
    return result;
  };

  return that;
}
