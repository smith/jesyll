// For building docs

var log = require('oil/log'),
    util = require('recipe/util');

var file = require('file'),
    jsontemplate = require('json-template'),
    nutil = require('util');  // narwhal util


var IndexBuilder = exports.IndexBuilder = function(
    sourceTree, docStack, buildDoc) {
  var that = {},
      dirStack = [],
      indexStack = [];

  // Returns the top of the stack
  var destDir = function() {
    return dirStack[dirStack.length-1];
  }

  that.empty = function() {
    return indexStack.length === 0;
  }

  // Call this when receiving a regular doc to be indexed
  that.onDoc = function(items) {
    // "Greedily" expand the stack, so it's a normal data dictionary
    var perDocData = {};
    nutil.complete(perDocData, items[1]);
    nutil.complete(perDocData, items[0]);
    nutil.complete(perDocData, {'url': 'TODO'});

    // For non-hidden source files, update the data for indices
    var len = indexStack.length;
    indexStack[len-1]['docs'].push(perDocData);
    for (var i = 0; i < len; i++) {
      indexStack[i]['all-docs'].push(perDocData);
    }
  }

  // Call this when discovering a doc with the .index attribute
  that.onIndexDoc = function(relativePath) {
    indexStack[indexStack.length-1]['index-docs'].push(relativePath);
  }

  that.enterDir = function (destDir) {
    // Record that this dir is a child of its parent dir
    if (destDir !== '') {  // top of the tree, no parent
      indexStack[indexStack.length-1]['dirs'].push({name: destDir});
    }

    dirStack.push(destDir);
    indexStack.push({
        'docs': [],           // just the docs in this directory
        'dirs': [],           // just the dirs in this directory
        'all-docs': [],       // recursive listing of all docs in the subtree
        'index-docs': [],     // .index docs in this directory
        });
  }

  that.exitDir = function () {
    dirStack.pop();

    log.info('Building indices for %s', destDir());
    var top = indexStack.pop(),
              indexDocs = top['index-docs'];

    for (var i = 0; i < indexDocs.length; i++) {
      var items = readSource(sourceTree, indexDocs[i]);

      // Make the index variables available
      docStack.push(top);
      // The docs own variables (e.g. .template)
      for (var j = 0; j < items.length; j++) {
        docStack.push(items[j]);
      }

      // TODO: Can this somehow be unified with regular docs?  Or is an index
      // always a template file?  I think it should always be a template.
      var indexTemplate = docStack.get('body');

      var t = jsontemplate.fromString(indexTemplate),
          body = t.expand(util.StackedContext(docStack));

      // Put the expanded body on
      // TODO: fill in more stuff, mabye rethink this
      docStack.push({
          body: body,
          // HACK
          dest: {dir: destDir(), basename: 'index', ext: '.html'},

          // HACK -- see buildDoc
          'relative-path': destDir() + 'index.html'
          });

      var error = buildDoc(docStack);
      if (error) {
        log.error('Error converting %s: %s', filename, error);
        if (!options.get('keep-going')) {
          throw error;
        };
      }

      docStack.pop();  // body
      docStack.pop();  // top of indexStack
      for (var j = 0; j < items.length; j++) {
        docStack.pop();  // index doc
      }
    }
  }

  return that;
}

// Extracts metadata from a filename.
// TODO: possibly get categories/tags from the directory tree?
var extractMetadata = exports.extractMetadata = function(relPath) {
  var ext = file.extension(relPath),
      filename = file.basename(relPath),
      basename = file.basename(relPath, ext),
      // Ignore leading _ or __ when calculating title
      title = basename.replace(/^_{1,2}/, '');

  if (ext !== "") {
    ext = ext.slice(1);  // drop leading .
  }

  // Basic data extracted from the relative path
  var meta = {
      'relative-path': relPath,
      filename: filename,
      ext: ext
      };

  // Try to extract a date first.
  var match = basename.match(/(\d{4})-(\d{2})-(\d{2})-(.+)/);
  if (match) {
    meta['year'] = parseInt(match[1]);
    meta['month'] = parseInt(match[2]);
    meta['day'] = parseInt(match[3]);
    title = match[4];
  }

  meta['title'] = title.replace(/-/g, ' ');

  return meta;
}

var META_RE = /^\s*(\S+):\s*(.*)/;

// Parses the "front matter" at the top of a source file.  This data is used by
// Recipe and is not content.
// If the first non-whitespace character is {, then assume the front matter is
// JSON.  This may be useful if the keys contain unusual characters (like
// spaces, although that is frowned upon)
var parseFrontMatter = exports.parseFrontMatter = function(lines) {
  if (lines[0] && lines[0].match(/\s*{/)) {
    return util.parseJsonConfig(lines.join(''));
  }
  var metadata = {};
  for (var i=0; i<lines.length; i++) {
    var line = lines[i];
    var match = line.match(META_RE);
    if (match) {
      var name = match[1].toLowerCase(),
          value = util.trim(match[2]);
      // Allow boolean/null values too, like "mini JSON"
      switch (value.toLowerCase()) {
        case 'true':
          value = true;
          break;
        case 'false':
          value = false;
          break;
        case 'null':
          value = null;
          break;
      }
      metadata[name] = value;
    } else {
      // TODO: logging
      log.warning('WARNING: invalid metadata line: %s', line);
    }
  }
  return metadata;
}

// Get metadata and content from a source document
// Returns:
//   An array of objects to put on the document stack.
var readSource = exports.readSource = function(sourceTree, sourceFile) {
  var ext = file.extension(sourceFile),
      f = sourceTree.open(sourceFile),
      extracted = extractMetadata(sourceFile),
      content,
      parsed,
      doc;

  if (ext == '.json') {
    // The JSON represents a document.  No front matter possible.
    content = f.read();
    parsed = util.parseJsonConfig(content);
  } else {
    // In the non-JSON case, treat the extension as the body type
    if (extracted['ext'] !== "") {
      extracted['body-type'] = extracted['ext'];
    }

    var firstLine = f.readLine(),
        metadataLines = [],
        body;

    if (util.trim(firstLine) == "---") {
      while (true) {
        var line = f.readLine();
        if (util.trim(line) == "---") {
          break;
        }
        metadataLines.push(line);
      }
      body = f.read();  // the rest is content
    } else {
      // No metadata, back up and read it all again
      // TODO: rewind() doesn't exist?
      //f.rewind();
      f.close();
      f = sourceTree.open(sourceFile),
      body = f.read();  // the rest is content
    }
    var parsed = parseFrontMatter(metadataLines);
    parsed.body = body;
  }
  return [extracted, parsed];
};

