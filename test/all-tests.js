exports.testJesyll = require("./jesyll-tests");
exports.testUtil = require("./util-test");

if (require.main === module.id)
    require("test/runner").run(exports);
