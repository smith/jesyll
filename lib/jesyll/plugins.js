// Manages plugins written in JS

var log = require('jesyll/log');
    util = require('jesyll/util');

// Global variable that __plugins.js should augment.  We read it and clear it
// on every plugin file.
var PLUGINS = {};

// Returns an object of the plugins defined in __plugins.js, if any
// Args:
//   dir: Optional subdirectory in sourceTree
var readPlugins = exports.readPlugins = function(sourceTree, dir) {
  var path;
  if (dir) {
    path = filetree.join(dir, '__plugins.js');
  } else {
    path = '__plugins.js';
  }
  try {
    var contents = sourceTree.contentsOf(path);
  } catch (e) {
    log.info("Didn't find %s", path);
    return {};
  }
  log.info('LOADING %s', path);

  var code = '(function (PLUGINS) {' + contents + '/**/\n})';
  print('code ' + code);
  try {
    var pluginModule = eval(code);
  } catch (e) {
    log.error('Error executing plugin %s', path);
    throw e;
  }
  var PLUGINS = {};
  log.info('pluginModule: %s', pluginModule);
  //var module = pluginModule.apply(pluginModule, [PLUGINS]);
  pluginModule(PLUGINS);
  log.info('module: %s', module);
  return PLUGINS;
}

// Manages a stack of plugins
var PluginManager = exports.PluginManager = function(sourceTree) {
  var that = {},
      pluginStack = [];

  that.empty = function() {
    return pluginStack.length === 0;
  }

  // Mutates the docStack
  that.onDoc = function(docStack) {
    // Now push all __plugins.js functions
    var numPushed = 0;
    for (var i = 0; i < pluginStack.length; i++) {
      var entry = pluginStack[i];
      if (entry.onDocPush) {
        //log.info('Running onDocPush %s', i);
        try {
          var result = entry.onDocPush(docStack);
        } catch (e) {
          log.error('Caught exception executing onDocPush');
          throw e;
        }
        if (result) {
          var debugString = '';
          for (var name in result) {
            if (result.hasOwnProperty(name)) {
              debugString += name;
              debugString += ' ';
            }
          }
          //log.info('Pushing keys %s', debugString);
          docStack.push(result);
          numPushed++;
        }
      }
    }
    return numPushed;
  }

  that.enterDir = function(dirName) {
    pluginStack.push(readPlugins(sourceTree, dirName));
  }

  that.exitDir = function() {
    pluginStack.pop();
  }

  return that;
}
