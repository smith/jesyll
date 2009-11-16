var file = require("file"),
    json = require("json"),
    printf = require("printf").printf,
    os = require("os"),
    markdown = require('markdown'),
    jsontemplate = require('json-template');

var parser = new (require("args").Parser)();

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
  file.copy(from + '/' + relPath, to + '/' + relPath);
}

var parseJsonConfig = function(contents) {
  // Allow comments, even though it bastardizes the JSON a bit.  This
  // JSON is never served over the network.

  contents = contents.replace(/^\s*#.*$/gm, '');
  return json.parse(contents);
}

// root: /home/andy/hg/json-template  subdir: python
// Mutates the paths argument (a list of paths)
var walkHelper = function(root, subdir, paths) {
  var listing = file.list(root + '/' + subdir);  // an array of plain filenames
  listing.sort();
  for (var i = 0; i < listing.length; i++) {
    var entry = listing[i],
        relativePath;
    // Ignore stuff that starts with.  TODO: Could make this a parameter.
    if (entry.match(/^__/)) {
      continue;
    }
    if (subdir == '') {
      relativePath = entry;
    } else {
      relativePath = subdir + '/' + entry;
    }
    if (file.isDirectory(root + '/' + relativePath)) {
      walkHelper(root, relativePath, paths);
    } else {
      paths.push(relativePath);
    }
  }
}

// Given a root directory, returns an array of all the relative paths of files
// under that subtree.
var walk = exports.walk = function(root) {

  var paths = [];
  walkHelper(root, '', paths);
  return paths;
}

function expandJson(jsonData, baseDir) {
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
var DefaultConverters = function(templates, globals) {
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
          converted = 'JSON DUMMY';  // TODO
          break;
          print("content: " + content);
          // A JSON file provides a data dictionary for a JSON Template.
          var jsonData = parseJsonConfig(content);
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
}

// A registry of templates
var Templates = function(templatesDir) {
  var templateCache = {};
  var that = {};

  // Raises: TemplateNotFound if the template doesn't exist

  that.getTemplate = function(name) {
    var template = templateCache[name];
    if (template === undefined) {
      var templatePath = templatesDir.join(name + '.jsont')
      try {
        var templateFile = templatePath.open();
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
function prepareDestDir(dest, sourceFiles) {
  try {
    file.mkdir(dest);
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
      var dir = dest + '/' + relPath.slice(null, slashIndex);
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

// Args:
//   source, dest: Path objects (TODO: Should be file system objects)
//   options: Object containing options parsed from flags/configuration.  Can
//       also override the default converters here.
//
// TODO: define exceptions raised on missing templates, etc.

exports.jesyllApp = jesyllApp = function(options) {
  return {
    run: function() {
      var source = file.path(options.get('source-dir')),
          dest = file.path(options.get('dest-dir'));

      var sourceExtRegex = new RegExp(
          options.get('source-extensions').join('|'));

      printf('Writing from from %s to %s', source, dest);

      var templatesDir = source.join(options.get('templates-dir')),
          templates = Templates(templatesDir),
          converters = options.converters || 
                       DefaultConverters(templates, options.get('globals'));

      var sourceFiles = walk(source);

      // Make directories and check that it's empty
      prepareDestDir(dest, sourceFiles);

      for (var i = 0; i<sourceFiles.length; i++) {
        var sourceFile = file.path(sourceFiles[i]),
            ext = file.extension(sourceFile);

        if (sourceFile.charAt(0) == '_' || 
            sourceFile.match(/\/_/) ||  // filename starts with _
            ext.match(sourceExtRegex)) {
          // Should be a debug log
          print("source file: " + sourceFile);
        } else {
          print("Copying: " + sourceFile);
          copy(source, dest, sourceFile);
          continue;
        }

        var fullPath = source + '/' + sourceFile,
            f = file.open(fullPath),
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
          f = file.open(fullPath);
          content = f.read();  // the rest is content
        }

        var defaultMeta = {
            template: 'default'
            // Should the default date be taken from the file system?
            };
        var extracted = extractMetadata(sourceFile),
            parsed = parseMetadata(metadataLines),
            metadata = Composite(defaultMeta, extracted, parsed);

        print("title " + metadata.get('title'));

        // Convert the body first
        try {
          var body = converters.makeBody(
              sourceFile, metadata.get('source-type'), content);
        } catch (e) {
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
          newName = sourceFile.slice(0, -ext.length) + '.html'
        }

        // Remove leading _ on any path components
        newName = toDestPath(newName);

        var destPath = dest + '/' + newName;

        printf("Writing to destPath: %s", destPath);
        try {
          var destFile = file.open(destPath, 'w');
        } catch (e) {
          throw {
            name: 'CannotWriteDestinationFile',
            message: destFile,
          };
        }

        destFile.write(html);
        destFile.close();
        print(".");
      }

    }
  };
}

var parseConfig = function(source) {
  var configPath = source.join('__config.json');
  var config;
  try {
    var f = configPath.open();
  } catch (e) {
    printf("No config file at %s", configPath);
    return {};
  }
  var contents = f.read();
  return parseJsonConfig(contents);
}

exports.main = function main(args) {
    var flags = parser.parse(args);

    print("Hello from jesyll");
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

    // TODO: use file.chroot(source), file.chroot(dest) when they're available
    // TODO: Why does this change '.' -> '' ?

    var sourceDir = flags['source-dir'] || file.cwd();
    // Remove trailing / to construct dest-dir
    if (sourceDir.slice(-1) == '/') {
      sourceDir = sourceDir.slice(null, -1);
    }

    var defaults = {
      'templates-dir': '__templates',
      'keep-going': false,
      // default dest dir is related to source dir
      'source-dir': file.path(sourceDir),
      'dest-dir': file.path(sourceDir + '-site'),
      'source-extensions': ['markdown', 'json'],
      // By default, we should find the json files, and they can use .jsont
      // files
      'ignore-extensions': ['jsont'],
      'globals': {}
    };
    print(json.stringify(defaults, null, 2));

    var config = parseConfig(file.path(sourceDir));

    var options = Composite(defaults, config, flags);
    // TODO: Test that destination dir doesn't overlap with source dir, or it
    // lives in a __ dir.  Otherwise the directory will blow up on repeated
    // runs.
    print("options source-dir " + options.get('source-dir'));
    print("options dest-dir " + options.get('dest-dir'));

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
