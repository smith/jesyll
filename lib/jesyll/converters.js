var json = require("json"),
    jsontemplate = require('json-template'),
    markdown = require('markdown'),
    util = require('jesyll/util');


// JSON data is transformed before template substitution with some special
// conventions.
var expandJson = function(jsonData, sourceTree) {
  for (var key in jsonData) {
    var match = key.match(/\$filename\.(.+)/);
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

// Args:
//   templates: For finding and expanding the template
//   globals: TODO: The JSON should be backed by globals, I think
//   sourceTree: We may need to read files from the source tree
var JsonConverter = exports.JsonConverter = function(
    templates, globals, sourceTree) {
  return {
    makeBody: function(content) {
      print("content: " + content);
      // A JSON file provides a data dictionary for a JSON Template.
      var jsonData = util.parseJsonConfig(content);
      jsonData = expandJson(jsonData, sourceTree); 

      // TODO: Figure out relative dirs and such
      // TODO: Have to parse metadata from the template too
      var templateName = jsonData.$template || 'default',
          template = templates.getTemplate(templateName);
      return template.expand(jsonData);
    }
  };
};

// Trivial pass-through for HTML
var HtmlConverter = exports.HtmlConverter = function() {
  return {
    makeBody: function(content) {
      return content;
    }
  };
};

var MarkdownConverter = exports.MarkdownConverter = function() {
  return {
    makeBody: function(content) {
      return markdown.encode(content);
    }
  };
};

// Both JSON and JSON Template can serve as source docs.  For JSON, the JSON
// varies and the template is constant.  For JSON Template, the template varies
// and the JSON data is constant (i.e. stored in __config.json)
//
// TODO: Should JSON have front matter?  Or should it just be in the JSON with $
// keys?
var JsonTemplateConverter = exports.JsonTemplateConverter = function(globals) {
  return {
    makeBody: function(content) {
      var template = jsontemplate.fromString(content);
      // Expand with globals for now
      return template.expand(globals);
    }
  };
};

var DefaultConverters = exports.DefaultConverters = function(
    templates, globals, sourceTree) {

  var converters = {
    'json': JsonConverter(templates, globals, sourceTree),
    'jsont': JsonTemplateConverter(globals),
    'markdown': MarkdownConverter(),
    'html': HtmlConverter(),
  };

  // TODO: Shouldn't use makeBody since it doesn't have the same signature
  return {
    makeBody: function(sourceType, content) {
      var c = converters[sourceType];
      if (c === undefined) {
        throw {
          name: 'UnknownSourceType',
          message: sourceType
        };
      }
      return c.makeBody(content);
    }
  };
};
