// Tests for log.js

var assert = require("test/assert"),
    log = require("jesyll/log");

exports.testLogger = function() {
    var logger = log.Logger(),
        name = "world";
    logger.info('hello %s', name);
    logger.warning('warning %s', name);
    logger.error('error %s', name);
}

exports.testStatics = function() {
    var name = "world";
    log.info('hello %s', name);
    log.warning('warning %s', name);
    log.error('error %s', name);
}

if (require.main === module.id)
    require("test/runner").run(exports);
