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
    
parser.option("-V", "--version")
    .help("print the Jesyll version number and exit.")
    .action(function () {
        this.print("Jesyll Version 0.1");
        this.exit();
    });
    
parser.option("-h", "--help")
    .action(parser.printHelp);


// Like Python's str.strip()
strip = function(str) {
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
    makeBody: function(content, ext) {
      var converted = null;
      switch (ext) {
        case '.markdown':
          // TODO: Catch errors
          converted = markdown.encode(content);
          break
        default:
          throw new Error(ext);
      }
      return converted;
    }
  }
}


// A registry of layouts
var Layouts = function(layoutsDir) {
  var defaultLayout = layoutsDir.join('default.html').open().read();

  // TODO: Catch template compile errors
  var template = jsontemplate.Template(defaultLayout, {meta: "{{}}"});

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
      return template.expand(data);
    }
  }
}

var parseMetadata = function(lines) {
  return {
    title: "dummy title",
  };
}

// source, dest: File system objects
// options: parsed from flags.  Can also override the default converters here.
// TODO: define exceptions raised on missing layouts, etc.

exports.jesyllApp = jesyllApp = function(source, dest, options) {
  return {
    'run': function() {
      printf('Generate from %s to %s', source, dest);

      var converters = options.converters || DefaultConverters();

      var layoutsDir = source.join('_layouts');
      var layouts = Layouts(layoutsDir);

      var postsDir = source.join('_posts');
      printf("posts %s", postsDir);
      var sourceFiles = postsDir.list();
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
        var sourceFile = postsDir.join(filename);

        // Should be a debug log
        print("filename: " + sourceFile);

        var f = sourceFile.open();
        var firstLine = f.readLine();
        if (strip(firstLine) == "---") {
          while (true) {
            var line = f.readLine();
            if (strip(line) == "---") {
              break;
            }
            metadataLines.push(line);
          }
          content = f.read();  // the rest is content
        } else {
          // No metadata, back up and read it all again
          // TODO: This doesn't exist?
          //f.rewind();
          content = f.read();  // the rest is content
        }

        var ext = file.extension(filename);
        try {
          var body = converters.makeBody(content, ext);
        } catch (e) {
          printf("Can't convert %s with unknown extension %s", filename, ext);
          continue;
        }

        var metadata = parseMetadata(metadataLines);
        try {
          var html = layouts.makeHtml(metadata, body);
        } catch (e) {
          printf("Error expanding template: %s", e.message);
          continue;
        }

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
    var options = parser.parse(args);
    
    //if (options.args.length > 1) {
    //    parser.printHelp(options);
    //    parser.exit(options);
    //}
    //var config = options.args[0];

    print("Hello from jesyll");
    p = file.path('.').list();
    print("path[0]: " +  p[0]);

    var html = markdown.encode('This is *Jesyll*');
    print("html " + html);

    var t = jsontemplate.Template('Hello {name}');
    var html = t.expand({'name': 'Jesyll'});
    print("html " + html);
    print("args " +options.args);

    // This syntax matches Jekyll
    var source, dest;
    switch (options.args.length) {
      case 0:
        source = '.';
        dest = '_site';
        break;
      case 1:
        source = '.';
        dest = options.args[0];
        break;
      case 2:
        source = options.args[0];
        dest = options.args[1];
        break;
      default:
        print("Too many arguments: " + options.args);
        os.exit();
    }

    // TODO: use file.chroot(source), file.chroot(dest) when they're available
    // TODO: Why does this change '.' -> '' ?
    source = file.path(source);
    dest = file.path(dest);

    print("Source " + source);
    jesyllApp(source, dest, options).run();
};

if (module.id == require.main) {
    exports.main(system.args);
}
