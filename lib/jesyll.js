var file = require("file");

var parser = new (require("args").Parser)();

parser.usage(' [jesyll]');
parser.help('Runs the Jesyll tool to generate a static HTML site.');

parser.option("-s", "--server", "server")
    .help("serve using SERVER")
    .set(true);
    
parser.option("-V", "--version")
    .help("print Jesyll version number and exit.")
    .action(function () {
        this.print("Jesyll Version 0.1");
        this.exit();
    });
    
parser.option("-h", "--help")
    .action(parser.printHelp);

exports.main = function main(args) {
    var options = parser.parse(args);
    
    if (options.args.length > 1) {
        parser.printHelp(options);
        parser.exit(options);
    }
    
    var config = options.args[0];

    print("Hello from jesyll");
    p = file.path('.').list();
    print("path[0]: " +  p[0]);

    var markdown = require('markdown');
    var html = markdown.encode('This is *Jesyll*');
    print("html " + html);

    var jsontemplate = require('json-template');
    var t = jsontemplate.Template('Hello {name}');
    var html = t.expand({'name': 'Jesyll'});
    print("html " + html);
};

if (module.id == require.main) {
    exports.main(system.args);
}
