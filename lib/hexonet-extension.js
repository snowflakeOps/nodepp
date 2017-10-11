"use strict";
let commandMapping = [ {
    "createDomain": "createDomainExtension"
} ];

class HexonetExtension {
    constructor() {
    }

    createDomainExtension( data ) {
        let config = this.config;
        let namespace = config.namespaces.keyvalue.xmlns;
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
                "xmlns:keyvalue": namespace
            },
            "keyvalue:kv": keyValueSet
        };
        let processedExtension = {
            "keyvalue:extension": processedKeyValues
        };
        return processedExtension;
    }

    static mixinMapper( destObj ) {
        return commandMapping
    }
}

module.exports = HexonetExtension;

