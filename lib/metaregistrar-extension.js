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
        let keyValueSet = [];
        for ( let key in data ) {
            let value = data[ key ];
            keyValueSet.push( {
                "_attr": {
                    "key": key,
                    "value": value
                },
                "_value": null
            } );
        }
        if ( keyValueSet.length < 1 ) return undefined;
        let processedKeyValues = {
            "_attr": {
                "xmlns:command-ext": namespace
            },
            "keyvalue:kv": keyValueSet
        };
        let processedExtension = {
            "command-ext:extension": processedKeyValues
        };
        return processedExtension;
    }

    static mixinMapper( destObj ) {
        return commandMapping
    }
}

module.exports = MetaregistrarExtension;

