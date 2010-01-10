// Tests for plugins.js

var assert = require("test/assert");

var log = require("oil/log"),
    plugins = require("recipe/plugins");


exports.testGlobal = function() {
  // This shouldn't happen, but it does
  print('injectedGlobal ' + injectedGlobal);
}

exports.testReadPlugins = function() {
  var fs = {
    contentsOf: function () {
      return "PLUGINS.onDocPush = function() { return {a: 3} };";
    }
  }
  var p = plugins.readPlugins(fs);
  var result = p.onDocPush();
  assert.eq(3, result.a);
}

exports.testPluginsDontLeakVars = function() {
  var fs = {
    contentsOf: function () {
      // myVar shouldn't be leaked anywhere
      return "var myVar = 3; " +
             "PLUGINS.onDocPush = function() { return {a: 3} };";
    }
  }
  var p = plugins.readPlugins(fs);
  var result = p.onDocPush();
  assert.eq(3, result.a);
  assert.eq("undefined", typeof myVar);
}

exports.testPluginsDontLeakGlobals = function() {
  // TODO: Detected leaks
  return;
  var fs = {
    contentsOf: function () {
      // This tries to introduce a new global, but the plugin system disallows
      // it with hermetic eval
      return "myGlobal = 3; " +
             "PLUGINS.onDocPush = function() { return {a: 3} };";
    }
  }
  var p = plugins.readPlugins(fs);
  var result = p.onDocPush();
  assert.eq(3, result.a);
}

if (require.main === module.id)
    require("test/runner").run(exports);
