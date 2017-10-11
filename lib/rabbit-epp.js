"use strict";
let moment = require( 'moment' );
let Dispatcher = require( './dispatcher' );
let nconf = require( './utilities/config' ).getConfig();
let logger = require( './utilities/logging' ).getLogger( nconf );
let fs = require( 'fs' );
// Used for error reporting. 
let processId = process.pid;

let registry = nconf.get( 'registries' )[ 0 ];
let sentry_dsn_file = nconf.get( "SENTRY_DSN_FILE" );
if ( sentry_dsn_file ) {
    let release = nconf.get( "RELEASE_VERSION" );
    let environment = nconf.get( "SENTRY_ENVIRONMENT" );
    logger.debug( "Parsing sentry dsn file: ", sentry_dsn_file );
    let sentryDsn = fs.readFileSync( sentry_dsn_file, 'utf8' );
    let Raven = require( 'raven' );
    Raven.config( sentryDsn.trim(), {
        release,
        environment,
        extra: {
            registry: registry
        }
    } ).install();
    logger.info( "Initialising nodepp", { registry, environment, release } );
    logger.debug( "environment: ", environment );
} else {
    logger.warn( "Raven not configured." );
}
logger.debug( "Environment: ", process.env );
let rabbitmqUser = nconf.get( 'RABBITMQ_DEFAULT_USER_FILE' );
let rabbitmqPass = nconf.get( 'RABBITMQ_DEFAULT_PASS_FILE' );
let login = fs.readFileSync( rabbitmqUser, 'utf8' ).trim();
let password = fs.readFileSync( rabbitmqPass, 'utf8' ).trim();
let host = nconf.get( "rabbithost" ) || nconf.get( "RABBITMQ_HOST" );
let port = nconf.get( "rabbitport" ) || nconf.get( "RABBIT_PORT" );
let vhost = nconf.get( "vhost" ) || nconf.get( "RABBITMQ_DEFAULT_VHOST" );
let rabbitConfig = {
    connection: { host, port, vhost, login, password },
    logLevel: nconf.get( 'loglevel' ),
    waitForConnection: true,
    rpc: {
        timeout: 2000
    }
};
let dispatcher = new Dispatcher( registry );
dispatcher.startEpp();

logger.debug( "Connecting to AMQP server", rabbitConfig );
let amqpConnection = require( 'amqp-as-promised' )( rabbitConfig );
amqpConnection.errorHandler = ( error ) => {
    logger.error( "In errorHandler", error );
    process.exit( 0 );
};
amqpConnection.serve( 'epp', registry, ( incoming, headers, del ) => {
    let msg = JSON.parse( String.fromCharCode.apply( String, incoming.data ) );
    let a = moment();
    try {
        return dispatcher.command( msg.command, msg.data ).then( ( response ) => {
            let b = moment();
            let diff = b.diff( a, 'milliseconds' );
            let elapsed = diff.toString();
            if ( msg.command !== 'hello' ) {
                logger.info( msg.command + " completed", {
                    "command": msg.command, "elapsed": elapsed
                } );
            }
            return response;
        }, ( error ) => {
            logger.error( "In error callback of promise", error );
            return error;
        } );
    } catch (e) {
        logger.error( e );
        process.exit( 1 )
    }
} );
process.on( 'SIGINT', () => {
    let logoutResponse = ( data ) => {
        logger.debug( "Got reply from logout ", data );
    };
    let data = {
        kill: true
    };

    dispatcher.command( 'logout', data ).then( ( response ) => {
        logger.debug( "Logged out" );
        return response;
    }, ( error ) => {
        logger.error( error );
        return error;
    } );
    amqpConnection.shutdown();
    process.exit( 0 );
} );

