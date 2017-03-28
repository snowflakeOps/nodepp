var moment = require('moment');
var Dispatcher = require('./dispatcher-es6');
var nconf = require('./utilities/config.js').getConfig();
var logger = require('./utilities/logging.js').getLogger(nconf);
// Used for error reporting.
var processId = process.pid;

var registry = nconf.get('registries')[0];
var sentry_dsn_file = nconf.get("SENTRY_DSN_FILE");
if (sentry_dsn_file) {
  logger.debug("Parsing sentry dsn file: ", sentry_dsn_file);
  let environment = nconf.get("SENTRY_ENVIRONMENT");
  logger.debug("environment: ", environment);
  try {
    const loginReader = require('readline').createInterface({
      input: require('fs').createReadStream(sentry_dsn_file)
    });
    loginReader.on('line', (line) => {
      var Raven = require('raven');
      Raven.config(line.trim(), {
        environment: environment,
        registry: registry
      }).install();
    });
  } catch (e) {
    logger.error(e);
  }
} else {
  logger.warn("Raven not configured.");
}
logger.debug("Environment: ", process.env);
let host = nconf.get("rabbithost") || nconf.get("RABBITMQ_HOST");
let port = nconf.get("rabbitport") || nconf.get("RABBIT_PORT");
let login = nconf.get("rabbitlogin") || nconf.get("RABBITMQ_DEFAULT_USER");
let password = nconf.get("rabbitpassword") || nconf.get("RABBITMQ_DEFAULT_PASS");
let vhost = nconf.get("vhost") || nconf.get("RABBITMQ_DEFAULT_VHOST");

let rabbitConfig = {

  connection: {
    host: host,
    port: port,
    login: login,
    password: password,
    vhost: vhost,
  },
  logLevel: nconf.get('loglevel'),
  waitForConnection: true,
  rpc: {
    timeout: 2000
  }
};


logger.debug("Initialised with registry ", registry);

let dispatcher = new Dispatcher(registry);
dispatcher.startEpp();

var availableProcesses = {};
logger.debug("Connecting to AMQP server", rabbitConfig);
var amqpConnection = require('amqp-as-promised')(rabbitConfig);
amqpConnection.errorHandler = (error) => {
  logger.error("In errorHandler", error);
  process.exit(0);
};
amqpConnection.serve('epp', registry, (incoming, headers, del) => {
  var msg = JSON.parse(String.fromCharCode.apply(String, incoming.data))
  let {command, data} = msg;
  var a = moment();
  try {
    return dispatcher.command(command, data).then((response) => {
      var b = moment();
      var diff = b.diff(a, 'milliseconds');
      logger.info(command + ' request elapsed time: ' + diff.toString() + ' ms');
      return response;
    }, (error) => {
      logger.error("In error callback of promise", error);
      return error;
    });
  } catch (e) {
    logger.error(e);
    process.exit(1)
  }
});
process.on('SIGINT', () => {
  var logoutResponse = (data) => {
    logger.debug("Got reply from logout ", data);
  };
  var data = {
    kill: true
  };

  dispatcher.command('logout', data).then((response) => {
    logger.info('Logged out.');
    return response;
  }, (error) => {
    logger.error(error);
    return error;
  });
  amqpConnection.shutdown();
  process.exit(0);
});

