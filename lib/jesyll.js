// Main Jesyll app / library
//
// TODO: Docstring

// This package
var converters = require('jesyll/converters'),
    log = require('jesyll/log'),
    util = require('jesyll/util');
    filetree = require('jesyll/filetree');

var args = require("args"),
    file = require("file"),
    json = require("json"),
    jsontemplate = require('json-template'),
    os = require("os");

var parser = new args.Parser();

parser.usage('<source dir>')

parser.help(
    'Jesyll generates static HTML sites.\n' +
    '\n' +
    "If a source directory isn't given, assume the current directory."
    );

parser.option("-s", "--server", "server")
    .help("NYI: run a web server")
    .set(true);

parser.option("-d", "--dest-dir", "dest-dir")
    .help("Write output tree into this directory")
    .set();

parser.option("-t", "--templates-dir", "templates-dir")
    .help("Templates directory")
    .set();

parser.option("-k", "--keep-going", "keep-going")
    .help("Keep going after errors")
    .set(true);

parser.option("-V", "--version")
    .help("print the Jesyll version number and exit.")
    .action(function () {
        this.print("Jesyll Version 0.1");
        this.exit();
    });

parser.option("-v", "--verbose", "verbose")
    .help("Show detailed logs.")
    .set(true);

// TODO: This is broken in narwhal-v8, because the engine also reads argv
parser.option("-h", "--help")
    .action(parser.printHelp);



//
// Utility functions
//

// Like Python's str.strip()
var trim = function(str) {
  return str.replace(/^\s+/, '')
            .replace(/\s+$/, '');
}

// Removes leading _ from any path component (including the first)
var toDestPath = function (relPath) {
  return relPath.replace(/^_/, '')
                .replace(/\/_/g, '/');
}

//
// Jesyll-specific
//

// A registry of templates
var Templates = function(templatesDir) {
  var templateCache = {};
  var that = {};

  // Raises: TemplateNotFound if the template doesn't exist

  that.getTemplate = function(name) {
    var template = templateCache[name];
    if (template === undefined) {
      var templatePath = file.join(templatesDir, name + '.jsont');
      try {
        var templateFile = file.open(templatePath);
      } catch (e) {
        throw {name: 'TemplateNotFound', message: name};
      }
      var template = templateFile.read();
      templateFile.close();
      var template = jsontemplate.fromString(template);
      templateCache[name] = template;
    }
    return template;
  };

  // Returns a full HTML page
  that.makeHtml = function(doc) {
    // throws exceptions; caller handles
    var templateName = doc.get('.template'),
        template = that.getTemplate(templateName);
    return template.expand(doc.toObject());
  };

  return that;
}

var META_RE = /^\s*(\S+):\s*(.*)/;

// Parses the "front matter" at the top of a source file.  This data is used by
// Jesyll and is not content.
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
      var name = match[1].toLowerCase(), value = match[2];
      metadata[name] = trim(value);
    } else {
      // TODO: logging
      log.warning('WARNING: invalid metadata line: %s', line);
    }
  }
  return metadata;
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

// path could be absolute or relative.  If it's relative, it's relative to the
// file system.
var absolutePath = function(fs, path) {
  if (path.charAt(0) != '/') {
    return fs.path(path);
  } else {
    return path;
  }
}

