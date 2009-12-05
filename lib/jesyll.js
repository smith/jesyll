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
    "If a source directory isn't given, the current directory is assumed." +
    '\n'
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

// path could be absolute or relative.  If it's relative, it's relative to the
// file system.
var absolutePath = function(fs, path) {
  if (path.charAt(0) != '/') {
    return fs.path(path);
  } else {
    return path;
  }
}

var parseConfig = function(sourceTree) {
  try {
    var contents = sourceTree.contentsOf('__config.json');
  } catch (e) {
    log.debug("No config file at %s", sourceTree.path('__config.json'));
    return {};
  }
  return util.parseJsonConfig(contents);
}


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
    return template.expand(util.StackedContext(doc));
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

// Initialize it with a source tree, and then pass it a directory to read
// configuration from.
var makeConfigReader = exports.makeConfigReader = function(sourceTree) {

  // Args:
  //   dir: relative path of directory under sourceTree
  return function(dir) {
    var tree = filetree.FileSystem(sourceTree.path(dir));
    return parseConfig(tree);
  };
}

var makeSourceReader = exports.makeSourceReader = function(sourceTree) {

  // Get metadata and content from a source document
  return function(sourceFile) {
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
  };
};


// An object of this type is responsible for maintaining a VarStack.
// It passes the the doc to buildDoc, which in turn passes it to convertBody.
//
// Args:
//   docStack: Initial document stack
//   options: program options -- TODO: get rid of
//   readSource: function that reads a source document and returns an object
//   buildDoc: function to make the final doc
//   copy: function to copy a file from the source to the dest tree
var FileHandler = function(
    docStack, readConfig, readSource, buildDoc, copy, options) {

  var that = {
    numGenerated: 0,
    numCopied: 0,
    dirStack: []
  };

  var sourceExtRegex = new RegExp(options.get('source-extensions').join('|'));

  // TODO: Push the __config.json onto the document stack
  that.enterDir = function(dirName) {
    log.info('Entering dir: %s', dirName);
    log.push();  // indentation
    that.dirStack.push(dirName);

    var dirConfig = readConfig(that.dirStack.join('/'));
    docStack.push(dirConfig);
  };

  // TODO: Pop the document stack
  that.exitDir = function() {
    docStack.pop();
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

      var items = readSource(relativePath);
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
        var error = buildDoc(docStack);
        if (error) {
          log.error('Error converting %s: %s', filename, error);
          if (!options.get('keep-going')) {
            throw error;
          };
        }
        that.numGenerated += 1;
      }

      for (var i = 0; i < items.length; i++) {
        docStack.pop();
      }
      log.pop();

    } else {
      log.info("Copying: %s", relativePath);
      copy(relativePath);
      that.numCopied += 1;
    }
  };

  return that;
}

// Copy a file from one tree to another.
//   sourceTree: source tree
//   destTree: destination tree
function makeFileCopier(sourceTree, destTree, dirMaker) {
  // relPath: relative path of file to copy
  return function(relPath) {
    dirMaker.ensure(relPath);
    file.copy(sourceTree.path(relPath), destTree.path(relPath));
  };
}

// Converts and writes documents.
//   conv: Body Converters
//   templates: Directory of templates
//   destTree: destination tree
function makeDocBuilder(conv, templates, destTree, dirMaker) {
  // doc: VarStack representing the document
  // returns either an execption object or null
  return function(doc) {
    var sourceFile = doc.get('filename'),
        ext = file.extension(sourceFile),
        numPushed = 0;

    // If we have a body-type and it's not already HTML, then pass it
    // through the converters.
    var bodyType = doc.get('body-type');
    if (bodyType && bodyType !== 'html') {
      // Convert the body first
      try {
        var body = conv.makeBody(doc);
        // Overlay the new body on the old one
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
        return e;
      }
      doc.push({body: body});
      numPushed++;
    }

    // Hack for now: special case &$body
    var bodyTemplateName = doc.get('&$body');
    if (bodyTemplateName) {
      var t = templates.getTemplate(bodyTemplateName),
          body = t.expand(doc.toObject());
      doc.push({body: body});
      numPushed++;
    }

    var html, newName;
    if (doc.get('.template').toLowerCase() === 'none') {
      // No template
      html = doc.get('body');
      newName = doc.get('relative-path');
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
        for (var i = 0; i < numPushed; i++) {
          doc.pop();
        }
        return e;
      }
      // TODO: Should the new extension be a property of the template?
      // default.jsont -> default.html?
      newName = doc.get('relative-path').slice(0, -ext.length) + '.html'
    }

    // Remove leading _ on any path components
    // TODO: Implement custom dest-path: "{directory}/{basename}.{extension}"
    newName = toDestPath(newName);
    dirMaker.ensure(newName);

    log.info("Writing to destPath: %s", destTree.path(newName));
    destTree.writeFile(newName, html);

    for (var i = 0; i < numPushed; i++) {
      doc.pop();
    }

    return null;
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
  log.push();

  var templatesDir = absolutePath(sourceTree, options.get('templates-dir')),
      templates = Templates(templatesDir),
      def = converters.DefaultConverters(),
      conv = options.converters || def;

  // To build docs, we need to convert their bodies, and then write them to the
  // destination tree.
  var readSource = makeSourceReader(sourceTree),
      readConfig = makeConfigReader(sourceTree),
      // Holds info about what directories we created
      dirMaker = filetree.DirMaker(destTree),
      buildDoc = makeDocBuilder(conv, templates, destTree, dirMaker),
      copy = makeFileCopier(sourceTree, destTree, dirMaker);

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

  // Start it out with the default vars
  // TODO: Clarify distinction between config and vars:
  // .template
  // .hidden
  // .keep-going?
  var docStack = util.VarStack(defaultDoc, options.get('vars'));
  docStack.useFileSystem(sourceTree);

  var handler = FileHandler(
      docStack, readConfig, readSource, buildDoc, copy, options);
  // TODO
  filetree.walk(sourceTree, handler, {ignoreDirs: /^__/});

  log.pop();
  log.info('Done writing to %s; %s files generated, %s files copied',
           options.get('dest-dir'), handler.numGenerated, handler.numCopied);
};

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
      'vars': {}
    };

    var config = parseConfig(filetree.FileSystem(sourceDir));
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
    log.error("Error: %s", json.stringify(e, null, 2));
    log.error(e.stack);
    // Unfortunately printing e.stack only shows stuff in bootstrap.js
    //print(e.stack);
  }
}
