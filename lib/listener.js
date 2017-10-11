"use strict";
let nconf = require( './utilities/config.js' ).getConfig();
let logger = require( './utilities/logging.js' ).getLogger( nconf );
let available;
let busy;
let childQueue = [];
let eventer;

function Listener( eventDispatcher, availableProcesses ) {
    eventer = eventDispatcher;
    available = availableProcesses;
    busy = {};
}

Listener.prototype.pushChildQueue = function ( child ) {
    childQueue.push( child );
    logger.info( "listener queue", { "length": childQueue.length } );
};
Listener.prototype.childFree = function ( registry ) {
    logger.info( registry + " free " );
    let childProc = busy[ registry ];
    delete busy[ registry ];
    available[ registry ] = childProc;
    eventer.queueChild( registry );
};

Listener.prototype.queueChild = function ( registry ) {
    let childProc = available[ registry ];
    if ( childProc && childQueue.length > 0 ) {
        delete available[ registry ];
        busy[ registry ] = childProc;
        let callToChild = childQueue.shift();
        callToChild( childProc );
    }
};

module.exports = Listener;
