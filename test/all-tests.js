exports.testJesyll = require("./jesyll-tests");
exports.testUtil = require("./util-test");
exports.testLog = require("./log-test");
exports.testFileTree = require("./filetree-test");

if (require.main === module.id)
    require("test/runner").run(exports);
