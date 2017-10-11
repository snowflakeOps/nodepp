"use strict";
let nconf = require( 'nconf' );
let path = require( 'path' );
let fs = require( 'fs' );
let argv = require( 'yargs' )
    .option( 'app-config', {
        "alias": "a",
        "describe": "Configure EPP with JSON string",
        "string": true
    } ).coerce( 'app-config', JSON.parse )
    .option( "registries", {
        "alias": "r",
        "describe": "List of domain registries",
        "array": true
    } )
    .option( "listen", {
        "alias": "l",
        "describe": "listen",
        "default": 3000,
        "number": true
    } ).option( "json", {
        "alias": "j",
        "describe": "JSON formatted logs",
        "default": false
    } ).option( 'config-file', {
        "alias": "f",
        "describe": "Path to JSON config file"
    } ).option( 'loglevel', {
        "describe": "Log level",
        "default": "info"
    } ).option( 'rabbithost', {
        "describe": "RabbitMQ host"
    } ).option( 'rabbitport', {
        "describe": "RabbitMQ port",
        "number": true,
        "default": 5672
    } ).option( 'epp_login', {
        "describe": "EPP login"
    } ).option( 'epp_password', {
        "describe": "EPP password"
    } ).option( 'rabbitlogin', {
        "describe": "Login for rabbitmq"
    } ).option( 'rabbitpassword', {
        "describe": "Password for rabbitmq"
    } ).option( 'vhost', {
        "describe": "vhost for rabbit",
        "default": "/"
    } ).help( 'h' ).alias( 'h', 'help' )
    .argv;

module.exports.getConfig = function ( file ) {
    nconf.overrides( argv ).env();
    file = file ? file : "epp-config.json";
    file = nconf.get( 'config-file' ) || file;
    let filePath = path.resolve( file );
    nconf.file( filePath );
    // Read secret files mounted by docker secret.
    let eppLoginFile = nconf.get( 'EPP_LOGIN_FILE' );
    let eppPasswordFile = nconf.get( 'EPP_PASSWORD_FILE' );
    if ( eppLoginFile ) {
        nconf.set( 'epp_login', fs.readFileSync( eppLoginFile, 'utf8' ).trim() );
    }
    if ( eppPasswordFile ) {
        nconf.set( 'epp_password', fs.readFileSync( eppPasswordFile, 'utf8' ).trim() );
    }
    return nconf;
};

