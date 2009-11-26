// Simple logging module.
//
// TODO: Would be nice to have JSON Template style logs:
//
// var obj = {name: 'world'};
// log.info('Hello {name}', obj);

var printf = require("printf");

var Logger = exports.Logger = function (verbosity) {

  var that = {};

  that.verbosity = verbosity || 10;  // TODO: Implement

  that.info = function() {
    printf.printf.apply(null, arguments);
  }

  // TODO: Perhaps go to stderr
  that.warning = function() {
    printf.printf.apply(null, arguments);
  }

  that.error = function() {
    printf.printf.apply(null, arguments);
  }

  return that;
}

// Global logger
var glog = Logger();

// Static functions that operate on the global
var info = exports.info = function () {
  glog.info.apply(glog, arguments)
}

var warning = exports.warning = function () {
  glog.warning.apply(glog, arguments)
}

var error = exports.error = function () {
  glog.error.apply(glog, arguments)
}
