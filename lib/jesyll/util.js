// Stuff that is a dependency of the main app and the converter plugins in
// converters.js.

var json = require("json");

// Allow comments, even though it bastardizes the JSON a bit.  This
// JSON is never served over the network.
var parseJsonConfig = exports.parseJsonConfig = function(contents) {
  contents = contents.replace(/^\s*#.*$/gm, '');
  return json.parse(contents);
}

// Keys can be preceded by $filename or $template -- the $ means "special".
// In that case, a transformation is first applied.
var expandSpecial = exports.expandSpecial = function(jsonData, sourceTree) {
  for (var key in jsonData) {
    var match = key.match(/\$filename:(.+)/);
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
