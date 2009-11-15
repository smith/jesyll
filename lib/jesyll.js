var file = require("file"),
    json = require("json"),
    printf = require("printf").printf,
    os = require("os"),
    markdown = require('markdown'),
    jsontemplate = require('json-template');

var parser = new (require("args").Parser)();

parser.usage('<source dir> <dest dir>')

parser.help(
    'Jesyll generates static HTML sites.\n' +
    '\n' +
    'jekyll                                                   # . -> ./_site\n' +
    'jekyll <path to write generated site>                    # . -> <path>\n' +
    'jekyll <path to source> <path to write generated site>   # <path> -> <path>\n');

parser.option("-s", "--server", "server")
    .help("NYI: run a web server")
    .set(true);

parser.option("-d", "--dest-dir", "dest-dir")
    .help("Write output tree into this directory")
    .set();

parser.option("-l", "--layouts-dir", "layouts-dir")
    .help("Layouts directory")
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
trim = function(str) {
  return str.replace(/^\s+/, '').replace(/\s+$/, '');
}

var parseJsonConfig = function(contents) {
  // Allow comments, even though it bastardizes the JSON a bit.  This
  // JSON is never served over the network.
        
  contents = contents.replace(/^#.*$/gm, '');
  return json.parse(contents);
}

// Mutates the paths argument (a list of paths)
var walkHelper = function(subdir, paths) {
  var listing = subdir.list();
  listing.sort();
  for (var i = 0; i < listing.length; i++) {
    var entry = listing[i];
    var relativePath;
    if (subdir == '') {
      relativePath = entry;
    } else {
      relativePath = subdir + '/' + entry;
    }
    if (file.isDirectory(relativePath)) {
      walkHelper(file.path(relativePath), paths);
    } else {
      paths.push(relativePath);
    }
  }
}

var walk = exports.walk = function(root) {
  var paths = [];
  walkHelper(root, paths);
  return paths;
}

var DefaultConverters = function() {
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
          print("content: " + content);
          // A JSON file provides a data dictionary for a JSON Template.
          var jsonData = parseJsonConfig(content);
          print("JSON: " + jsonData);

          // TODO: Figure out relative dirs and such
          // TODO: Have to parse metadata from the layout too
          var defaultLayout = filename.slice(0, -ext.length) + '.jsont',
              layoutName = jsonData.$layout || defaultLayout,
              t = file.path(layoutName).open().read(),
              template = jsontemplate.fromString(t);
          converted = template.expand(jsonData);
          break;
        default:
          throw {name: 'UnknownSourceType', message: sourceType};
      }
      return converted;
    }
  }
}

// A registry of layouts
var Layouts = function(layoutsDir) {
  var templateCache = {};

  // A layout is defined by a template
  //
  // Raises: LayoutNotFound if the layout doesn't exist

  function getTemplate(name) {
    var template = templateCache[name];
    if (template === undefined) {
      var layoutPath = layoutsDir.join(name + '.jsont')
      try {
        var layoutFile = layoutPath.open();
      } catch (e) {
        throw {name: 'LayoutNotFound', message: name};
      }
      var layout = layoutFile.read();
      layoutFile.close();
      var template = jsontemplate.fromString(layout);
      templateCache[name] = template;
    }
    return template;
  }

  return {
    // Returns a full HTML page
    makeHtml: function(metadata, body) {
      var data = {
        page: {
          title: metadata.get('title'),
        },
        content: body,
      };
      // throws exceptions; caller handles
      var layoutName = metadata.get('layout') || 'default',
          template = getTemplate(layoutName);
      return template.expand(data);
    }
  }
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
var extractMetadata = exports.extractMetadata = function(filename) {
  var ext = file.extension(filename),
      basename = file.basename(filename, ext),
      title = basename,
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

// Args:
//   source, dest: Path objects (TODO: Should be file system objects)
//   options: Object containing options parsed from flags/configuration.  Can
//       also override the default converters here.
//
// TODO: define exceptions raised on missing layouts, etc.

exports.jesyllApp = jesyllApp = function(options) {
  return {
    run: function() {
      var source = file.path(options.get('source-dir')),
          dest = file.path(options.get('dest-dir'));

      printf('Writing from from %s to %s', source, dest);

      var converters = options.converters || DefaultConverters(),
          layoutsDir = source.join(options.get('layouts-dir')),
          layouts = Layouts(layoutsDir);

      var sourceFiles = walk(source);

      try {
        file.mkdir(dest);
      } catch (e) {
        // Already exists
        // TODO: Should be a log.debug
        print(e);
      }

      for (var i=0; i<sourceFiles.length; i++) {
        var sourceFile = file.path(sourceFiles[i]);

        // Paths to ignore
        if (sourceFile.match(/^__/) || sourceFile.match(/\/__/)) {
          continue;
        }

        // Should be a debug log
        print("filename: " + sourceFile);

        var f = sourceFile.open(),
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
          f = sourceFile.open();
          content = f.read();  // the rest is content
        }

        var defaultMeta = {
            layout: 'default'
            // Should the default date be taken from the file system?
            };
        var extracted = extractMetadata(sourceFile),
            parsed = parseMetadata(metadataLines),
            metadata = Composite(defaultMeta, extracted, parsed);

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

        // Then put the body into its layout
        try {
          var html = layouts.makeHtml(metadata, body);
        } catch (e) {
          if (e.name == 'LayoutNotFound') {
            printf("%s: %s (looked in %s)", e.name, e.message, layoutsDir);
          } else {
            printf("%s: %s", e.name, e.message);
          }
          if (options.get('keep-going')) {
            continue;
          } else {
            break;
          }
        }

        var ext = file.extension(sourceFile),
            newName = sourceFile.slice(0, -ext.length) + '.html';
            destPath = dest.join(newName),
            destFile = destPath.open("w");


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
      'layouts-dir': '__layouts',
      'keep-going': false,
      // default dest dir is related to source dir
      'source-dir': file.path(sourceDir),
      'dest-dir': file.path(sourceDir + '-site')
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
  try {
    exports.main(system.args);
  } catch (e) {
    print("CAUGHT");
    //print(e.stack);
  }
}
