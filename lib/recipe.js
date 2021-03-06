// Main Recipe app / library
//
// TODO: Docstring

// This package
var converters = require('recipe/converters'),
    doc = require('recipe/doc'),
    log = require('oil/log'),
    oil = require('oil'),
    oilPath = require('oil/path'),
    plugins = require('recipe/plugins'),
    util = require('recipe/util');

var assert = require("test/assert"),  // print errors nicely
    args = require("args"),
    file = require("file"),
    json = require("json"),
    jsontemplate = require('json-template'),
    os = require("os");

var parser = new args.Parser();

parser.usage('<source dir>');

parser.help(
    'Recipe generates static HTML sites.\n' +
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
    .help("print the Recipe version number and exit.")
    .action(function () {
        this.print("Recipe Version 0.1");
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
};

// path could be absolute or relative.  If it's relative, it's relative to the
// file system.
var absolutePath = function(fs, path) {
  if (path.charAt(0) != '/') {
    return fs.path(path);
  } else {
    return path;
  }
};

// Returns data object from the __config.json, if any
// Args:
//   dir: Optional subdirectory in sourceTree
var readConfig = function(sourceTree, dir) {
  var path;
  if (dir) {
    path = oilPath.join(dir, '__config.json');
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
};

// A registry of templates
var Templates = function(templatesDir) {
  this.templatesDir = templatesDir;
  this.templateCache = {};
}

Templates.prototype = {

  // Raises: TemplateNotFound if the template doesn't exist

  getTemplate: function(name) {
    var template = this.templateCache[name];
    if (template === undefined) {
      var templatePath = oilPath.join(this.templatesDir, name + '.jsont');
      try {
        var templateFile = file.open(templatePath);
      } catch (e) {
        throw {name: 'TemplateNotFound', message: name};
      }
      var template = templateFile.read();
      templateFile.close();
      var template = jsontemplate.fromString(template);
      this.templateCache[name] = template;
    }
    return template;
  },

  // Returns a full HTML page
  makeHtml: function(doc) {
    // throws exceptions; caller handles
    var templateName = doc.get('.template'),
        template = this.getTemplate(templateName);
    //log.info('doc %s', doc.debugString());
    return template.expand(new util.StackedContext(doc));
  },

  // For error messages
  dir: function() {
    return this.templatesDir;
  }

};

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

  this.docStack = docStack;
  this.sourceTree = sourceTree;
  this.buildDoc = buildDoc;
  this.indexBuilder = indexBuilder;
  this.copy = copy;
  this.options = options;

  this.pm = new plugins.PluginManager(sourceTree);

  this.numGenerated = 0;
  this.numCopied = 0;
  this.dirStack = [];

  this.sourceExtRegex = new RegExp(options.get('source-extensions').join('|'));

  var sourceFilter = options.get('source-filter');
  if (sourceFilter) {
    var r = new RegExp(sourceFilter);
    this.sourceFilter = function(path) { return !!path.match(r); };
  } else {
    this.sourceFilter = function(path) { return true; };
  }
}

FileHandler.prototype = {

  /* PRIVATE */

  // Recompute members derived from 'dirStack'
  _recompute: function() {
    this.currentDir = this.dirStack.join('/');
    this.destDir = toDestPath(this.currentDir) + '/';  // need trailing slash
  },

  // Check the name of the *current* file to see if it's a source file
  _checkIsSource: function(ext) {
    var isSource;
    if (ext.match(this.sourceExtRegex)) {
      isSource = true;
    } else {
      // If the filename or any directory starts with _, consider it source
      for (var i = 0; i < this.dirStack.length; i++) {
        if (this.dirStack[i].charAt(0) == '_') {
          isSource = true;
          break;
        }
      }
    }
    return isSource;
  },

  /* PUBLIC */

  // Called before every doc
  enterTree: function(dirName) {
    log.info('Entering source dir');
    log.push();  // indentation

    this.pm.enterDir();
    this.docStack.push({dest: {dir: ''}});
    this.indexBuilder.enterDir('');
    // We already read the configuration, so don't read it again
  },

  // Called after every doc
  exitTree: function(dirName) {
    this.indexBuilder.exitDir();
    this.docStack.pop();  // for per-dir doc defaults
    this.pm.exitDir();

    log.pop();  // indentation
    log.info('Leaving source dir');

    // Check invariants
    assert.eq(0, this.dirStack.length);
    assert.isTrue(this.pm.empty());
    assert.isTrue(this.indexBuilder.empty());
  },

  // Called before entering each directory
  // When we enter a directory, we look for:
  //   __config.json   Contains variables and other config data
  //   __plugins.js    Contains code
  //   _index.jsont    Template to be expanded with child data
  enterDir: function(dirName) {
    log.info('Entering dir: %s', dirName);
    log.push();  // indentation

    this.dirStack.push(dirName);
    this._recompute();  // after modifying dirStack

    this.pm.enterDir(this.currentDir);

    // The default destination dir is a "cleaned" source dir.  Can be overidden
    // in __config.json
    this.docStack.push({dest: {dir: this.destDir}});

    var dirConfig = readConfig(this.sourceTree, this.currentDir),
        vars = dirConfig.vars || {};
    this.docStack.push(vars);

    this.indexBuilder.enterDir(this.destDir);
  },

  // Called after exiting each directory
  exitDir: function() {
    this.indexBuilder.exitDir();
    this.docStack.pop();  // for per-dir doc defaults
    this.docStack.pop();  // for per-dir __config
    this.pm.exitDir();

    this.dirStack.pop();
    this._recompute();  // after modifying dirStack

    log.pop();  // indentation
    log.info('Leaving dir');
  },

  // Called for every file
  onFile: function(filename) {
    // Directories starting with __ were already ignored by the walker
    if (filename.slice(0, 2) == '__') {
      log.info('Ignoring: %s', filename)
      return;  // EARLY RETURN
    }

    this.dirStack.push(filename);

    var ext = file.extension(filename),
        relativePath = this.dirStack.join('/'),
        isSource = this._checkIsSource(ext);

    this.dirStack.pop();

    if (!this.sourceFilter(relativePath)) {
      return;  // EARLY RETURN
    }

    if (isSource) {
      // Should be a debug log
      log.info("Source file: %s", filename);
      log.push();

      var items = doc.readSource(this.sourceTree, relativePath);

      // Default extension is HTML.  Defaults can be overidden per doc.
      this.docStack.push(
          {dest: {basename: filename.slice(0, -ext.length), ext: '.html'}}
          );

      // Push each in the array of items on the stack
      for (var i = 0; i < items.length; i++) {
        this.docStack.push(items[i]);
      }

      var numPushed = this.pm.onDoc(this.docStack);

      // TODO: --unhide flag
      var skip = false;
      if (this.docStack.get('.hidden')) {
        log.info('Skipping hidden file %s', filename);
        skip = true;
      }

      if (this.docStack.get('.index')) {
        this.indexBuilder.onIndexDoc(relativePath);
        skip = true;
      }

      if (!skip) {
        var error = this.buildDoc(this.docStack);
        if (error) {
          log.error('Error converting %s: %s', filename, error);
          if (!this.options.get('keep-going')) {
            throw error;
          }
        }
        this.numGenerated += 1;
        this.indexBuilder.onDoc(items);
      }

      // Now pop everything we pushed when evaluating plugins
      for (var i = 0; i < numPushed; i++) {
        this.docStack.pop();
      }

      // Pop the actual doc
      for (var i = 0; i < items.length; i++) {
        this.docStack.pop();
      }

      this.docStack.pop();  // for defaults

      log.pop();

    } else {
      log.info("Copying: %s", relativePath);
      this.copy(relativePath);
      this.numCopied += 1;
    }
  }

};

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

exports.recipeApp = recipeApp = function(options) {
  var sourceTree = new oil.FileSystem(options.get('source-tree')),
      destTree = new oil.FileSystem(options.get('dest-tree'));

  log.info('*** %s -> %s', sourceTree.path(), destTree.path());
  if (options.get('source-filter')) {
    log.info('SOURCE FILTER: %s', options.get('source-filter'));
  }
  log.push();

  var templatesDir = absolutePath(sourceTree, options.get('templates-dir')),
      templates = new Templates(templatesDir),
      def = converters.DefaultConverters(),
      conv = options.converters || def;

  // To build docs, we need to convert their bodies, and then write them to the
  // destination tree.
  var dirMaker = oil.DirMaker(destTree),
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
  var docStack = new util.VarStack(defaultDoc, options.get('vars'));
  docStack.useFileSystem(sourceTree);

  var indexBuilder = new doc.IndexBuilder(sourceTree, docStack, buildDoc);

  var handler = new FileHandler(
      docStack, sourceTree, buildDoc, indexBuilder, copy, options);
  oil.walk(sourceTree, handler, {ignoreDirs: /^__/});

  assert.eq(2, docStack.size());  // Should be back down to 2

  log.pop();
  log.info('Done writing to %s; %s files generated, %s files copied',
           options.get('dest-tree'), handler.numGenerated, handler.numCopied);
};

var recipeMain = function (argv) {
    var flags = parser.parse(argv);

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
      'dest-tree': oilPath.join(sourceDir, '__output'),
      'source-extensions': ['markdown', 'json'],
      // By default, we should find the json files, and they can use .jsont
      // files
      'ignore-extensions': ['jsont'],
      'vars': {}
    };

    // The top level __config.json can have some extra global configuration, so
    // read it before doing the source file scan.
    var config = readConfig(new oil.FileSystem(sourceDir));
    var options = new util.VarStack(defaults, config, flags);

    // TODO: Test that destination dir starts with __, .., or / -- otherwise
    // infinite recursion will occur.

    recipeApp(options);
};

exports.main = function main(argv) {
  //try {
    recipeMain(argv);
  //} catch (e) {
  //  log.error("Error: %s", json.stringify(e, null, 2));
  //  log.error(e.stack);
  //}
};
