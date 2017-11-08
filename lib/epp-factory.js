"use strict";
let winston = require( 'winston' );
let EPP = require( '../lib/epp' );
let EPPExtension = require( '../lib/epp-extension' );
let SecDnsExtension = require( '../lib/secdns-extension' );
let HexonetExtension = require( '../lib/hexonet-extension' );
let MetaregistrarExtension = require( '../lib/metaregistrar-extension' );
let AfiliasExtension = require( '../lib/afilias-extension' );

let nconf = require( './utilities/config' ).getConfig();
let logger = require( './utilities/logging' ).getLogger( nconf );

/*
 *  Compose extension classes into the main EPP library as needed. As
 *  different registries have different extensions, and some, but not all may
 *  use DNSSEC, use the registry config to determine which ones need to go in.
 **/

class EppFactory {
    constructor() {
    }

    static pushExtensionCommandMap( epp, command, extension, extensionFunction ) {
        logger.debug( "Adding " + command + ":" + extension + ":" + extensionFunction + " to epp object " );
        if ( !epp.extensionCommandMap[ command ] ) {
            epp.extensionCommandMap[ command ] = {};
        }
        epp.extensionCommandMap[ command ][ extension ] = extensionFunction;
    }

    static generate( registry, config ) {
        let epp = new EPP( registry, config );
        config.extensionClasses && config.extensionClasses.forEach( ( extensionClass ) => {
            let extension = extensionClass.extension;
            let className = extensionClass.className;
            let mixer,
                mapper;
            switch (className) {
                case 'SecDnsExtension':
                    logger.debug( "Applying secDNS mixin" );
                    mixer = SecDnsExtension;
                    mapper = SecDnsExtension.mixinMapper();
                    break;
                case 'HexonetExtension':
                    mixer = HexonetExtension;
                    logger.debug( "Applying hexonet mixin" );
                    mapper = HexonetExtension.mixinMapper();
                    break;
                case 'AfiliasExtension':
                    mixer = AfiliasExtension;
                    logger.debug( "Applying afilias mixin" );
                    mapper = AfiliasExtension.mixinMapper();
                    break;
                case 'MetaregistrarExtension':
                    mixer = MetaregistrarExtension;
                    logger.debug( "Applying metaregistrar extension" );
                    mapper = MetaregistrarExtension.mixinMapper();
                    break;
                default:
            }
            // Complicated kludge to map the epp command to the extension command that
            // should be executed. See mapping in respective mixin class.
            mapper.forEach( ( mapping ) => {
                for ( let eppCommand in mapping ) {
                    let fn = mapping[ eppCommand ];
                    epp[ fn ] = mixer.prototype[ fn ];
                    EppFactory.pushExtensionCommandMap( epp, eppCommand, extension, fn );
                }
            } );
        } );

        return epp;
    }


}

module.exports = EppFactory;

