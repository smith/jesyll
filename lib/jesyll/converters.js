var json = require("json"),
    jsontemplate = require('json-template'),
    markdown = require('markdown'),
    util = require('jesyll/util');

// Trivial pass-through for HTML
var HtmlConverter = exports.HtmlConverter = function() {
  return {
    makeBody: function(sourceDoc) {
      return sourceDoc.get('body');
    }
  };
};

var MarkdownConverter = exports.MarkdownConverter = function() {
  return {
    makeBody: function(sourceDoc) {
      return markdown.encode(sourceDoc.get('body'));
    }
  };
};

var DefaultConverters = exports.DefaultConverters = function(
    templates, sourceTree) {

  var converters = {
    'markdown': MarkdownConverter(),
    'html': HtmlConverter(),
  };

  // TODO: Shouldn't use makeBody since it doesn't have the same signature
  return {
    makeBody: function(sourceDoc) {
      var sourceType = sourceDoc.get('body-type'),
          body = sourceDoc.get('body');

      if (sourceType == 'jsont') {
        // Special Jesyll support for JSON Template docs.
        //
        // TODO: Is this just a special case of $body??  Probably.
        //
        // IMPORTANT LIMITATION: Because of the .get() stuff, only a "flat" 
        // 1-level data object is currently supported.
        var template = jsontemplate.fromString(body);

        return template.expand(sourceDoc);
      }
      
      var c = converters[sourceType];
      if (c === undefined) {
        throw {
          name: 'UnknownBodyType',
          message: sourceType
        };
      }
      return c.makeBody(sourceDoc);
    }
  };
};
