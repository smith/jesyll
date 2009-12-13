exports.testJesyll = require("./jesyll-test");
exports.testUtil = require("./util-test");
exports.testLog = require("./log-test");
exports.testFileTree = require("./filetree-test");
exports.testDoc= require("./doc-test");

if (require.main === module.id)
    require("test/runner").run(exports);
