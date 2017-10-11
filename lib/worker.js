"use strict";
let Dispatcher = require( './dispatcher.js' );
let dispatch = new Dispatcher();

process.on( 'message', dispatch.processMessage );
