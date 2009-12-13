// Tests for plugins.js

var assert = require("test/assert");

var log = require("jesyll/log"),
    plugins = require("jesyll/plugins");

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

exports.testPluginsDontLeakGlobals = function() {
  return;  // TODO: Fix
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
