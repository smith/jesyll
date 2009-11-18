// Main Jesyll app / library
//
// TODO: Docstring

// This package
var converters = require('jesyll/converters'),
    util = require('jesyll/util');

var args = require("args"),
    file = require("file"),
    json = require("json"),
    jsontemplate = require('json-template'),
    os = require("os"),
    printf = require("printf").printf;

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

parser.option("-i", "--version")
    .help("print the Jesyll version number and exit.")
    .action(function () {
        this.print("Jesyll Version 0.1");
        this.exit();
    });

// TODO: This is broken in narwhal-v8, because the engine also reads argv
parser.option("-h", "--help")
    .action(parser.printHelp);


//
// Possibly generic infrastructure
//

var Composite = exports.Composite = function() {
  var objs = arguments;
  return {
    get: function(name) {
      for (var i = objs.length-1; i >= 0; i--) {
        var value = objs[i][name];
        if (value !== undefined) {
          return value;
        }
      }
      return undefined;
    }
  };
}

// This is a chroot-like object
// The methods accept relative paths.
var FileSystem = exports.FileSystem = function(root) {
  var that = {};

  // Normalize trailing slash, except when root is empty
  if (root != '' && root.slice(-1) !== '/') {
    root += '/';
  }

  // Return an absolute path, given a relative path
  that.path = function(path) {
    path = path || '';
    return root + path;
  }

  // List a directory, or the root directory if none is given
  that.list = function(path) {
    return file.list(that.path(path));
  }

  // Unlike the others, requires a path, since the root is guaranteed to be a
  // directory
  that.open = function(path, mode) {
    return file.open(root + path, mode);
  }

  that.mkdir = function(path) {
    return file.mkdir(that.path(path));
  }

  // Return an absolute path, given a relative path
  that.isDirectory = function(path) {
    return file.isDirectory(that.path(path));
  }

  return that;
}

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

// Copy a file from one tree to another.
//   from: source tree
//   to: destination tree
//   relPath: relative path of file
var copy = function(from, to, relPath) {
  file.copy(from.path(relPath), to.path(relPath));
}

//
// Jesyll-specific
//

// root: /home/andy/hg/json-template  subdir: python
// Mutates the paths argument (a list of paths)
var walkHelper = function(fs, subdir, paths) {
  var listing = fs.list(subdir);
  listing.sort();
  for (var i = 0; i < listing.length; i++) {
    var entry = listing[i],
        relativePath;
    // TODO: Implement ignore-extensions
    // Ignore stuff that starts with.  TODO: Could make this a parameter.
    if (entry.match(/^__/)) {
      continue;
    }
    if (subdir == '') {
      relativePath = entry;
    } else {
      relativePath = subdir + '/' + entry;
    }
    if (fs.isDirectory(relativePath)) {
      walkHelper(fs, relativePath, paths);
    } else {
      paths.push(relativePath);
    }
  }
}

// Given a FileSystem object, returns an array of all the relative paths under
// it.
var walk = exports.walk = function(fs) {
  var paths = [];
  walkHelper(fs, '', paths);
  return paths;
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
  that.makeHtml = function(metadata, body) {
    var data = {
      title: metadata.get('title'),
      content: body,
    };
    // throws exceptions; caller handles
    var templateName = metadata.get('template') || 'default',
        template = that.getTemplate(templateName);
    return template.expand(data);
  };

  return that;
}

var META_RE = /^\s*([a-zA-Z\-]+):\s*(.*)/;

// Parses "front matter" at the top of a source file.
var parseMetadata = exports.parseMetadata = function(lines) {
  var metadata = {}
  for (var i=0; i<lines.length; i++) {
    var line = lines[i];
    var match = line.match(META_RE);
    if (match) {
      var name = match[1].toLowerCase(), value = match[2];
      metadata[name] = trim(value);
    } else {
      // TODO: logging
      printf('WARNING: invalid metadata line: %s', line);
    }
  }
  return metadata;
}

// Extracts metadata from a filename.
// TODO: possibly get categories/tags from the directory tree?
var extractMetadata = exports.extractMetadata = function(filename) {
  var ext = file.extension(filename),
      basename = file.basename(filename, ext),
      // Ignore leading _ or __ when calculating title
      title = basename.replace(/^_{1,2}/, ''),
      meta = {};

  // Try to extract a date first.
  var match = basename.match(/(\d{4})-(\d{2})-(\d{2})-(.+)/);
  if (match) {
    meta = {
      year: parseInt(match[1]),
      month: parseInt(match[2]),
      day: parseInt(match[3]),
    };
    title = match[4];
  }

  if (ext !== "") {
    meta['source-type'] = ext.slice(1);  // drop leading .
  }

  meta['title'] = title.replace(/-/g, ' ');

  return meta;
}

