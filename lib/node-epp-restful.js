"use strict";
let restify = require( "restify" );
let bodyParser = require( "body-parser" );
let moment = require( 'moment' );
let nconf = require( './utilities/config' ).getConfig();
let logger = require( './utilities/logging' ).getLogger( nconf );
let ProtocolState = require( './protocol-state' );

logger.debug( "Starting epp server.", process.argv );

let appConfig = nconf.get( 'app-config' );
logger.debug( "Application config: ", appConfig );
let registries = nconf.get( 'registries' ); // should only be 1.

class Dispatcher {
    constructor( registry ) {
        this.registry = registry;
        this.registryConfig = nconf.get( 'app-config' )[ registry ];
        logger.info( "Starting dispatcher for registry", { registry } );
        logger.info( "Using config to contact registrar", { "config": this.registryConfig } );
        this.state = new ProtocolState( registry, this.registryConfig );
    }

    startEpp() {
        let that = this;

        let registryConfig = this.registryConfig;
        //currentState = new ProtocolState(registry, registryConfig);
        let loginTransactionId = [ 'login', new Date().getTime(), require( 'crypto' ).randomBytes( 8 ).toString( 'hex' ) ].join( '-' ).toUpperCase();

        // Initialise the connection stream. Upon connection, attempt
        // to login.
        let eppCommand = () => {
            setTimeout( () => {
                this.state.login( {
                        "login": registryConfig.login,
                        "password": registryConfig.password
                    },
                    loginTransactionId ).then(
                    function ( data ) {
                        logger.log( "Got login data: ", data.toString() );
                        return;
                    },
                    function ( error ) {
                        logger.error( "Unable to login: ", error );
                        throw new Error( error );
                    }
                );
            }, 2000 );
        };
        return this.sendMessage( eppCommand )
    }

    sendMessage( eppCommand ) {
        try {
            logger.debug( "Calling epp command." );
            return this.state.connection.initStream().then( eppCommand );
        } catch (e) {
            logger.error( "Unable to processes EPP request" );
            logger.error( moment().utc().toString() + ": Dispatcher error: ", e );
            this.state = false;
        }
    }

    command( command, data ) {
        if ( !this.state.loggedIn ) {
            if ( command === 'logout' ) {
                logger.warn( "Killing child process." );
                process.exit( 0 );
            } else if ( command !== 'login' ) {
                logger.error( "Attempted " + command + " while not logged in." );
                //process.send({"error": "Not logged in."});
                return;
            }
        } else if ( command ) {
            logger.debug( "Sending a " + command );
            let that = this;
            let transactionId = data.transactionId;
            if ( !transactionId ) {
                transactionId = [ command, new Date().getTime(), require( 'crypto' ).randomBytes( 8 ).toString( 'hex' ) ].join( '-' ).toUpperCase();
            }
            let eppCommand = () => {
                return this.state.command( command, data, transactionId );
            };
            return this.sendMessage( eppCommand );
        }
    }
}


let dispatcher = new Dispatcher( registries[ 0 ] );
dispatcher.startEpp();

let app = restify.createServer();
app.use( bodyParser.json() );
let ips = nconf.get( 'whitelisted_ips' );

app.get( '/checkDomain/:domain', function ( req, res ) {
    let domain = req.params.domain;
    logger.debug( "Checking domain " + domain );
    let data = { "domain": domain };
    dispatcher.command( "checkDomain", data ).then( ( response ) => {
        res.send( response );
    }, ( error ) => {
        res.send( 500, error );
    } )
} );

app.get( '/infoDomain/:domain', function ( req, res ) {
    let domain = req.params.domain;
    logger.debug( "getting info for domain " + domain );
    let data = { "domain": domain };
    dispatcher.command( "infoDomain", data ).then( ( response ) => {
        res.send( response );
    }, ( error ) => {
        res.send( 500, error );
    } )
} );

app.get( '/infoContact/:contact', function ( req, res ) {
    let contact = req.params.contact;
    logger.debug( "Checking contact " + contact );
    let data = { "contact": contact };
    dispatcher.command( "infoContact", data ).then( ( response ) => {
        res.send( response );
    }, ( error ) => {
        res.send( 500, error );
    } )
} );

app.post( '/:command', function ( req, res ) {
    let queryData = req.body;
    let command = req.params.command;

    let a = moment();
    dispatcher.command( command, queryData ).then( ( response ) => {
        let b = moment();
        let diff = b.diff( a, 'milliseconds' );
        logger.info( 'Request elapsed time: ' + diff.toString() + ' ms' );
        res.send( response );
    }, ( error ) => {
        res.send( 500, error );
    } );
} );
app.listen( nconf.get( 'listen' ) );