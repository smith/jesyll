// Main Jesyll app / library
//
// TODO: Docstring

// This package
var converters = require('jesyll/converters'),
    doc = require('jesyll/doc'),
    log = require('jesyll/log'),
    util = require('jesyll/util');
    filetree = require('jesyll/filetree');

var assert = require("test/assert"),  // print errors nicely
    args = require("args"),
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

parser.option("-d", "--dest-tree", "dest-tree")
    .help("Write output tree into this directory")
    .set();

parser.option("-f", "--source-filter", "source-filter")
    .help("Only process source files whose relative path matches this regex")
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

// Returns data object from the __config.json, if any
// Args:
//   dir: Optional subdirectory in sourceTree
var readConfig = function(sourceTree, dir) {
  var path;
  if (dir) {
    path = filetree.join(dir, '__config.json');
  } else {
    path = '__config.json';
  }
  try {
    var contents = sourceTree.contentsOf(path);
    log.info("Using configuration at %s", sourceTree.path(path));
  } catch (e) {
    log.debug("No configuration at %s", sourceTree.path(path));
    return {};
  }
  return util.parseJsonConfig(contents);
}

// Global variable that __plugins.js should augment.  We read it and clear it
// on every plugin file.
var PLUGINS = {};

// Returns an object of the plugins defined in __plugins.js, if any
// Args:
//   dir: Optional subdirectory in sourceTree
var readPlugins = function(sourceTree, dir) {
  var path;
  if (dir) {
    path = filetree.join(dir, '__plugins.js');
  } else {
    path = '__plugins.js';
  }
  try {
    var contents = sourceTree.contentsOf(path);
  } catch (e) {
    log.info("Didn't find %s", path);
    return {};
  }
  log.info('LOADING %s', path);
  // Side effect is to set variables on PLUGINS.  TODO: Prevent plugins from
  // modifying globals, like the test runner does?
  try {
    eval(contents);
  } catch (e) {
    log.error('Error executing plugin %s', path);
    throw e;
  }
  var localPlugins = {};
  for (var name in PLUGINS) {
    localPlugins[name] = PLUGINS[name];
    delete PLUGINS[name];  // it should be fresh every time
  }
  return localPlugins;
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
    //log.info('doc %s', doc.debugString());
    return template.expand(util.StackedContext(doc));
  };

  // For error messages
  that.dir = function() { return templatesDir; }

  return that;
}

