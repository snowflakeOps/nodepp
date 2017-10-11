"use strict";
let forever = require( 'forever-monitor' );

let nconf = require( './utilities/config' ).getConfig();
let logger = require( './utilities/logging' ).getLogger( nconf );
logger.debug( "Got environment: ", nconf.get( 'EPP_REGISTRIES' ) );

let child = new (forever.Monitor)( './lib/server.js', {
    max: 1,
    silent: true,
    pidFile: "nodepp.pid",
    logFile: "nodepp.log",
    outFile: "node-stout.log",
    errFile: "nodepp-sterr.log",
    options: [ '--registries', 'registry-test3', '--registries', 'registry-test1', '--registries', 'registry-test2' ]

} );
child.on( 'exit', function () {
    logger.debug( "the program has exited." );
} );

child.start();
