// Tests for plugins.js

var assert = require("test/assert");

var log = require("jesyll/log"),
    plugins = require("jesyll/plugins");

exports.testReadPlugins = function() {
  log.info('TODO');
}

if (require.main === module.id)
    require("test/runner").run(exports);
