// Stuff that is a dependency of the main app and the converter plugins in
// converters.js.

var json = require("json");

// Allow comments, even though it bastardizes the JSON a bit.  This
// JSON is never served over the network.
var parseJsonConfig = exports.parseJsonConfig = function(contents) {
  contents = contents.replace(/^\s*#.*$/gm, '');
  return json.parse(contents);
}

