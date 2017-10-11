"use strict";

class SecDnsExtension {
    constructor() {
    }

    processKeyData( keyData ) {
        let processedKeyData = {
            "secDNS:flags": keyData.flags,
            "secDNS:protocol": keyData.protocol,
            "secDNS:alg": keyData.alg,
            "secDNS:pubKey": keyData.pubKey
        };
        return processedKeyData;
    }

    processDsData( dsData ) {
        let processedDsData = {
            "secDNS:keyTag": dsData.keyTag,
            "secDNS:alg": dsData.alg,
            "secDNS:digestType": dsData.digestType,
            "secDNS:digest": dsData.digest
        };
        if ( dsData.keyData )
            processedDsData[ 'secDNS:keyData' ] = this.processKeyData( dsData.keyData );
        return processedDsData;
    }

    processSecDns( data ) {
        let secDns = {};
        if ( data.dsData ) {
            let dsData = data.dsData;
            if ( data.maxSigLife )
                secDns[ "secDNS:maxSigLife" ] = data.maxSigLife;
            let processedDsData = SecDnsExtension.prototype.processDsData( dsData );
            secDns[ "secDNS:dsData" ] = processedDsData;
        } else if ( data.keyData ) {
            let keyData = data.keyData;
            let processedKeyData = SecDnsExtension.prototype.processKeyData( keyData );
            secDns[ "secDNS:keyData" ] = processedKeyData;
        }
        return secDns;
    }

    /*
    * Process DNSSEC data for a createDomain command
    * */
    createDomainSecDnsExtension( data ) {
        let config = this.config;
        let namespace = config.namespaces.DNSSEC.xmlns;
        let secCreate = {
            "_attr": {
                "xmlns:secDNS": namespace
            }
        };
        if ( data.dsData || data.keyData ) {
            let processedSecDns = SecDnsExtension.prototype.processSecDns( data );
            for ( let key in processedSecDns )
                secCreate[ key ] = processedSecDns[ key ];
        } else {
            return;
        }
        let processedExtension = {
            'secDNS:create': secCreate
        };

        return processedExtension;
    }

    updateDomainSecDnsExtension( data ) {
        let config = this.config;
        let namespace = config.namespaces.DNSSEC.xmlns;
        let change = data.chg;
        let add = data.add;
        let rem = data.rem;
        let updateSecDns = {
            "_attr": {
                "xmlns:secDNS": namespace
            }
        };
        if ( !(change || add || rem) )
            throw new Error( "At least one 'chg', 'add', or 'rem' required in DNSSEC updates." );
        let actions = [ "add", "rem" ];
        for ( let i in actions ) {
            let action = actions[ i ];
            let actionSet = data[ action ];
            if ( actionSet ) {
                let actionKey = [ 'secDNS', action ].join( ':' );
                let actionData = {};
                if ( action === 'rem' && actionSet.all !== undefined ) {
                    // Make sure that "all" is a boolean, but accept numbers in
                    // case someone wants to send 0|1
                    let all = actionSet.all;
                    if ( typeof (all) === "number" ) {
                        all = true;
                        if ( all <= 0 )
                            all = false;
                    } else if ( typeof (all) !== "boolean" )
                        throw new Error( "'all' must be a boolean or truthy number." );
                    actionData[ "secDNS:all" ] = all.toString();
                    updateSecDns[ actionKey ] = actionData;
                    continue;
                }
                if ( actionSet.dsData || actionSet.keyData ) {
                    let processedSecDns = SecDnsExtension.prototype.processSecDns( actionSet );
                    for ( let key in processedSecDns )
                        actionData[ key ] = processedSecDns[ key ];
                }
                updateSecDns[ actionKey ] = actionData;
            }
        }
        if ( change ) {
            let changeSecDns = {};
            if ( change.maxSigLife )
                changeSecDns[ "secDNS:maxSigLife" ] = change.maxSigLife;
            updateSecDns[ "secDNS:chg" ] = changeSecDns;
        }
        let processedExtension = {
            'secDNS:update': updateSecDns
        };
        return processedExtension;

    }

    /*
    * Map generic epp function to extension equivalent.
    * */
    static mixinMapper( destObj ) {
        let commandMapping = [ {
            "createDomain": "createDomainSecDnsExtension",
            "updateDomain": "updateDomainSecDnsExtension",
        } ];
        return commandMapping;
    }

}


module.exports = SecDnsExtension;

