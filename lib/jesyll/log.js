// Simple logging module.
//
// TODO: Would be nice to have JSON Template style logs:
//
// var obj = {name: 'world'};
// log.info('Hello {name}', obj);

var printf = require("printf").printf;

// Constant log levels

var FATAL = exports.FATAL = 10;
var ERROR = exports.ERROR = 20;
var WARNING = exports.WARNING = 30;
var INFO = exports.INFO = 40;
var DEBUG = exports.DEBUG = 50;


var Logger = exports.Logger = function (options) {

  var that = {};
  var options = options || {};

  that.verbosity = options.verbosity || 40;  // Show INFO and above by default
  that.indentSize = options.indentSize || 2;  // number of spaces per indent
  that.spaces = '';

  that.debug = function() {
    if (that.verbosity >= DEBUG) {
      arguments[0] = that.spaces + arguments[0];
      printf.apply(null, arguments);
    }
  };

  that.info = function() {
    if (that.verbosity >= INFO) {
      // Needed to work around the fact that printf prints an extra newline (at
      // least in v8)
      arguments[0] = that.spaces + arguments[0];
      printf.apply(null, arguments);
    }
  };

  // TODO: Perhaps go to stderr
  that.warning = function() {
    if (that.verbosity >= WARNING) {
      arguments[0] = that.spaces + arguments[0];
      printf.apply(null, arguments);
    }
  };

  that.error = function() {
    if (that.verbosity >= ERROR) {
      arguments[0] = that.spaces + arguments[0];
      printf.apply(null, arguments);
    }
  };

  that.fatal = function() {
    if (that.verbosity >= FATAL) {
      arguments[0] = that.spaces + arguments[0];
      printf.apply(null, arguments);
    }
  };

  that.push = function() {
    for (var i = 0; i < that.indentSize; i++) {
      that.spaces += ' ';
    }
  };
  
  that.pop = function() {
    that.spaces = that.spaces.slice(null, that.spaces.length-that.indentSize);
  };

  return that;
};


// Global logger.  If you don't call init(), this is what you get.
var glog = Logger();

// Static functions that operate on the global

// Initialize the global logger.
var init = exports.init = function (options) {
  glog = Logger(options);
}

var debug = exports.debug = function () {
  glog.debug.apply(glog, arguments)
}

var info = exports.info = function () {
  glog.info.apply(glog, arguments)
}

var warning = exports.warning = function () {
  glog.warning.apply(glog, arguments)
}

var error = exports.error = function () {
  glog.error.apply(glog, arguments)
}

var fatal = exports.fatal = function () {
  glog.fatal.apply(glog, arguments)
}

var push = exports.push = function () {
  glog.push();
}

var pop = exports.pop = function () {
  glog.pop();
}
