"use strict";
let tls = require( 'tls' );
let net = require( 'net' );
let fs = require( 'fs' );
let moment = require( 'moment' );

let nconf = require( './utilities/config' ).getConfig();
let logger = require( './utilities/logging' ).getLogger( nconf );

class ProtocolConnection {
    constructor( config ) {
        logger.debug( "Initialising a ProtocolConnection." );
        this.config = config;
        this.setStream( false );
        this.clientResponse = function ( xml ) {
            logger.debug( "Received: " + xml.toString( 'utf8' ) )
        };
    }

    setStream( newStream ) {
        this.stream = newStream;
    }

    getStream() {
        return this.stream;
    }

    initStream() {
        return new Promise( ( resolve, reject ) => {
            let config = this.config;

            if ( !this.getStream() ) {
                try {
                    let newStream;
                    let options = {
                        "host": config.host,
                        "port": config.port,
                        "rejectUnauthorized": false,
                        "secureProtocol": "TLSv1_2_method"
                    };
                    if ( config.key ) {
                        options.key = fs.readFileSync( config.key );
                    }
                    if ( config.cert ) {
                        options.cert = fs.readFileSync( config.cert );
                    }

                    logger.debug( "Establishing connection.." );
                    newStream = tls.connect( options, () => {
                        let message = "Established a secure connection: " + config.host + ":" + config.port;
                        logger.info( message, { "host": config.host, "port": config.port } );
                        resolve( message )
                    } );
                    newStream.on( 'readable', () => {
                        logger.debug( "Read event" );
                        this.readStream();
                    } );
                    newStream.on( 'clientError', ( exception, securePair ) => {
                        logger.error( "client error", exception );
                        reject( exception );
                    } );
                    newStream.on( 'end', () => {
                        logger.error( "Got an end event" );
                        process.exit( 1 );
                    } );
                    this.setStream( newStream );
                } catch (e) {
                    logger.error( "Error in initStream" );
                    reject( e )
                }
            } else {
                resolve( "Have stream already" );
            }
        } );
    }

    readStream() {
        try {
            let stream = this.stream;
            let streamBuffer = stream.read();
            if ( streamBuffer !== null ) {
                if ( this.buffer === undefined ) {
                    this.buffer = streamBuffer;
                } else {
                    this.buffer = Buffer.concat( [ this.buffer, streamBuffer ] );
                }
                let bigEndian = this.buffer.slice( 0, 4 );
                let totalLength = new Buffer( bigEndian ).readUIntBE( 0, 4 );
                let eppResponseBody = this.buffer.slice( 4 );
                let currentLength = this.buffer.length;
                logger.debug( "endian length: ", totalLength );
                logger.debug( "current buffer length", currentLength );
                if ( this.buffer.length === totalLength || eppResponseBody.length === totalLength ) {
                    this.clientResponse( eppResponseBody );
                    this.buffer = undefined;
                }
            }
        } catch (e) {
            logger.error( e );
        }
    }

    processBigEndian( xml ) {
        let xmlBuffer = new Buffer( xml );

        let xmlLength = xmlBuffer.length;
        let endianLength = xmlLength + 4;
        let b = new Buffer( 4 );
        b.writeUInt32BE( endianLength, 0 );
        let preppedXML = Buffer.concat( [ b, xmlBuffer ] );
        return preppedXML;
    }

    send( xml ) {
        return new Promise( ( resolve, reject ) => {
            // Called in "readStream()" when the stream gets input from EPP server.
            this.clientResponse = function ( buffer ) {
                logger.debug( "Client responded" );
                resolve( buffer );
            };
            try {
                let preparedXML = this.processBigEndian( xml );
                logger.debug( xml );
                this.stream.write( preparedXML, "utf8", function () {
                    logger.debug( "Finished writing to server." );
                } );
            } catch (e) {
                logger.error( "Unable to write to stream." );
                reject( e );
            }
        } );
    }

}

module.exports = ProtocolConnection;