var SourceReader = exports.SourceReader = function(sourceTree) {
  var that = {};

// Get metadata and content from a source document
// We need 'globals' because metadata needs to be expanded.
  that.read = function(sourceFile) {
    var ext = file.extension(sourceFile),
        f = sourceTree.open(sourceFile),
        extracted = extractMetadata(sourceFile),
        content,
        parsed,
        doc;

    // The JSON represents a document.  No front matter possible.
    if (ext == '.json') {
      content = f.read();
      parsed = util.parseJsonConfig(content);
    } else {
      // in the non-JSON case, treat the extension as the body type
      if (extracted['ext'] !== "") {
        extracted['body-type'] = extracted['ext'];
      }

      var firstLine = f.readLine(),
          metadataLines = [],
          body;

      if (trim(firstLine) == "---") {
        while (true) {
          var line = f.readLine();
          if (trim(line) == "---") {
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
  }

  return that;
};


// An object of this type is responsible for maintaining a VarStack.
// It passes the the doc to the DocBuilder, which in turn passes it to a
// BodyConverter.
var FileHandler = function(options, sourceReader, docBuilder, copier) {
  var that = {
    numGenerated: 0,
    numCopied: 0
  };
  that.dirStack = [];

  var sourceExtRegex = new RegExp(options.get('source-extensions').join('|'));

  // TODO: This should probably be in globals?  But it's configuration,
  // not variables.
  var defaultDoc = {
      '.template': 'default',
      '.hidden': false,
      'body-type': 'html',  // Assume HTML -> no conversion
      // TODO: New extension should be configurable?  Probably not -- they
      // should just use _ as a prefix and use the actual extension.
      // Should the default date be taken from the file system?
      };

  var docStack = util.VarStack(defaultDoc);  // TODO: global config

  // TODO: Push the __config.json onto the document stack
  that.enterDir = function(dirName) {
    log.info('Entering dir: %s', dirName);
    log.push();  // indentation
    that.dirStack.push(dirName);
  };

  // TODO: Pop the document stack
  that.exitDir = function() {
    that.dirStack.pop();
    log.pop();  // indentation
    log.info('Leaving dir');
  };

  that.onFile = function(filename) {
    // Directories starting with __ were already ignored by the walker
    if (filename.slice(0, 2) == '__') {
      log.info('Ignoring: %s', filename)
      return;
    }

    that.dirStack.push(filename);

    var ext = file.extension(filename),
        relativePath = that.dirStack.join('/'),
        isSource = false;

    if (ext.match(sourceExtRegex)) {
      isSource = true;
    } else {
      // If the filename or any directory starts with _, consider it source
      for (var i = 0; i < that.dirStack.length; i++) {
        if (that.dirStack[i].charAt(0) == '_') {
          isSource = true;
          break;
        }
      }
    }

    that.dirStack.pop();

    if (isSource) {
      // Should be a debug log
      log.info("Source file: %s", filename);
      log.push();

      var items = sourceReader.read(relativePath);
      // Push each in the array of items on the stack
      for (var i = 0; i < items.length; i++) {
        docStack.push(items[i]);
      }

      // TODO: --unhide flag
      if (hidden = docStack.get('.hidden')) {
        log.info('Skipping hidden file %s', filename);
        hidden = true;
      }

      if (!hidden) {
        docBuilder.build(docStack);
        that.numGenerated += 1;
      }

      for (var i = 0; i < items.length; i++) {
        docStack.pop();
      }
      log.pop();

    } else {
      log.info("Copying: %s", filename);
      copier.copy(relativePath);
      that.numCopied += 1;
    }
  };

  return that;
}

// Copy a file from one tree to another.
//   sourceTree: source tree
//   destTree: destination tree
function FileCopier(sourceTree, destTree) {
  return {
    // relPath: relative path of file to copy
    copy: function(relPath) {
      file.copy(sourceTree.path(relPath), destTree.path(relPath));
    }
  };
}

// Copy a file from one tree to another.
//   sourceTree: source tree
//   destTree: destination tree
function DocBuilder(converters, destTree) {
  // Holds info about what directories we created
  var dirMaker = filetree.DirMaker(destTree);

  return {
    // relPath: relative path of file to copy
    build: function(doc) {
      //log.info('Building %s', doc);
      ;
    }
  };
}

// Args:
//   source, dest: Path objects (TODO: Should be file system objects)
//   options: Object containing options parsed from flags/configuration.  Can
//       also override the default converters here.
//
// TODO: define exceptions raised on missing templates, etc.

exports.jesyllApp = jesyllApp = function(options) {
  var sourceTree = filetree.FileSystem(options.get('source-dir')),
      destTree = filetree.FileSystem(options.get('dest-dir'));

  log.info('*** %s -> %s', sourceTree.path(), destTree.path());

  var templatesDir = absolutePath(sourceTree, options.get('templates-dir')),
      templates = Templates(templatesDir),
      def = converters.DefaultConverters(),
      conv = options.converters || def;

  // To build docs, we need to convert their bodies, and then write them to the
  // destination tree.
  var sourceReader = SourceReader(sourceTree),
      docBuilder = DocBuilder(conv, destTree),
      copier = FileCopier(sourceTree, destTree);

  var handler = FileHandler(options, sourceReader, docBuilder, copier);
  // TODO
  filetree.walk(sourceTree, handler, {ignoreDirs: /^__/});

  log.info('Done writing to %s; %s files generated, %s files copied',
           options.get('dest-dir'), handler.numGenerated, handler.numCopied);
};

var convertDocs = exports.convertDocs = function(options) {
      var numGenerated = 0, numCopied = 0;

      var sourceTree = filetree.FileSystem(options.get('source-dir')),
          destTree = filetree.FileSystem(options.get('dest-dir'));

      var sourceFiles = listTree(sourceTree);

      for (var i = 0; i<sourceFiles.length; i++) {
        var sourceFile = sourceFiles[i],
            ext = file.extension(sourceFile);

        if (sourceFile.charAt(0) == '_' ||
            sourceFile.match(/\/_/) ||  // filename starts with _
            ext.match(sourceExtRegex)) {
          // Should be a debug log
          print("source file: " + sourceFile);
          numGenerated += 1;
        } else {
          print("Copying: " + sourceFile);
          copy(sourceTree, destTree, sourceFile);
          numCopied += 1;
          continue;
        }

        // TODO: This should probably be in globals?  But it's configuration,
        // not variables.
        var defaultDoc = {
            '.template': 'default',
            'body-type': 'html',  // Assume HTML -> no conversion
            // TODO: New extension should be configurable?  Probably not -- they
            // should just use _ as a prefix and use the actual extension.
            // Should the default date be taken from the file system?
            };

        var doc = handleSource(sourceTree, sourceFile);

        // TODO: unhide flag
        if (doc.get('.hidden')) {
          log.info('Skipping hidden file %s', sourceFile);
          continue;
        }

        // TODO: prepend a whole list of directories?
        doc.prepend(options.get('globals'), defaultDoc);

        log.debug("title: %s", doc.get('title'));

        // If we have a body-type and it's not already HTML, then pass it
        // through the converters.
        var bodyType = doc.get('body-type');
        if (bodyType && bodyType !== 'html') {
          print(json.stringify(doc.toObject(), null, 2));

          // Convert the body first
          try {
            var body = conv.makeBody(doc);
            // Overlay the new body on the old one
            doc.push({body:body});
          } catch (e) {
            // TODO: this is obsolete
            if (e.badext) {
              log.error("Can't convert %s with unknown extension %s", 
                        sourceFile, e.badext);
            } else {
              log.error("Error converting %s: %s", sourceFile,
                        json.stringify(e, null, 2));
              log.error(e.stack);
            }
            if (options.get('keep-going')) {
              continue;
            } else {
              break;
            }
          }
        }

        // Hack for now: special case &$body
        var bodyTemplateName = doc.get('&$body');
        if (bodyTemplateName) {
          var t = templates.getTemplate(bodyTemplateName),
              body = t.expand(doc.toObject());
          doc.push({body: body});
        }

        var html, newName;
        if (doc.get('.template').toLowerCase() === 'none') {
          // No template
          html = doc.get('body');
          newName = sourceFile;
        } else {
          // Put the body into its template
          try {
            html = templates.makeHtml(doc);
          } catch (e) {
            if (e.name == 'TemplateNotFound') {
              log.error("makeHtml: %s: %s (looked in %s)", e.name, e.message,
                        templatesDir);
            } else {
              log.error("makeHtml: %s: %s", e.name, e.message);
            }
            if (options.get('keep-going')) {
              continue;
            } else {
              break;
            }
          }
          // TODO: Should the new extension be a property of the template?
          // default.jsont -> default.html?
          newName = sourceFile.slice(0, -ext.length) + '.html'
        }

        // Remove leading _ on any path components
        newName = toDestPath(newName);

        log.info("Writing to destPath: %s", destTree.path(newName));
        try {
          var destFile = destTree.open(newName, 'w');
        } catch (e) {
          throw {
            name: 'CannotWriteDestinationFile',
            message: destTree.path(newName),
          };
        }

        destFile.write(html);
        destFile.close();
      }

      return {numGenerated: numGenerated, numCopied: numCopied};
};

var parseConfig = function(sourceDir) {
  var configPath = file.join(sourceDir, '__config.json');
  try {
    var f = file.open(configPath);
  } catch (e) {
    log.debug("No config file at %s", configPath);
    return {};
  }
  var contents = f.read();
  return util.parseJsonConfig(contents);
}

var jesyllMain = function (args) {
    var flags = parser.parse(args);

    // Initialize logger
    log.init({verbosity: flags.verbose ? log.DEBUG : log.INFO});

    //print(json.stringify(flags, null, 2));

    switch (flags.args.length) {
      case 0:
        break;
      case 1:
        // Treat the only positional arg as a flag value
        flags['source-dir'] = flags.args[0];
        break;
      default:
        // TODO: Should I accept an explicit list of files for auto-rebuild?
        log.fatal("Too many arguments: " + flags.args);
        os.exit();
    }

    var sourceDir = flags['source-dir'] || file.cwd();
    // Remove trailing / to construct dest-dir
    if (sourceDir.slice(-1) == '/') {
      sourceDir = sourceDir.slice(null, -1);
    }

    var defaults = {
      'templates-dir': '__templates',
      'keep-going': false,
      // default dest dir is related to source dir
      'source-dir': sourceDir,
      'dest-dir': file.join(sourceDir, '__output'),
      'source-extensions': ['markdown', 'json'],
      // By default, we should find the json files, and they can use .jsont
      // files
      'ignore-extensions': ['jsont'],
      'globals': {}
    };

    var config = parseConfig(sourceDir);
    // Options are separate from "vars"
    var options = util.VarStack(defaults, config, flags);
    // TODO: Test that destination dir starts with __, .., or / -- otherwise
    // infinite recursion will occur.

    jesyllApp(options);
};

exports.main = function main(args) {
  try {
    jesyllMain();
  } catch (e) {
    log.error("Error: %s", json.stringify(e));
    // Unfortunately printing e.stack only shows stuff in bootstrap.js
    //print(e.stack);
  }
}
