// This module has functions related to a file tree or "virtual file system".

var file = require("file");
var log = require("recipe/log");

// Helper for normalize() and join()
// Args:
//   parts: An array of path fragments
//   makeNormal: Whether to normalize out '..' and '.'
// Returns:
//   A path string, could be absolute or relative, depending on input
var processPathParts = function(parts, makeNormal) {
  var newParts = [];
  for (var i = 0; i < parts.length; i++) {
    newParts.push.apply(newParts, parts[i].split('/'));
  }

  var stack = [],
      lastPart = newParts.length-1;
  for (i = 0; i < newParts.length; i++) {
    var part = newParts[i];
    if (i !== 0 && i !== lastPart && part === '') {
      continue;
    }
    if (makeNormal) {
      if (part === '.') {
        continue;
      }
      if (part === '..') {
        stack.pop();
      } else {
        stack.push(part);
      }
    } else {
      stack.push(part);
    }
  }
  return stack.join('/');
}

// Joins path fragments, making sure that there is exactly 1 path separator
// between path parts.
//
// Args:
//   A variable number of path parts, e.g. 'foo/', 'spam/eggs', '/bar'
// Returns:
//   A path string (could be absolute or relative)
var join = exports.join = function() {
  return processPathParts(arguments, false);
}

// Normalize a path or an array of path fragments.
//
// Args:
//   A variable number of path parts, e.g. 'foo/../bar', '../eggs', '.'.
//   Commonly used with just one path fragment.
// Returns:
//   A path string with '..' and '.' entries accounted for
var normalize = exports.normalize = function() {
  return processPathParts(arguments, true);
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

  // Returns the contents of a file
  // Args:
  //   errorVal: Return this value if there is an error.  If this argument isn't
  //   passed, then the original exception is thrown and should be handled by
  //   the caller.
  that.contentsOf = function(path, errorVal) {
    try {
      var f = that.open(path);
    } catch(e) {
      if (errorVal !== undefined) {
        return errorVal;
      } else {
        throw e;
      }
    }
    var contents = f.read();
    f.close();
    return contents;
  }

  // Writes a file all at once.  TODO: Work out error handling.
  that.writeFile = function(path, contents) {
    var f = that.open(path, 'w');
    f.write(contents);
    f.close();
  }

  return that;
}


// Does a depth-first search of a file tree, calling callbacks in the handler.
//
// Args:
//   fs: e.g. FileSystem('/home/andy/hg/json-template')
//   handler: object with enterDir, exitDir, and onFile methods.  enterTree, if
//      it exists, is called for the root directory, and likewise exitDir is
//      called after all files are processed.  This can be useful when files 
//      in the root aren't special cases.
//   options: 
//     ignoreDirs: If a directory name matches this regular expression, then
//     don't descend into it.  (This is in the API because it saves stat calls)

var walk = exports.walk = function(fs, handler, options, recursive) {
  options = options || {};
  if (!recursive && handler.enterTree) {
    handler.enterTree();
  }
  var ignoreDirs = options.ignoreDirs || null;
  try {
    var listing = fs.list();
  } catch (e) {
    log.error('Error listing directory %s', fs.path());
    throw e;
  }
  listing.sort();
  for (var i = 0; i < listing.length; i++) {
    var entry = listing[i];
    if (fs.isDirectory(entry)) {
      if (ignoreDirs && entry.match(options.ignoreDirs)) {
        continue;
      }
      handler.enterDir(entry);
      walk(FileSystem(fs.path(entry)), handler, options, true);
      handler.exitDir();
    } else {
      handler.onFile(entry);
    }
  }
  if (!recursive && handler.exitTree) {
    handler.exitTree();
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
// Holds info about what directories were already created.
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

