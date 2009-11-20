var json = require("json"),
    jsontemplate = require('json-template'),
    markdown = require('markdown'),
    util = require('jesyll/util');

// Both JSON and JSON Template can serve as source docs.  For JSON, the JSON
// varies and the template is constant.  For JSON Template, the template varies
// and the JSON data is constant (i.e. stored in __config.json)
//
// TODO: Should JSON have front matter?  Or should it just be in the JSON with $
// keys?

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
      jsonData = util.expandSpecial(jsonData, sourceTree); 

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

var DefaultConverters = exports.DefaultConverters = function(
    templates, globals, sourceTree) {

  var converters = {
    'json': JsonConverter(templates, globals, sourceTree),
    'markdown': MarkdownConverter(),
    'html': HtmlConverter(),
  };

  // TODO: Shouldn't use makeBody since it doesn't have the same signature
  return {
    makeBody: function(sourceDoc) {
      var sourceType = sourceDoc.get('source-type'),
          content = sourceDoc.get('content');

      if (sourceType == 'jsont') {
        // Special Jesyll support for JSON Template docs.
        // IMPORTANT LIMITATION: Because of the .get() stuff, only a "flat" 
        // 1-level data object is currently supported.
        var template = jsontemplate.fromString(content);
        // doc front matter overlaid on globals.  TODO: Maybe I should have a
        // sourceDoc.vars section or something?  Otherwise someone could expand
        // 'content', somewhat recursively.
        var data = util.Composite(util.ObjComposite(globals), sourceDoc);
        return template.expand(data);
      }
      
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