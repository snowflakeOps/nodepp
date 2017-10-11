"use strict";
let ProtocolState = require( './protocol-state' );

let nconf = require( './utilities/config' ).getConfig();
let logger = require( './utilities/logging' ).getLogger( nconf );

class Dispatcher {
    constructor( registry ) {
        this.registry = registry;
        this.registryConfig = nconf.get( 'app-config' )[ registry ];
        logger.info( "Starting dispatcher", { registry, "config": this.registryConfig } );
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
                        "login": nconf.get( 'epp_login' ),
                        "password": nconf.get( 'epp_password' )
                    },
                    loginTransactionId ).then(
                    function ( data ) {
                        logger.info( "login data", { data } );
                        return;
                    },
                    function ( error ) {
                        logger.error( "Unable to log in", { error } );
                        throw new Error( error );
                    }
                ).catch( ( error ) => {
                    logger.error( "Promise rejected with", error )
                } );
            }, 2000 );
        };
        return this.sendMessage( eppCommand )
    }

    sendMessage( eppCommand ) {
        try {
            logger.debug( "Calling epp command." );
            return this.state.connection.initStream().then( eppCommand ).catch( ( error ) => {
                logger.error( "Promise rejected with", error )
            } );
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

module.exports = Dispatcher;
