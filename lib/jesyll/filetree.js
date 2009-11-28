// This module has functions related to a file tree or "virtual file system".

var file = require("file");
var log = require("jesyll/log");

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

  // Returns the contents of a file, raising an exception if anything goes
  // wrong.
  that.contentsOf = function(path) {
    var f = that.open(path),
        contents = f.read();
    f.close();
    return contents;
  }

  return that;
}


// Walks a file system
//
// Args:
//   fs: e.g. FileSystem('/home/andy/hg/json-template')
//   handler: object with enterDir, exitDir, and onFile methods

var walk = exports.walk = function(fs, handler) {
  var listing = fs.list();
  listing.sort();
  for (var i = 0; i < listing.length; i++) {
    var entry = listing[i];
    // TODO: Implement ignore-extensions
    // Ignore stuff that starts with.  TODO: Could make this a parameter.
    if (entry.match(/^__/)) {
      continue;
    }
    if (fs.isDirectory(entry)) {
      handler.enterDir(entry);
      walk(FileSystem(fs.path(entry)), handler);
      handler.exitDir();
    } else {
      handler.onFile(entry);
    }
  }
};

// Collects relative paths
var RelativePathHandler = function() {
  var that = {};
  that.dirStack = [];
  that._relPath = '';  // "cached" to save computation in onFile
  that.paths = [];  // public

  that.enterDir = function(dirName) {
    that.dirStack.push(dirName);
    that._relPath += '/';
    that._relPath += dirName;
  };

  that.exitDir = function() {
    that.dirStack.pop();
    that._relPath = that.dirStack.join('/');
  };

  that.onFile = function(filename) {
    that.paths.push(that._relPath + '/' + filename);
  };

  return that;
}

var listTree = exports.listTree = function(fs) {
  var handler = RelativePathHandler();
  walk(fs, handler);
  return handler.paths;
}

// Initialize this with a file system object, and then call it with filenames in
// order to ensure that you can write to the file.
var DirMaker = exports.DirMaker = function(tree) {
  var exists = {};  // cache of directory existence

  // First ensure the root exists
  try {
    file.mkdir(tree.path());
  } catch (e) {
    log.info('Could not create %s: %s', tree.path(), e);
  }
  return {
    ensure: function(relPath) {
      var slashIndex = 0;

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
        log.info('Created directory %s', dir);
        exists[dir] = true;
      }
    }
  };
};

