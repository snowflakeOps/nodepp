"use strict";
let EppFactory = require( '../lib/epp-factory.js' );
let ProtocolConnection = require( './connection.js' );
let parser = require( 'xml2json' );
let moment = require( 'moment' );

let nconf = require( './utilities/config.js' ).getConfig();
let logger = require( './utilities/logging.js' ).getLogger( nconf );

let currRegistry;

class ProtocolState {
    constructor( registry, config ) {
        currRegistry = registry;
        this.epp = EppFactory.generate( registry, config );
        this.connection = new ProtocolConnection( config );
        this.state = "offline";
        this.loggedIn = false;
    }

    idle() {
        this.state = 'idle';
        this.interval = setInterval( () => {
                let now = moment();
                if ( !this.last || now.diff( this.last, 'seconds' ) > 60 ) {
                    logger.debug( "It's been 60 seconds, calling hello for " + currRegistry );
                    if ( this.loggedIn ) {
                        this.command( 'hello', null, 'fake' ).then( ( helloResponse ) => {
                                logger.debug( "Hello got response: ", helloResponse.toString() );
                            },
                            ( error ) => {
                                logger.error( "Hello got error: ", error );
                            } ).catch( ( error ) => {
                            logger.error( "Promise failed with ", error );
                            process.exit( 0 );
                        } );
                    } else {
                        logger.warn( "Logged out. Can't send <hello/>" );
                    }
                }
            },
            5000 );
    }

    resultOk( result ) {
        if ( result.status === 'OK' ) {
            return true;
        }
        return false;
    }

    processResponse( eppJson ) {
        let eppData = eppJson.epp;
        if ( eppData ) {
            if ( eppData.response ) {
                let eppResponse = eppData.response;
                let returnData = {
                    "result": eppResponse.result,
                    "data": eppResponse.resData,
                    "transactionId": eppResponse.trID
                };
                if ( eppResponse.hasOwnProperty( 'msgQ' ) ) {
                    returnData.msgQ = eppResponse.msgQ;
                }

                return returnData;
            }
            return eppData;
        }
        return eppJson;
    }

    processReturnedXML( returnedXML ) {
        let response = parser.toJson( returnedXML, {
            "object": true
        } );
        logger.debug( "XML response", {
            "response": returnedXML.toString()
        } );
        let processedResponse = this.processResponse( response );
        logger.debug( "Processed response", processedResponse );
        return processedResponse
    }

    login( data, transactionId ) {

        return this.command( 'login', data, transactionId ).then( ( data ) => {
                let result = data.result;

                if ( result.hasOwnProperty( 'code' ) && result.code < 2000 ) {
                    logger.debug( "Logged in successfully." );
                    this.loggedIn = true;
                }
                return data;
            },
            ( error ) => {
                throw new Error( error );
            } ).catch( ( error ) => {
            logger.error( "Promise failed", error )
        } );
    }

    command( command, data, transactionId ) {
        if ( this.interval ) {
            clearInterval( this.interval );
        }

        this.state = 'command';
        logger.debug( "Executing " + command );
        let eppCommand = this.epp[ command ];
        let xml;
        try {
            if ( !eppCommand ) {
                throw new Error( "Unknown EPP command" );
            }
            xml = this.epp[ command ]( data, transactionId );
            logger.debug( "Sending", xml );
        } catch (e) {
            if ( this.state !== 'idle' ) {
                this.idle();
            }
            throw e;
        }
        // This is a promise
        return this.connection.send( xml ).then( ( buffer ) => {

            return new Promise( ( resolve, reject ) => {

                logger.debug( "Received response from registry." );
                this.last = moment();
                if ( command !== 'logout' ) {
                    this.idle();
                    if ( command === 'login' ) {
                        this.loggedIn = true;
                    }
                } else {
                    this.loggedIn = false;
                    logger.debug( "Logged out" );
                    if ( data.kill ) {
                        logger.warn( "Logged out and killing child process." );
                        reject( "Logged out" )
                    }
                }
                let processedXml = this.processReturnedXML( buffer );
                logger.debug( "Processed XML", processedXml );
                resolve( processedXml )
            } );
        } );
    }
}

module.exports = ProtocolState;

