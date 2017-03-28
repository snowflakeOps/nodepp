var tls = require('tls');
var net = require('net');
var fs = require('fs');
var Q = require('q');
var moment = require('moment');

var nconf = require('./utilities/config.js').getConfig();
var logger = require('./utilities/logging.js').getLogger(nconf);
function ProtocolConnection(config) {
  this.config = config;
  this.setStream(false);
}

ProtocolConnection.prototype.clientResponse = function (xml) {
  logger.debug("Received: " + xml.toString('utf8'))
};
ProtocolConnection.prototype.setStream = function (newStream) {
  this.stream = newStream;
};
ProtocolConnection.prototype.getStream = function () {
  return this.stream;
};
ProtocolConnection.prototype.initStream = function () {
  var self = this;
  var deferred = Q.defer();
  var config = this.config;

  if (!self.getStream()) {
    try {
      var newStream;
      var options = {
        "host": config.host,
        "port": config.port,
        "rejectUnauthorized": false,
        "secureProtocol": "TLSv1_method"
      };
      if (config.key) {
        options.key = fs.readFileSync(config.key);
      }
      if (config.cert) {
        options.cert = fs.readFileSync(config.cert);
      }

      newStream = tls.connect(options, function () {
        logger.info("Established a secure connection.");
        deferred.resolve();
      });
      newStream.on('data', function (data) {
        self.readStream(data);
      });
      newStream.on('clientError', function (exception, securePair) {
        logger.warn(exception);
        deferred.reject(exception);
      });
      newStream.on("uncaughtException", function (err) {
        logger.error('err uncaught Exception  : ', err);
      });
      newStream.on('end', function () {
        logger.warn("Got an end event");
        process.exit(0);
      });
      self.setStream(newStream);
    } catch (e) {
      deferred.reject(e);
    }
  } else {
    deferred.resolve();
  }
  return deferred.promise;
};

ProtocolConnection.prototype.readStream = function (data) {
  if (data !== null && data.length > 3) {
    if (this.buffer === undefined) {
      this.buffer = data;
    } else {
      this.buffer = Buffer.concat([this.buffer, data]);
    }
    var bigEndian = this.buffer.slice(0, 3);
    var totalLength = new Buffer(bigEndian).readUIntBE(0, 3);
    var eppResponseBody = this.buffer.slice(3);
    var currentLength = this.buffer.length;
    this.clientResponse(eppResponseBody);
    this.buffer = undefined;
  }
};

ProtocolConnection.prototype.processBigEndian = function (xml) {
  logger.debug(xml);
  var xmlBuffer = new Buffer(xml);

  var xmlLength = xmlBuffer.length;
  var endianLength = xmlLength + 4;
  var b = new Buffer(4);
  b.writeUInt32BE(endianLength, 0);
  var preppedXML = Buffer.concat([b, xmlBuffer]);
  return preppedXML;
};
ProtocolConnection.prototype.send = function (xml) {
  var deferred = Q.defer();

  // Called in "readStream()" when the stream gets input from EPP server.
  this.clientResponse = function (buffer) {
    deferred.resolve(buffer);
  };
  try {
    var preparedXML = this.processBigEndian(xml);
    this.stream.write(preparedXML, "utf8");
  } catch (e) {
    logger.error("Unable to write to stream.");
    deferred.reject(e);
  }
  return deferred.promise;
};
module.exports = ProtocolConnection;

