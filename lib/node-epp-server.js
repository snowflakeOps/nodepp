"use strict";
let express = require( "express" );
let bodyParser = require( "body-parser" );
let cp = require( 'child_process' );
let ipfilter = require( 'ipfilter' );
let moment = require( 'moment' );
let Listener = require( './listener' );
let EventDispatcher = require( './event-dispatcher' );
let nconf = require( './utilities/config' ).getConfig();
let logger = require( './utilities/logging' ).getLogger( nconf );

logger.debug( "Starting epp server.", process.argv );

let availableProcesses = {};
let appConfig = nconf.get( 'app-config' );
let registries = nconf.get( 'registries' );
logger.debug( "Registries: ", registries );
for ( let accred in registries ) {
    let registry = registries[ accred ];
    logger.info( "Starting worker", { registry } );
    let eppProcess = cp.fork( __dirname + '/worker.js', process.argv.slice( 2 ) );
    eppProcess.send( {
        "registry": registry
    } );
    availableProcesses[ registry ] = eppProcess;
}
process.on( 'SIGINT', function () {
    let logoutResponse = function ( data ) {
        logger.info( "Exit reply", { data } );
    };
    for ( let registry in availableProcesses ) {
        let childProc = availableProcesses[ registry ];
        childProc.send( {
            "command": "logout",
            "data": {
                "kill": true
            }
        } );
        childProc.once( 'message', logoutResponse );
    }
    process.exit( 0 );
} );


// Wire up event/listener to keep track of available worker process. This is
// to avoid individual connection workers from getting swamped.
let eventDispatch = new EventDispatcher();
let listener = new Listener( eventDispatch, availableProcesses );
eventDispatch.on( 'queueChild', listener.queueChild );
eventDispatch.on( 'childFree', listener.childFree );


let app = express();
app.use( bodyParser.json() );
let ips = nconf.get( 'whitelisted_ips' );
app.use( ipfilter( ips, {
    "mode": "allow"
} ) );

app.post( '/command/:registry/:command', function ( req, res ) {
    let registry = req.params.registry;
    if ( !(registry in availableProcesses) ) {
        res.send( 400, {
            "error": "Unknown registry"
        } );
        return;
    }
    let queryData = req.body;

    let a = moment();
    let processChild = function ( childProcess ) {
        childProcess.once( 'message', function ( m ) {
            let b = moment();
            let diff = b.diff( a, 'milliseconds' );
            let command = req.params.command;
            let elapsed = diff.toString();
            logger.info( "Processed EPP request", {
                    "data": queryData,
                    elapsed,
                    command
                }
            );
            res.send( m );
            eventDispatch.childFree( registry );
        } );
        childProcess.send( {
            "command": req.params.command,
            "data": queryData
        } );
    };
    listener.pushChildQueue( processChild );
    eventDispatch.queueChild( registry );
} );
app.listen( nconf.get( 'listen' ) );

