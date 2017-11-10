"use strict";
let commandMapping = [ {
    "transferDomain": "transferDomainExtension"
} ];

class MetaregistrarExtension {
    constructor() {
    }

    transferDomainExtension( data ) {
        let config = this.config;
        let namespace = config.namespaces.commandExt.xmlns;
        let domainExtensionData = {};
        let nameServers = [];
        if ( data.ns ) {
            for ( let index in data.ns ) {
                let nameServer = data.ns[ index ];
                nameServers.push( {
                    "_value": nameServer
                } );
            }
        }
        domainExtensionData[ "command-ext-domain:ns" ] = { "command-ext-domain:hostObj": nameServers };
        domainExtensionData[ "command-ext-domain:registrant" ] = data.registrant;
        domainExtensionData[ "command-ext-domain:contact" ] = [ {
            "_attr": {
                "type": "admin"
            },
            "_value": data.contact.admin
        }, {
            "_attr": {
                "type": "tech"
            },
            "_value": data.contact.tech
        }, {
            "_attr": {
                "type": "billing"
            },
            "_value": data.contact.billing
        }
        ];
        if ( domainExtensionData[ "command-ext-domain:ns" ].length < 1 ) return undefined;
        let processedKeyValues = {
            "_attr": {
                "xmlns:command-ext": namespace
            },
            "command-ext-domain:domain": { "_attr":{"xmlns:command-ext-domain": "http://www.metaregistrar.com/epp/command-ext-domain-1.0"},"command-ext-domain:transfer": domainExtensionData }
        };
        let processedExtension = {
            "command-ext:command-ext": processedKeyValues
        };
        return processedExtension;
    }

    static mixinMapper( destObj ) {
        return commandMapping
    }
}

module
    .exports = MetaregistrarExtension;