// Makes a directory tree in "dest" like sourceFiles, with a minimal number of
// mkdir() system calls.
var prepareDestDir = function(tree, sourceFiles) {
  try {
    tree.mkdir();
  } catch (e) {
    // Already exists
    // TODO: Should be a log.debug
    print(e);
  }
  var exists = {};  // cache of directory existence
  for (var i = 0; i < sourceFiles.length; i++) {

    var relPath = toDestPath(sourceFiles[i]),
        slashIndex = 0;

    // Make directories so that relPath can be written, starting from the
    // "parent" end.
    while (true) {
      slashIndex = relPath.indexOf('/', slashIndex+1);
      if (slashIndex == -1) {
        break;
      }
      var dir = tree.path(relPath.slice(null, slashIndex));
      if (exists[dir]) {  // We already found that it exists earlier
        continue;
      }
      if (file.exists(dir)) {
        exists[dir] = true;
        continue;
      }
      file.mkdir(dir);
      exists[dir] = true;
    }
  }
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

// Get metadata and content from a source file
var handleSource = function(sourceTree, sourceFile) {
  var f = sourceTree.open(sourceFile),
      firstLine = f.readLine(),
      metadataLines = [],
      content;

  if (trim(firstLine) == "---") {
    while (true) {
      var line = f.readLine();
      if (trim(line) == "---") {
        break;
      }
      metadataLines.push(line);
    }
    content = f.read();  // the rest is content
  } else {
    // No metadata, back up and read it all again
    // TODO: rewind() doesn't exist?
    //f.rewind();
    f.close();
    f = sourceTree.open(sourceFile),
    content = f.read();  // the rest is content
  }

  var defaultMeta = {
      template: 'default'
      // TODO: New extension should be configurable?  Probably not -- they
      // should just use _ as a prefix and use the actual extension.
      // Should the default date be taken from the file system?
      };
  var extracted = extractMetadata(sourceFile),
      parsed = parseMetadata(metadataLines),
      metadata = Composite(defaultMeta, extracted, parsed);

  return {metadata: metadata, content: content};
}


// Args:
//   source, dest: Path objects (TODO: Should be file system objects)
//   options: Object containing options parsed from flags/configuration.  Can
//       also override the default converters here.
//
// TODO: define exceptions raised on missing templates, etc.

exports.jesyllApp = jesyllApp = function(options) {
  return {
    run: function() {
      var sourceTree = FileSystem(options.get('source-dir')),
          destTree = FileSystem(options.get('dest-dir'));

      printf('*** %s -> %s', sourceTree.path(), destTree.path());

      var sourceExtRegex =
          new RegExp(options.get('source-extensions').join('|'));

      var templatesDir = absolutePath(sourceTree, options.get('templates-dir')),
          templates = Templates(templatesDir),
          def = converters.DefaultConverters(
              templates, options.get('globals'), sourceTree),
          conv = options.converters || def;

      var sourceFiles = walk(sourceTree);

      // Make directories and check that it's empty
      prepareDestDir(destTree, sourceFiles);

      for (var i = 0; i<sourceFiles.length; i++) {
        var sourceFile = sourceFiles[i],
            ext = file.extension(sourceFile);

        if (sourceFile.charAt(0) == '_' || 
            sourceFile.match(/\/_/) ||  // filename starts with _
            ext.match(sourceExtRegex)) {
          // Should be a debug log
          print("source file: " + sourceFile);
        } else {
          print("Copying: " + sourceFile);
          copy(sourceTree, destTree, sourceFile);
          continue;
        }

        var s = handleSource(sourceTree, sourceFile);
            metadata = s.metadata,
            content = s.content;

        print("title: " + metadata.get('title'));

        // Convert the body first
        try {
          var body = conv.makeBody(metadata.get('source-type'), content);
        } catch (e) {
          // TODO: this is obsolete
          if (e.badext) {
            printf("Can't convert %s with unknown extension %s", sourceFile,
                e.badext);
          } else {
            printf("Error converting %s: %s", sourceFile,
                   json.stringify(e, null, 2));
            //printf(e.stack);
          }
          if (options.get('keep-going')) {
            continue;
          } else {
            break;
          }
        }
        
        var html, newName;
        if (metadata.get('template').toLowerCase() === 'none') {
          // No template
          html = body;
          newName = sourceFile;
        } else {
          // Put the body into its template
          try {
            html = templates.makeHtml(metadata, body);
          } catch (e) {
            if (e.name == 'TemplateNotFound') {
              printf("makeHtml: %s: %s (looked in %s)", e.name, e.message,
                  templatesDir);
            } else {
              printf("makeHtml: %s: %s", e.name, e.message);
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

        printf("Writing to destPath: %s", destTree.path(newName));
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
        print(".");
      }

    }
  };
}

var parseConfig = function(sourceDir) {
  var configPath = file.join(sourceDir, '__config.json');
  try {
    var f = file.open(configPath);
  } catch (e) {
    printf("No config file at %s", configPath);
    return {};
  }
  var contents = f.read();
  return util.parseJsonConfig(contents);
}

exports.main = function main(args) {
    var flags = parser.parse(args);

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
        print("Too many arguments: " + flags.args);
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
      'dest-dir': sourceDir + '-site',
      'source-extensions': ['markdown', 'json'],
      // By default, we should find the json files, and they can use .jsont
      // files
      'ignore-extensions': ['jsont'],
      'globals': {}
    };

    var config = parseConfig(sourceDir);
    var options = Composite(defaults, config, flags);
    // TODO: Test that destination dir doesn't overlap with source dir, or it
    // lives in a __ dir.  Otherwise the directory will blow up on repeated
    // runs.

    jesyllApp(options).run();
};

if (module.id == require.main) {
  //try {
    exports.main(system.args);
  // Unfortunately printing e.stack only shows stuff in bootstrap.js
  //} catch (e) {
  //  print("CAUGHT");
  //  print(e.stack);  
  //}
}
