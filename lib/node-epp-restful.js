"use strict";
var restify = require("restify");
var bodyParser = require("body-parser");
var moment = require('moment');
var nconf = require('./utilities/config.js').getConfig();
var logger = require('./utilities/logging.js').getLogger(nconf);
var ProtocolState = require('./protocol-state');

logger.debug("Starting epp server.", process.argv);

var appConfig = nconf.get('app-config');
logger.debug("Application config: ", appConfig);
var registries = nconf.get('registries'); // should only be 1.
var eppCommand;

class Dispatcher {
  constructor(registry) {
    this.registry = registry;
    this.registryConfig = nconf.get('app-config')[registry];
    logger.info("Starting for registry: ", registry);
    logger.info("Using config to contact registrar", this.registryConfig);
    this.state = new ProtocolState(registry, this.registryConfig);
  }

  startEpp() {
    var registryConfig = this.registryConfig;
    var loginTransactionId = ['login', new Date().getTime(), require('crypto').randomBytes(8).toString('hex')].join('-').toUpperCase();

    // Initialise the connection stream. Upon connection, attempt to login.
    eppCommand = () => {
      setTimeout(() => {
        this.state.login({
          "login": registryConfig.login,
          "password": registryConfig.password,
        },
        loginTransactionId).then(
        function(data) {
          logger.log("Got login data: ", data.toString());
          return;
        },
        function(error) {
          logger.error("Unable to login: ", error);
          throw new Error(error);
        }
        );
      }, 2000);
    };
    return this.sendMessage(eppCommand)
  }

  sendMessage(eppCommand) {
    try {
      return this.state.connection.initStream().then(eppCommand);
    } catch (e) {
      logger.error("Unable to processes EPP request");
      logger.error(moment().utc().toString() + ": Dispatcher error: ", e);
      this.state = false;
    }
  }

  command(command, data) {
    if (!this.state.loggedIn) {
      if (command === 'logout') {
        logger.warn("Killing child process.");
        process.exit(0);
      } else if (command !== 'login') {
        logger.error("Attempted " + command + " while not logged in.");
      }
    } else if (command) {
      logger.debug("Sending a " + command);
      var transactionId = data.transactionId;
      if (!transactionId) {
        transactionId = [command, new Date().getTime(), require('crypto').randomBytes(8).toString('hex')].join('-').toUpperCase();
      }
      var eppCommand = () => {
        return this.state.command(command, data, transactionId);
      };
      return this.sendMessage(eppCommand);
    }
  }
}


let dispatcher = new Dispatcher(registries[0]);
dispatcher.startEpp();

var app = restify.createServer();
app.use(bodyParser.json());

app.get('/checkDomain/:domain', function(req, res) {
  var domain = req.params.domain;
  logger.debug("Checking domain " + domain);
  var data = {"domain": domain};
  dispatcher.command("checkDomain", data).then((response) => {
    res.send(response);
  }, (error) => {
    res.send(500, error);
  })
});

app.get('/infoDomain/:domain', function(req, res) {
  var domain = req.params.domain
  logger.debug("getting info for domain " + domain);
  var data = {"domain": domain};
  dispatcher.command("infoDomain", data).then((response) => {
    res.send(response);
  }, (error) => {
    res.send(500, error);
  })
});

app.get('/infoContact/:contact', function(req, res) {
  var contact = req.params.contact;
  logger.debug("Checking contact " + contact);
  var data = {"contact": contact};
  dispatcher.command("infoContact", data).then((response) => {
    res.send(response);
  }, (error) => {
    res.send(500, error);
  })
});

app.post('/:command', function(req, res) {
  var queryData = req.body;
  var command = req.params.command;

  var a = moment();
  dispatcher.command(command, queryData).then((response) => {
    var b = moment();
    var diff = b.diff(a, 'milliseconds');
    logger.info('Request elapsed time: ' + diff.toString() + ' ms');
    res.send(response);
  }, (error) => {
    res.send(500, error);
  });
});
app.listen(nconf.get('listen'));

