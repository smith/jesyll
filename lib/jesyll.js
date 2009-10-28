var file = require("file"),
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


exports.dummy = function(x) {
  return x;
}


// source, dest: File system objects
// options: parsed from flags

exports.jesyllApp = jesyllApp = function(source, dest, options) {
  return {
    'run': function() {
      printf('Generate from %s to %s', source, dest);
      var posts = source.join('_posts');
      printf("posts %s", posts);
      var sourceFiles = posts.list();
      print("srcs " + sourceFiles);

      try {
        file.mkdir(dest);
      } catch (e) {
        // Already exists
        // TODO: Should be a log.debug
        print(e);
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
        source = '.'; dest = '_site';
        break;
      case 1:
        source = '.'; dest = options.args[0];
        break;
      case 2:
        source = options.args[0]; dest = options.args[1];
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
