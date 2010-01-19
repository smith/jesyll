// Stuff that is a dependency of the main app and the converter plugins in
// converters.js.

var log = require("oil/log"),
    json = require("json"),
    jsontemplate = require("json-template"),
    os = require("os");


// Like Python's str.strip()
var trim = exports.trim = function(str) {
  return str.replace(/^\s+/, '')
            .replace(/\s+$/, '');
};

var isArray = function(value) {
  return value && value.constructor === Array;
};

// Allow comments, even though it bastardizes the JSON a bit.  This
// JSON is never served over the network.
var parseJsonConfig = exports.parseJsonConfig = function(contents) {
  contents = contents.replace(/^\s*#.*$/gm, '');
  try {
    var obj = json.parse(contents);
  } catch (e) {
    log.error('Syntax error in JSON:');
    log.error(contents);
    throw e;
  }
  return obj;
};

// Implements the interface for JSON Template's data dictionaries -- on top of
// the VarStack.getPath() interface.
//
// We just maintain the location of the cursor as a path.  Many template
// expansions happen over a given VarStack -- each one uses a StackedContext.
//
// TODO:
//
// - Implement looking up the stack

var StackedContext = exports.StackedContext = function(varStack) {
  this.varStack = varStack;
  this.path = [];
  this.iteration = [];  // Stack to keep track of iteration
};

StackedContext.prototype = {

  pushName: function(name) {
    this.path.push(name);
    this.iteration.push({iterating: false, len: 0});
    //log.info('pushName %s returning %s', name, varStack.getPath(path));
    return this.varStack.getPath(this.path);  // pushName returns the value too
  },

  pop: function() {
    this.iteration.pop();
    this.path.pop();
  },

  next: function() {
    var stacktop = this.iteration[this.iteration.length-1];
    if (!stacktop.iterating) {
      // Check the current length
      var len = this.varStack.getPath(this.path).length;  
      stacktop = {iterating: true, len: len};  // Now were iterating
      this.iteration.push(stacktop);
      this.path.push(0);
      return true;
    } 
    
    var index = this.path[this.path.length-1];
    if (index == stacktop.len-1) {
      this.iteration.pop();
      this.path.pop();
      return undefined;  // sentinel to say that we're done
    }

    // Mutate the top of the path
    this.path[this.path.length-1]++;
    return true;
  },

  get: function(name) {
    var items = name.split('.');  // for {dest.dir} syntax
    this.path.push.apply(this.path, items);  // extend it with all items
    //log.info('StackedContext getPath %s', path);
    var value = this.varStack.getPath(this.path);
    // remove items.length elements from the end -- the ones we just added
    this.path.splice(this.path.length - items.length, items.length);
    //log.info('StackedContext %s returning %s', name, value);
    return value;
  },

  toString: function() {
    return '<StackedContext ' + json.stringify(this.path) + '>';
  }
};

// Trivial wrapper around an Array to work around the fact that we can't
// subclass Array.
function OperationList(arrayValues) {
  this.arrayValues = arrayValues;
}

// Compiles keys beginning with & and $ into read() functions and template
// objects
function compile(obj) {
  //print('COMPILING');
  var compiled = {};
  for (var name in obj) {
    var value = obj[name];
        operations = new OperationList([value]);

    while (true) {
      var firstChar = name.charAt(0);
      if (firstChar == '$' || firstChar == '&'){
        name = name.slice(1);
        operations.arrayValues.push(firstChar);
      } else {
        if (operations.arrayValues.length == 1) {
          compiled[name] = value;
        } else {
          compiled[name] = operations;
        }
        break;
      }
    }
  }
  return compiled;
}

// VarStack is the central abstraction for configuration in Jesyll.  A sequence
// of JSON files / front matter gets converted to a VarStack.
//
// Variables can be plain JSON objects, or special expressions:
//
// url: "http://foo"                          'url' is a plain string
// $url: "http://{domain}/index.html"         'url' is a template
// &url: "dir/url.txt"                        The value of 'url' is in url.txt
//
// The $ and & operators can be combined.

var VarStack = exports.VarStack = function() {
  this.fs = null;  // file system object
  this.objs = [];

  // Compile each argument and push it on the stack
  // Accept either VarStack([a, b]) or VarStack(a, b)
  var entries = isArray(arguments[0]) ? arguments[0] : arguments;
  for (var i = 0; i < entries.length; i++) {
    //log.info('pushing %s', json.stringify(entries));
    this.objs.push(compile(entries[i]));
  }
};

VarStack.prototype = {

  // only for testing
  _objs: function() {
    return this.objs;
  },

  // For a "single level" object
  get: function(name) {
    return this.getPath([name]);
  },

  evalValue: function(operations) {
    var current = operations[0];

    for (var j = 1; j < operations.length; j++) {
      switch (operations[j]) {

        case '$':
          log.push();
          log.info("evalValue: Expanding template '%s'", current);
          var t = jsontemplate.fromString(current);
          // RECURSIVE construction of VarStack
          current = t.expand(new StackedContext(this));
          log.pop();
          break;

        case '&':
          log.debug('evalValue: Reading file %s', current);
          if (this.fs) {
            current = this.fs.contentsOf(current);
          } else {
            throw {
              name: 'NoFileSystem',
              message: "Can't expand &files without useFileSystem(fs)"
            };
          }
          break;

        default:
          break;
      }
    }
    //log.info("evalValue: Value is '%s'", current);
    return current;
  },

  // Given a "path" like ['foo', 'bar'], the value of the variable, looking
  // through the stack of objects.
  //
  // Algorithm: start with the entire stack of objects.  Try to look up each
  // path component, and only keep the ones where the lookup was successful.
  // Repeated until the path is exhausted, and return the topmost match.
  getPath: function(path) {
    //log.info('%% getPath %s', path)

    // considerNow is reversed -- top has lower indices
    var considerNow = [];
    for (var i = this.objs.length-1; i >= 0; i--) {
      considerNow.push(this.objs[i]);
    }
    var considerNext = [];

    for (var i = 0; i < path.length; i++) {
      var pathElement = path[i];
      // Easiest to put this logic here, instead of in StackedContext. A @ is
      // basicaly a noop.
      if (pathElement === '@') {
        continue;
      }
      //log.info('Looking for %s', pathElement)
      for (var j = 0; j < considerNow.length; j++) {
        var context = considerNow[j],
            value = context[pathElement];
        if (value instanceof OperationList) {  
          // BUG TODO: Even though a higher stack element has doc-dest, I might
          // still evaluate a lower doc-dest that depends on undefined variables
          value = this.evalValue(value.arrayValues);
          considerNext.push(value);
        } else if (value !== undefined) {
          //log.info('consider %s for %s', v, pathElement);
          considerNext.push(value);
        }
      }
      if (considerNext.length === 0) {
        return undefined;
      }
      considerNow = considerNext;
      considerNext = [];
    }
    //log.info('getPath returning %s', json.stringify(considerNow[0], null, 2));
    return considerNow[0];  // return the topmost one
  },

  // Push a new object on the variable stack (e.g. a document).
  push: function(obj) {
    this.objs.push(compile(obj));
  },

  // Pop from the variable stack.  (Not to be confused with StackedContext.pop!)
  pop: function() {
    return this.objs.pop();
  },

  // Get size of stack
  size: function() {
    return this.objs.length;
  },

  // TODO: Delete?
  prepend: function() {
    var args = [0, 0];
    for (var i = 0; i < arguments.length; i++) {
      args.push(arguments[i]);
    }
    // JS is weird -- need to repeat objs here
    this.objs.splice.apply(this.objs, args);
  },

  // For debugging, show what names are on which stack levels
  debugString: function() {
    var parts = ['---\n'];
    for (var i = 0; i < this.objs.length; i++) {
      parts.push(i);
      parts.push(' ');
      for (var name in this.objs[i]) {
        parts.push(name);
        parts.push(' ');
      }
      parts.push('\n');
    }
    parts.push('---\n');
    return parts.join('');
  },

  // A shorter version of debugString
  toString: function() {
    return '<VarStack (' + this.objs.length + ' items)>';
  },

  // Set the file system -- use in a method chaining style.  var o =
  // VarStack(...).useFileSystem(fs)
  useFileSystem: function(fileSystem) {
    this.fs = fileSystem;
    return this;
  }

};

var ProcRunner = exports.ProcRunner = function(logger) {
  this.logger = logger;
};

ProcRunner.prototype = {
  stdout: function (cmd) {
    this.logger.debug('Running: %s', cmd);
    return os.command(cmd);
  }
};
