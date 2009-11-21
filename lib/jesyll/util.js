// Stuff that is a dependency of the main app and the converter plugins in
// converters.js.

var json = require("json");

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
var expandSpecial = exports.expandSpecial = function(jsonData, sourceTree) {
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

