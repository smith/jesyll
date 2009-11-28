// Tests for filetree.js

var assert = require("test/assert");
var log = require("jesyll/log");

var filetree = require('jesyll/filetree');  // under test

var WalkHandler = function() {
  var that = {};

  that.enterDir = function(dirName) {
    log.info('Entered dir %s', dirName);
    log.push()
  };

  that.exitDir = function() {
    log.pop()
    log.info('Exiting dir');
  };

  that.onFile = function(filename) {
    log.info('Visiting file %s', filename);
  };

  return that;
}

exports.testWalk = function() {
    //return;  // DISABLED
    //var paths = jesyll.walk('.');
    var fs = filetree.FileSystem('/home/andy/hg/json-template');
    var handler = WalkHandler();
    filetree.walk(fs, handler);
}

exports.testListTree = function() {
    var fs = filetree.FileSystem('/home/andy/hg/json-template');

    var paths = filetree.listTree(fs);
    for (var i=0; i < paths.length; i++) {
      print(paths[i]);
    }
}

exports.testFileSystem = function() {
    var fs = filetree.FileSystem('');
    print(fs.list());
    print(fs.open('nw.sh', 'r'));
    //fs.mkdir('junk');
    //assert.eq('ds', fs.contentsOf('nw.sh1'));
    //assert.eq('ds', fs.contentsOf('nw.sh'));

    fs = filetree.FileSystem('/usr/');
    print(fs.path());
    print(fs.path('foo'));
    assert.eq(fs.path(), '/usr/')
    assert.eq(fs.path('lib'), '/usr/lib')

    fs = filetree.FileSystem('/usr');
    assert.eq(fs.path(), '/usr/')
    assert.eq(fs.path('lib'), '/usr/lib')

}

exports.testDirMaker = function() {
    var maker = filetree.DirMaker(filetree.FileSystem('/tmp/test'));
    maker.ensure('foo/bar.txt');
    maker.ensure('spam/eggs/bar.txt');
}

if (require.main === module.id)
    require("test/runner").run(exports);