// An object of this type is responsible for maintaining a VarStack.
// It passes the the doc to buildDoc, which in turn passes it to convertBody.
//
// Args:
//   docStack: Initial document stack
//   sourceTree: FileSystem to read source files out of
//   buildDoc: function to make the final doc
//   copy: function to copy a file from the source to the dest tree
//   options: program options
var FileHandler = function(
    docStack, sourceTree, buildDoc, indexBuilder, copy, options) {

  var that = {
    numGenerated: 0,
    numCopied: 0,
    pluginStack: [],  // for __plugins.js
    dirStack: [],  // to know the current directory
  };

  var sourceExtRegex = new RegExp(options.get('source-extensions').join('|')),
      sourceFilter = options.get('source-filter');
  if (sourceFilter) {
    var r = new RegExp(sourceFilter);
    sourceFilter = function(path) { return !!path.match(r); }
  } else {
    sourceFilter = function(path) { return true; }
  }

  // Recompute things derived from the dirStack
  var recompute = function() {
    that.currentDir = that.dirStack.join('/');
    that.destDir = toDestPath(that.currentDir) + '/';  // need trailing slash
  }

  that.enterTree = function(dirName) {
    log.info('Entering source dir');
    log.push();  // indentation
    that.pluginStack.push(readPlugins(sourceTree));
    docStack.push({dest: {dir: ''}});
    indexBuilder.enterDir('');
    //log.info('DEST DIR "%s"', docStack.getPath(['dest', 'dir']));
    //
    // We already read the configuration, so don't read it again
  }

  that.exitTree = function(dirName) {
    indexBuilder.exitDir();
    docStack.pop();  // for per-dir doc defaults
    that.pluginStack.pop();
    log.pop();  // indentation
    log.info('Leaving source dir');

    // Check invariants
    assert.eq(0, that.dirStack.length);
    assert.eq(0, that.pluginStack.length);
    assert.isTrue(indexBuilder.empty());
  }

  // When we jnter a directory, we look for:
  //   __config.json   Contains variables and other config data
  //   __plugins.js    Contains code
  //   _index.jsont    Template to be expanded with child data
  that.enterDir = function(dirName) {
    log.info('Entering dir: %s', dirName);
    that.dirStack.push(dirName);
    recompute();  // after modifying dirStack
    log.push();  // indentation

    var plugins = readPlugins(sourceTree, that.currentDir);
    that.pluginStack.push(plugins);

    // The default destination dir is a "cleaned" source dir.  Can be overidden
    // in __config.json
    docStack.push({dest: {dir: that.destDir}});
    //log.info('DEST DIR "%s"', docStack.getPath(['dest', 'dir']));

    var dirConfig = readConfig(sourceTree, that.currentDir),
        vars = dirConfig.vars || {};
    docStack.push(vars);

    indexBuilder.enterDir(that.destDir);
  };

  that.exitDir = function() {
    indexBuilder.exitDir();
    docStack.pop();  // for per-dir doc defaults
    docStack.pop();  // for per-dir __config
    that.dirStack.pop();
    recompute();  // after modifying dirStack
    that.pluginStack.pop();
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

    if (!sourceFilter(relativePath)) {
      //log.info('Skipping %s', relativePath);
      that.dirStack.pop();
      return;  // EARLY RETURN
    }

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

      var items = doc.readSource(sourceTree, relativePath);

      // Default extension is HTML.  Defaults can be overidden per doc.
      docStack.push(
          {dest: {basename: filename.slice(0, -ext.length), ext: '.html'}}
          );

      // Push each in the array of items on the stack
      for (var i = 0; i < items.length; i++) {
        docStack.push(items[i]);
      }

      // Now push all __plugins.js functions
      var numPushed = 0;
      for (var i = 0; i < that.pluginStack.length; i++) {
        var entry = that.pluginStack[i];
        if (entry.onDocPush) {
          //log.info('Running onDocPush %s', i);
          try {
            var result = entry.onDocPush(docStack);
          } catch (e) {
            log.error('Caught exception executing onDocPush');
            throw e;
          }
          if (result) {
            var debugString = '';
            for (var name in result) {
              if (result.hasOwnProperty(name)) {
                debugString += name;
                debugString += ' ';
              }
            }
            //log.info('Pushing keys %s', debugString);
            docStack.push(result);
            numPushed++;
          }
        }
      }

      // TODO: --unhide flag
      var skip = false;
      if (docStack.get('.hidden')) {
        log.info('Skipping hidden file %s', filename);
        skip = true;
      }

      if (docStack.get('.index')) {
        indexBuilder.onIndexDoc(relativePath);
        skip = true;
      }

      if (!skip) {
        var error = buildDoc(docStack);
        if (error) {
          log.error('Error converting %s: %s', filename, error);
          if (!options.get('keep-going')) {
            throw error;
          };
        }
        that.numGenerated += 1;
        indexBuilder.onDoc(items);
      }

      // Now pop everything we pushed when evaluating plugins
      for (var i = 0; i < numPushed; i++) {
        docStack.pop();
      }

      // Pop the actual doc
      for (var i = 0; i < items.length; i++) {
        docStack.pop();
      }

      docStack.pop();  // for defaults

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
  // returns either an exception object or null
  return function(doc) {
    var sourceFile = doc.get('filename'),
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
                    templates.dir());
        } else {
          log.error("makeHtml: %s: %s", e.name, e.message);
        }
        for (var i = 0; i < numPushed; i++) {
          doc.pop();
        }
        return e;
      }
      // The default doc has a name for this
      newName = doc.get('doc-dest');
    }

    // Remove leading _ on any path components
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
  var sourceTree = filetree.FileSystem(options.get('source-tree')),
      destTree = filetree.FileSystem(options.get('dest-tree'));

  log.info('*** %s -> %s', sourceTree.path(), destTree.path());
  if (options.get('source-filter')) {
    log.info('SOURCE FILTER: %s', options.get('source-filter'));
  }
  log.push();

  var templatesDir = absolutePath(sourceTree, options.get('templates-dir')),
      templates = Templates(templatesDir),
      def = converters.DefaultConverters(),
      conv = options.converters || def;

  // To build docs, we need to convert their bodies, and then write them to the
  // destination tree.
  var dirMaker = filetree.DirMaker(destTree);
      buildDoc = makeDocBuilder(conv, templates, destTree, dirMaker),
      copy = makeFileCopier(sourceTree, destTree, dirMaker);

  // TODO: This should probably be in globals?  But it's configuration,
  // not variables.
  var defaultDoc = {
      '.template': 'default',
      '.hidden': false,
      'body-type': 'html',  // Assume HTML -> no conversion
      // dest.dir is set when we enter a directory (needs trailing /)
      // dest.basename and dest.ext (needs leading .) are set for each file
      '$doc-dest': '{dest.dir}{dest.basename}{dest.ext}'
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

  var indexBuilder = doc.IndexBuilder(sourceTree, docStack, buildDoc);

  var handler = FileHandler(
      docStack, sourceTree, buildDoc, indexBuilder, copy, options);
  filetree.walk(sourceTree, handler, {ignoreDirs: /^__/});

  assert.eq(2, docStack.size());  // Should be back down to 2

  log.pop();
  log.info('Done writing to %s; %s files generated, %s files copied',
           options.get('dest-tree'), handler.numGenerated, handler.numCopied);
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
        flags['source-tree'] = flags.args[0];
        break;
      default:
        // TODO: Should I accept an explicit list of files for auto-rebuild?
        log.fatal("Too many arguments: " + flags.args);
        os.exit();
    }

    var sourceDir = flags['source-tree'] || file.cwd();
    // Remove trailing / to construct dest-dir
    if (sourceDir.slice(-1) == '/') {
      sourceDir = sourceDir.slice(null, -1);
    }

    var defaults = {
      'templates-dir': '__templates',
      'keep-going': false,
      // default dest dir is related to source dir
      'source-tree': sourceDir,
      'dest-tree': file.join(sourceDir, '__output'),
      'source-extensions': ['markdown', 'json'],
      // By default, we should find the json files, and they can use .jsont
      // files
      'ignore-extensions': ['jsont'],
      'vars': {}
    };

    // The top level __config.json can have some extra global configuration, so
    // read it before doing the source file scan.
    var config = readConfig(filetree.FileSystem(sourceDir));
    var options = util.VarStack(defaults, config, flags);

    // TODO: Test that destination dir starts with __, .., or / -- otherwise
    // infinite recursion will occur.

    jesyllApp(options);
};

exports.main = function main(args) {
  //try {
    jesyllMain();
  //} catch (e) {
  //  log.error("Error: %s", json.stringify(e, null, 2));
  //  log.error(e.stack);
  //}
}
