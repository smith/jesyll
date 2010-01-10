exports.testRecipe = require("./recipe-test");
exports.testUtil = require("./util-test");
exports.testLog = require("./log-test");
exports.testDoc = require("./doc-test");
exports.testPlugins = require("./plugins-test");

if (require.main === module.id)
    require("test/runner").run(exports);
