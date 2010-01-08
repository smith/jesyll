// Tests for log.js

var assert = require("test/assert"),
    log = require("recipe/log");

exports.testLogger = function() {
    var logger = log.Logger(),
        name = "world";
    logger.debug('debug %s', name);
    logger.info('hello %s', name);
    logger.warning('warning %s', name);
    logger.error('error %s', name);
    logger.fatal('fatal %s', name);

    logger.push();
    logger.info('indented %s', name);
    logger.pop();
    logger.info('unindented %s', name);
}

exports.testStatics = function() {
    var name = "world";
    log.debug('debug %s', name);
    log.info('hello %s', name);
    log.warning('warning %s', name);
    log.error('error %s', name);
    log.fatal('fatal %s', name);

    log.push();
    log.info('indented %s', name);
    log.pop();
    log.info('unindented %s', name);
}

if (require.main === module.id)
    require("test/runner").run(exports);
