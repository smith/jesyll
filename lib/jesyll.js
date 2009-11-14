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

parser.option("-w", "--server", "server")
    .help("NYI: run a web server")
    .set(true);

// This should be an argument
parser.option("-?", "--source-dir", "source-dir")
    .help("Read source files from this directory")
    .set();

parser.option("-d", "--dest-dir", "dest-dir")
    .help("Write output tree into this directory")
    .set();

parser.option("-l", "--layouts-dir", "layouts-dir")
    .help("Layouts directory")
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
      printf(' ** Descending into directory %s (%s)', entry, relativePath);
      walkHelper(file.path(relativePath), paths);
    } else {
      paths.push(relativePath);
      //print(relativePath);
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
    makeBody: function(filename, content) {
      var ext = file.extension(filename);
      var converted = null;
      switch (ext) {
        case '.html':  // Allow HTML fragments
          converted = content;
          break;
        case '.markdown':
          // TODO: Catch errors
          converted = markdown.encode(content);
          break;
        case '.json':
          print("content: " + content);
          // A JSON file provides a data dictionary for a JSON Template.
          var jsonData = parseJsonConfig(content);
          print("JSON: " + jsonData);

          // TODO: Figure out relative dirs and such
          var defaultLayout = filename.slice(0, -ext.length) + '.jsont';
          var layoutName = jsonData.$layout || defaultLayout;

          // TODO: Have to parse metadata from the layout too
          printf("layoutName %s", layoutName);
          var t = file.path(layoutName).open().read();
          printf("t %s", t);
          var template = jsontemplate.fromString(t);
          converted = template.expand(jsonData);
          break;
        default:
          throw new Error({badext: ext});
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
          title: metadata.title,
        },
        content: body,
      };
      print(json.stringify(data));
      // throws exceptions; caller handles
      var layoutName = metadata.layout || 'default';
      print("layoutName " + layoutName);
      var template = getTemplate(layoutName);
      print("template " + template);
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
          dest   = file.path(options.get('dest-dir'));
      printf('Generate from %s to %s', source, dest);

      var converters = options.converters || DefaultConverters();

      var layoutsDir = source.join(options.get('layouts-dir'));
      var layouts = Layouts(layoutsDir);

      var sourceFiles = walk(source);

      print("srcs " + sourceFiles);

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

        try {
          var body = converters.makeBody(sourceFile, content);
        } catch (e) {
          if (e.badext) {
            printf("Can't convert %s with unknown extension %s", sourceFile,
                e.badext);
          } else {
            printf("Error converting %s: %s", sourceFile, json.stringify(e));
            printf(e.stack);
          }
          if (options.get('keep-going')) {
            continue;
          } else {
            break;
          }
        }

        var metadata = parseMetadata(metadataLines);
        print(json.stringify(metadata));
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

        var ext = file.extension(filename);
        var newName = filename.slice(0, -ext.length) + '.html';
        var destPath = dest.join(newName);
        var destFile = destPath.open("w");
        destFile.write(html);
        destFile.close();
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
    
    //if (options.args.length > 1) {
    //    parser.printHelp(options);
    //    parser.exit(options);
    //}
    //var config = options.args[0];
    //
    
    print("Hello from jesyll");
    p = file.path('.').list();
    print("path[0]: " +  p[0]);

    print("args " +flags.args);

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
    //
    var sourceDir = flags['source-dir'] || file.cwd();
    sourceDir = file.path(sourceDir).absolute();

    print(json.stringify(defaults));
    printf("sourceDir: %s", sourceDir);
    printf("dest-dir: %s", flags['dest-dir']);
    var config = parseConfig(sourceDir);

    var defaults = {
      'layouts-dir': '__layouts',
      'keep-going': false
    };
    var options = Composite(defaults, config, flags);
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
