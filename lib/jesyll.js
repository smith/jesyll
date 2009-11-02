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

parser.option("-d", "--dir", "dir")
    .help("NYI: Operate from this working dir")
    .set(".");
    
parser.option("-V", "--version")
    .help("print the Jesyll version number and exit.")
    .action(function () {
        this.print("Jesyll Version 0.1");
        this.exit();
    });
    
parser.option("-h", "--help")
    .action(parser.printHelp);


Composite = function() {
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

// A source doc is textile/markdown/html/JSON Template preceded by "Front
// Matter".
//
// Returns: {metadata: {}, contents: "Hello"}
exports.parseSourceDoc = function(x) {
  return x;
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
          // A JSON file provides a data dictionary for a JSON Template.
          // Allow comments, even though it bastardizes the JSON a bit.  This
          // JSON is never served over the network.
          content = content.replace(/^#.*$/gm, '');
          print("content: " + content);
          var jsonData = json.parse(content);
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
  function getTemplate(name) {
    var template = templateCache[name];
    if (template === undefined) {
      layout = layoutsDir.join(name + '.jsont').open().read();
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
      // throws exceptions; caller handles
      var layoutName = metadata.layout || 'default';
      var template = getTemplate(layoutName);
      if (!template) {
        throw {name: 'LayoutNotFound', message: layoutName};
      }
      return template.expand(data);
    }
  }
}

var META_RE = /^\s*([a-zA-Z\-]+):\s*(.*)/;

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

// Args:
//   source, dest: Path objects (TODO: Should be file system objects)
//   options: Object containing options parsed from flags/configuration.  Can
//       also override the default converters here.
//
// TODO: define exceptions raised on missing layouts, etc.

exports.jesyllApp = jesyllApp = function(source, dest, options) {
  return {
    'run': function() {
      printf('Generate from %s to %s', source, dest);

      var converters = options.converters || DefaultConverters();

      var layoutsDir = source.join('_layouts');
      var layouts = Layouts(layoutsDir);

      var postsDir = source.join('_posts');
      var docsDir = source.join('_docs');

      // TODO: Sort out behavior of _docs vs. _posts
      try {
        var sourceFiles = postsDir.list();
      } catch (e) {
        var sourceFiles = docsDir.list();
      }
      print("srcs " + sourceFiles);

      try {
        file.mkdir(dest);
      } catch (e) {
        // Already exists
        // TODO: Should be a log.debug
        print(e);
      }

      var metadataLines = [];
      var content;

      for (var i=0; i<sourceFiles.length; i++) {
        var filename = sourceFiles[i];
        var sourceFile = docsDir.join(filename);

        // Should be a debug log
        print("filename: " + sourceFile);

        var f = sourceFile.open();
        var firstLine = f.readLine();
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
            printf("Can't convert %s with unknown extension %s", filename,
                e.badext);
          } else {
            printf("Error converting %s: %s", filename, json.stringify(e));
            printf(e.stack);
          }
          continue;
        }

        var metadata = parseMetadata(metadataLines);
        try {
          var html = layouts.makeHtml(metadata, body);
        } catch (e) {
          printf("Error expanding template: %s", e.message);
          continue;
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

exports.main = function main(args) {
    var flags = parser.parse(args);
    
    //if (options.args.length > 1) {
    //    parser.printHelp(options);
    //    parser.exit(options);
    //}
    //var config = options.args[0];

    print("Hello from jesyll");
    p = file.path('.').list();
    print("path[0]: " +  p[0]);

    print("args " +flags.args);

    // This syntax matches Jekyll
    var source, dest;
    switch (flags.args.length) {
      case 0:
        source = '.';
        dest = '_site';
        break;
      case 1:
        source = '.';
        dest = flags.args[0];
        break;
      case 2:
        source = flags.args[0];
        dest = flags.args[1];
        break;
      default:
        print("Too many arguments: " + flags.args);
        os.exit();
    }

    // TODO: use file.chroot(source), file.chroot(dest) when they're available
    // TODO: Why does this change '.' -> '' ?
    source = file.path(source);
    dest = file.path(dest);

    // TODO: Should I accept an explicit list of files for auto-rebuild?
    print("Source " + source);
    var options = flags;
    jesyllApp(source, dest, options).run();
};

if (module.id == require.main) {
    exports.main(system.args);
}
