"use strict";
let winston = require( 'winston' );
let moment = require( 'moment' );
let fs = require( 'fs' );

function getLogger( nconf ) {
    let log_level = nconf.get( 'loglevel' );
    let logger = new (winston.Logger)( {
        transports: [
            new (winston.transports.Console)( {
                "level": log_level,
                "json": nconf.get( 'json' ),
                "timestamp": function () {
                    return moment();
                }
            } )
        ]
    } );
    let logzioTokenFile = nconf.get( "LOGZIO_TOKEN_FILE" );
    if ( logzioTokenFile ) {
        let logzioToken = fs.readFileSync( logzioTokenFile, 'utf8' ).trim();
        let logzioWinstonTransport = require( 'winston-logzio' );
        let loggerOptions = {
            token: logzioToken,
            host: 'listener.logz.io',
        };
        logger.add( logzioWinstonTransport, loggerOptions );
    }
    return logger;
}

module.exports.getLogger = getLogger;
