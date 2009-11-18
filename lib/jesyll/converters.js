var json = require("json"),
    markdown = require('markdown'),
    util = require('jesyll/util');


// JSON data is transformed before template substitution with some special
// conventions.
var expandJson = function(jsonData, baseDir) {
  for (var key in jsonData) {
    var match = key.match(/\$filename\.(.+)/);
    if (match) {
      newKey = match[1];
      var filename = jsonData[key],
          fullPath = file.join(baseDir, filename);
      try {
        var f = file.open(fullPath);
      } catch (e) {
        throw {
          name: 'FileNotFound',
          message: fullPath
        };
      }
      var contents = f.read();
      jsonData[newKey] = contents;
    }
  }
}


// Both JSON and JSON Template can serve as source docs.  For JSON, the JSON
// varies and the template is constant.  For JSON Template, the template varies
// and the JSON data is constant (i.e. stored in __config.json)
//
// TODO: Should JSON have front matter?  Or should it just be in the JSON with $
// keys?
var DefaultConverters = exports.DefaultConverters = function(templates, globals) {
  return {
    makeBody: function(filename, sourceType, content) {
      var converted = null;
      switch (sourceType) {
        case 'html':  // Allow HTML fragments
          converted = content;
          break;
        case 'markdown':
          // TODO: Catch errors
          converted = markdown.encode(content);
          break;
        case 'json':
          print("content: " + content);
          // A JSON file provides a data dictionary for a JSON Template.
          var jsonData = util.parseJsonConfig(content);
          jsonData = expandJson(jsonData, file.dirname(filename));

          // TODO: Figure out relative dirs and such
          // TODO: Have to parse metadata from the template too
          var templateName = jsonData.$template || 'default',
              template = templates.getTemplate(templateName);
          converted = template.expand(jsonData);
          break;
        case 'jsont':
          var template = jsontemplate.fromString(content);
          // Expand with globals for now
          converted = template.expand(globals);
          break;
        default:
          throw {name: 'UnknownSourceType', message: sourceType};
      }
      return converted;
    }
  }
};

