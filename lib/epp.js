"use strict";
let nconf = require( './utilities/config' ).getConfig();
let logger = require( './utilities/logging' ).getLogger( nconf );
let convert = require( 'data2xml' )( {
    'undefined': 'empty',
    'null': 'closed'
} );

class EPP {
    constructor( registry, config ) {
        this.registry = registry;
        this.config = config;
        this.extensionCommandMap = {};
    }

    hello() {
        return this.eppWrapper( {
            "hello": null
        } );
    }

    login( data, transactionId ) {
        let config = this.config;
        let namespaces = config.namespaces;
        let namespaceServices = config.services;
        let extensionServices = config.extensions;
        let services = [];
        let extensions = [];
        for ( let nsService in namespaceServices ) {
            let service = namespaceServices[ nsService ];
            let namespace = namespaces[ service ].xmlns;
            services.push( namespace );
        }
        for ( let extService in extensionServices ) {
            let extension = extensionServices[ extService ];
            let extNamespace = namespaces[ extension ].xmlns;
            extensions.push( extNamespace );
        }
        let loginData = {
            "clID": data.login,
            "pw": data.password,
            "options": {
                "version": "1.0",
                "lang": "en"
            },
            "svcs": {
                "objURI": services,
                "svcExtension": {
                    "extURI": extensions
                }
            }
        };
        if ( data.newPassword ) {
            loginData.newPW = data.newPassword;
        }
        if ( loginData.svcs.svcExtension.extURI.length === 0 ) {
            delete loginData.svcs.svcExtension;
        }
        let xml = this.eppCommand( {
                "login": loginData
            },
            transactionId );
        return xml;
    }

    logout( data, transactionId ) {
        return this.eppCommand( {
                "logout": null
            },
            transactionId );
    }

    processAuthInfo( data, namespace ) {
        let authType = typeof (data);
        let authInfo,
            roid;
        let authInfoData = {};
        let pwKey = [ namespace, 'pw' ].join( ':' );
        authInfoData[ pwKey ] = {};
        if ( authType === "string" || authType === "number" ) {
            authInfo = data;
        } else if ( authType === "object" ) {
            if ( !data.hasOwnProperty( 'pw' ) )
                throw new Error( 'pw is required!' );
            authInfo = data.pw;
            if ( data.roid )
                authInfoData[ pwKey ]._attr = {
                    "roid": data.roid
                };
        }
        authInfoData[ pwKey ]._value = authInfo;
        return authInfoData;
    }

    processDomainContacts( data ) {
        let contactData = [];
        for ( let contactInfo in data ) {
            let contact = data[ contactInfo ];
            for ( let contactType in contact ) {
                let value = contact[ contactType ];
                contactData.push( {
                    "_attr": {
                        "type": contactType
                    },
                    "_value": value
                } );
            }
        }
        return contactData;
    }

    processNSAttrIp( ipAddrObj ) {
        let type = "v4";
        let ip = ipAddrObj;
        if ( typeof (ipAddrObj) === 'object' ) {
            ip = ipAddrObj.ip;
            if ( !ip )
                throw new Error( "Nameserver object missing IP" );
            if ( ipAddrObj.type )
                type = ipAddrObj.type;
        }
        let hostAddrObj = {
            "_attr": {
                "ip": type
            },
            "_value": ip
        };
        return hostAddrObj;
    }

    processIPAddrObjects( addr ) {
        let addressObjects = [];
        if ( typeof (addr) === 'string' ) {
            addressObjects.push( this.processNSAttrIp( addr ) );
        } else if ( typeof (addr) === 'object' ) {
            if ( addr.ip ) addressObjects.push( this.processNSAttrIp( addr ) );
            else {
                for ( let i in addr ) {
                    let ipAddrObj = addr[ i ];
                    addressObjects.push( this.processNSAttrIp( ipAddrObj ) );
                }
            }
        }
        return addressObjects;
    }

    processDomainNS( data ) {
        let nsDataHostObjects = [];
        let nsDataHostAttrs = [];
        for ( let host in data ) {
            let ns = data[ host ];
            if ( typeof (ns) === 'string' ) {
                nsDataHostObjects.push( ns );
            } else if ( typeof (ns) === "object" ) {
                let nsHost = ns.host;
                if ( !nsHost )
                    throw new Error( "Host required in nameserver object!" );
                let hostAttrObj = {
                    "domain:hostName": nsHost
                };
                let addr = ns.addr;
                if ( addr ) {
                    hostAttrObj[ "domain:hostAddr" ] = this.processIPAddrObjects( addr );
                }
                nsDataHostAttrs.push( hostAttrObj );
            }
        }
        if ( nsDataHostObjects.length ) return {
            "domain:hostObj": nsDataHostObjects
        };
        if ( nsDataHostAttrs.length ) return {
            "domain:hostAttr": nsDataHostAttrs
        };
    }

    processDomainPeriod( period ) {
        let unit = "y",
            periodValue = 1;
        let periodType = typeof (period);
        if ( periodType === "number" || periodType === "string" ) {
            periodValue = period;
        } else if ( typeof (period) === 'object' ) {
            if ( period.unit )
                unit = period.unit;
            if ( period.value )
                periodValue = period.value;
        }
        return {
            "_attr": {
                "unit": unit
            },
            "_value": periodValue
        };
    }

    processStatus( objStatus ) {
        if ( typeof (objStatus) === 'string' ) {
            return {
                "_attr": {
                    "s": objStatus
                },
                "_value": null
            };

        } else if ( typeof (objStatus) === 'object' ) {
            let statusData = {
                "_attr": {}
            };
            for ( let key in objStatus ) {
                let item = objStatus[ key ];
                if ( key === "value" ) {
                    statusData._value = item;
                } else {
                    statusData._attr[ key ] = item;
                }
            }
            return statusData;
        }
    }

    processStatusSet( statusSet ) {
        let stati = [];
        for ( let statusItem in statusSet ) {
            stati.push( this.processStatus( statusSet[ statusItem ] ) );
        }
        return stati;
    }

    processContactAddRemove( array ) {
        let processedAddRemove = [];
        for ( let element in array ) {
            let addRemoveStatus = array[ element ];
            processedAddRemove.push( {
                "contact:status": {
                    "_attr": {
                        "s": addRemoveStatus,
                    },
                    "_value": null
                }
            } );
        }
        return processedAddRemove;
    }

    processPostalAddressItem( curAddr ) {
        this.normaliseletiants( 'cc', curAddr, [ "country", "ccode" ] );
        this.normaliseletiants( 'pc', curAddr, [ "pcode", "postcode", "zip" ] );
        this.normaliseletiants( 'sp', curAddr, [ "state" ] );
        let preppedCurAddr = {};
        if ( curAddr.street && curAddr.street.length > 0 ) {
            preppedCurAddr[ "contact:street" ] = curAddr.street;
        }
        if ( curAddr.city ) {
            preppedCurAddr[ "contact:city" ] = curAddr.city;
        }
        if ( curAddr.sp ) {
            preppedCurAddr[ "contact:sp" ] = curAddr.sp;
        }
        if ( curAddr.pc ) {
            preppedCurAddr[ "contact:pc" ] = curAddr.pc;
        }
        if ( curAddr.cc ) {
            preppedCurAddr[ "contact:cc" ] = curAddr.cc;
        }
        return preppedCurAddr;
    }

    processPostalAddresses( addresses ) {
        let preppedAddresses = [];
        if ( addresses instanceof Array ) {
            for ( let i in addresses ) {
                let addrItem = this.processPostalAddressItem( addresses[ i ] );
                preppedAddresses.push( addrItem );
            }
        } else {
            let addr = this.processPostalAddressItem( addresses );
            preppedAddresses.push( addr );
        }
        return preppedAddresses;
    }

    /* Try and convert a contact's name into something EPP recognises. EPP expects
    * a single "name" field with the contact's first and last name. Most
    * homegrown stuff stores it separately as "firstname" and "lastname".
    *
    * */
    processContactName( data ) {
        if ( !data.hasOwnProperty( 'name' ) ) {
            // temporarily normalise the first and lastnames into something
            let firstname = '',
                surname = '';
            let firstNameAlternatives = [ "firstname", "first_name" ];
            let surnameAlternatives = [ "lastname", "last_name", "surname" ];
            for ( let i in firstNameAlternatives ) {
                let firstnameAlt = firstNameAlternatives[ i ];
                if ( data.hasOwnProperty( firstnameAlt ) ) {
                    firstname = data[ firstnameAlt ];
                    break;
                }
            }
            for ( let j in surnameAlternatives ) {
                let surnameAlt = surnameAlternatives[ j ];
                if ( data.hasOwnProperty( surnameAlt ) ) {
                    surname = data[ surnameAlt ];
                    break;
                }
            }
            if ( firstname.length === 0 && surname.length === 0 ) {
                // hey we did our best
                return;
            }
            data.name = [ firstname, surname ].join( ' ' );
        }
    }

    processPostalInfoItem( postalInfo ) {
        this.normaliseletiants( 'org', postalInfo, [ "company", "organization", "organisation" ] );

        this.processContactName( postalInfo );
        let addresses = postalInfo.addr;
        let processedPostal = {
            "_attr": {
                "type": postalInfo.type
            }
        };
        if ( postalInfo.name ) {
            processedPostal[ "contact:name" ] = postalInfo.name;
        }
        if ( postalInfo.org ) {
            processedPostal[ "contact:org" ] = postalInfo.org;
        }
        if ( postalInfo.addr ) {
            processedPostal[ "contact:addr" ] = this.processPostalAddresses( postalInfo.addr );
        }
        return processedPostal;

    }

    processPostalInfo( postalInfoSet ) {
        if ( !postalInfoSet ) {
            throw new Error( "postalInfo required in contact data." );
        }
        let processedPostalInfo = [];
        if ( postalInfoSet instanceof Array ) {
            for ( let pI in postalInfoSet ) {
                let postalInfo = postalInfoSet[ pI ];
                let processedPostalItem = this.processPostalInfoItem( postalInfo );
                processedPostalInfo.push( processedPostalItem );
            }
        } else {
            let processedPostal = this.processPostalInfoItem( postalInfoSet );
            processedPostalInfo.push( processedPostal );
        }
        return processedPostalInfo;
    }

    /*
    * Convert letious alternative attributes into what EPP wants. This
    * way we can still use more sensible and intuitive attributes in legacy code
    * and not need to completely rewrite everything.
    *
    * */
    normaliseletiants( key, data, alternatives ) {
        for ( let i in alternatives ) {
            let alt = alternatives[ i ];
            if ( data.hasOwnProperty( alt ) && !data.hasOwnProperty( key ) ) {
                data[ key ] = data[ alt ];
            }
        }
    }

    processContactData( data ) {
        this.normaliseletiants( 'voice', data, [ "tel", "telephone", "phone" ] );

        let keys = [ "voice", "fax", "email" ];
        let processedContactData = {};
        let postalInfo = this.processPostalInfo( data.postalInfo );
        if ( postalInfo ) {
            processedContactData[ 'contact:postalInfo' ] = postalInfo;
        }
        if ( data.voice ) {
            processedContactData[ "contact:voice" ] = data.voice;
        }
        if ( data.fax ) {
            processedContactData[ "contact:fax" ] = data.fax;
        }
        if ( data.email ) {
            processedContactData[ "contact:email" ] = data.email;
        }
        this.normaliseletiants( 'authInfo', data, [ "authcode", "authCode", "auth_code", "password", "pw" ] );
        data.authInfo = data.authInfo || '';
        processedContactData[ 'contact:authInfo' ] = this.processAuthInfo( data.authInfo, 'contact' );
        if ( data.disclose ) {
            let discloseFlag = 0;
            if ( "flag" in data.disclose && data.disclose.flag ) {
                discloseFlag = 1;
            }
            let disclosing = {
                "_attr": {
                    "flag": discloseFlag
                }
            };
            if ( data.disclose.disclosing ) {
                for ( let toDisclose in data.disclose.disclosing ) {
                    let disclElement = {};
                    let discl = data.disclose.disclosing[ toDisclose ];
                    let array_value = null;
                    if ( typeof (discl) !== 'string' ) {
                        let discloseType = discl.type;
                        discl = discl.name;
                        array_value = {
                            _attr: {
                                type: discloseType
                            }
                        };
                    }
                    let keyArray = [ 'contact', discl ];
                    let eppKey = keyArray.join( ':' );
                    disclosing[ eppKey ] = array_value
                }
            }
            processedContactData[ 'contact:disclose' ] = disclosing;
        }
        return processedContactData;
    }

    checkDomain( data, transactionId ) {
        let config = this.config;
        let domainNamespace = config.namespaces.domain;
        let domain = data.domain;
        if ( !domain )
            domain = data.name;
        let checkData = {
            "domain:check": {
                "_attr": {
                    "xmlns:domain": domainNamespace.xmlns
                },
                "domain:name": domain
            }
        };

        let xml = this.eppCommand( {
                "check": checkData
            },
            transactionId );
        return xml;
    }

    infoDomain( data, transactionId ) {
        let config = this.config;
        let domainNamespace = config.namespaces.domain;
        let domain = data.domain;
        if ( !domain )
            domain = data.name;
        let domainData = {
            "_attr": {
                "xmlns:domain": domainNamespace.xmlns
            },
            "domain:name": domain
        };
        this.normaliseletiants( 'authInfo', data, [ "authcode", "authCode", "auth_code", "password", "pw" ] );
        if ( data.authInfo )
            domainData[ 'domain:authInfo' ] = this.processAuthInfo( data.authInfo, 'domain' );
        let infoData = {
            "domain:info": domainData
        };
        let xml = this.eppCommand( {
                "info": infoData
            },
            transactionId );
        return xml;
    }

    createDomain( data, transactionId ) {
        let config = this.config;
        let domainNamespace = config.namespaces.domain;
        let contacts = this.processDomainContacts( data.contact );
        let nsHostObjects = this.processDomainNS( data.ns );
        this.normaliseletiants( 'period', data, [ "interval" ] );
        this.normaliseletiants( 'registrant', data, [ "owner" ] );
        let createData = {
            "_attr": {
                "xmlns:domain": domainNamespace.xmlns
            },
            "domain:name": data.name,
            "domain:period": this.processDomainPeriod( data.period ),
            "domain:registrant": data.registrant,
            "domain:contact": contacts,
        };
        if ( nsHostObjects ) {
            createData = {
                "_attr": {
                    "xmlns:domain": domainNamespace.xmlns
                },
                "domain:name": data.name,
                "domain:period": this.processDomainPeriod( data.period ),
                "domain:ns": nsHostObjects,
                "domain:registrant": data.registrant,
                "domain:contact": contacts,
            };
        }
        this.normaliseletiants( 'authInfo', data, [ "authcode", "authCode", "auth_code", "password", "pw" ] );
        data.authInfo = data.authInfo || '';
        createData[ 'domain:authInfo' ] = this.processAuthInfo( data.authInfo, 'domain' );
        let commandData = {
            "create": {
                "domain:create": createData
            }
        };
        let processedExtension = this.processExtensions( data, 'createDomain' );

        if ( processedExtension ) commandData.extension = processedExtension;
        let xml = this.eppCommand( commandData, transactionId );
        return xml;
    }

    updateDomain( data, transactionId ) {
        let config = this.config;
        let domainNamespace = config.namespaces.domain;
        this.normaliseletiants( 'name', data, [ "domain" ] );
        let updateDomainData = {
            "_attr": {
                "xmlns:domain": domainNamespace.xmlns
            },
            "domain:name": data.name
        };
        let actions = [ "add", "rem" ];
        for ( let i in actions ) {
            let action = actions[ i ];
            let actionSet = data[ action ];
            if ( actionSet ) {
                let actionKey = [ 'domain', action ].join( ':' );
                let actionData = {};
                if ( actionSet.ns )
                    actionData[ 'domain:ns' ] = this.processDomainNS( actionSet.ns );
                if ( actionSet.contact )
                    actionData[ 'domain:contact' ] = this.processDomainContacts( actionSet.contact );
                if ( actionSet.status )
                    actionData[ 'domain:status' ] = this.processStatusSet( actionSet.status );
                updateDomainData[ actionKey ] = actionData;
            }
        }
        let change = data.chg;
        if ( change ) {
            let changeData = {};
            this.normaliseletiants( 'registrant', change, [ "owner" ] );
            if ( change.registrant )
                changeData[ 'domain:registrant' ] = change.registrant;
            this.normaliseletiants( 'authInfo', change, [ "authcode", "authCode", "auth_code", "password", "pw" ] );
            if ( change.hasOwnProperty( 'authInfo' ) )
                changeData[ 'domain:authInfo' ] = this.processAuthInfo( change.authInfo, 'domain' );
            updateDomainData[ 'domain:chg' ] = changeData;
        }

        let updateData = {
            "domain:update": updateDomainData
        };
        let commandData = {
            "update": updateData
        };
        let processedExtension = this.processExtensions( data, 'updateDomain' );
        if ( processedExtension )
            commandData.extension = processedExtension;
        let xml = this.eppCommand( commandData, transactionId );
        return xml;
    }

    renewDomain( data, transactionId ) {
        let config = this.config;
        let domainNamespace = config.namespaces.domain;
        this.normaliseletiants( 'name', data, [ "domain" ] );
        let domain = data.name;
        let domainRenewData = {
            "_attr": {
                "xmlns:domain": domainNamespace.xmlns
            },
            "domain:name": domain,
            "domain:curExpDate": data.curExpDate
        };
        this.normaliseletiants( 'period', data, [ "interval" ] );
        if ( data.period )
            domainRenewData[ "domain:period" ] = this.processDomainPeriod( data.period );
        let renewData = {
            "domain:renew": domainRenewData
        };
        let xml = this.eppCommand( {
                "renew": renewData
            },
            transactionId );
        return xml;
    }

    transferDomain( data, transactionId ) {
        let config = this.config;
        let domainNamespace = config.namespaces.domain;
        let op = 'request';
        this.normaliseletiants( 'name', data, [ "domain" ] );
        let allowedTransferOps = [ "approve", "cancel", "query", "reject", "request" ];
        if ( data.op ) {
            let joinedOps = allowedTransferOps.join( ', ' );
            let message = "Transfer domain op must be one of the following: [" + joinedOps + "].";
            if ( allowedTransferOps.indexOf( data.op ) < 0 )
                throw new Error( message );
            op = data.op;
        }

        let transferData = {
            "_attr": {
                "xmlns:domain": domainNamespace.xmlns
            },
            "domain:name": data.name
        };
        this.normaliseletiants( 'period', data, [ "interval" ] );
        if ( data.period )
            transferData[ "domain:period" ] = this.processDomainPeriod( data.period );
        this.normaliseletiants( 'authInfo', data, [ "authcode", "authCode", "auth_code", "password", "pw" ] );
        data.authInfo = data.authInfo || '';
        transferData[ "domain:authInfo" ] = this.processAuthInfo( data.authInfo, 'domain' );
        let xml = this.eppCommand( {
                "transfer": {
                    "_attr": {
                        "op": op
                    },
                    "domain:transfer": transferData
                }
            },
            transactionId );
        return xml;
    }

    deleteDomain( data, transactionId ) {
        let config = this.config;
        let domainNamespace = config.namespaces.domain;
        this.normaliseletiants( 'name', data, [ "domain" ] );
        let deleteData = {
            "domain:delete": {
                "_attr": {
                    "xmlns:domain": domainNamespace.xmlns
                },
                "domain:name": data.name
            }
        };
        let xml = this.eppCommand( {
            "delete": deleteData
        }, transactionId );
        return xml;
    }

    checkHost( data, transactionId ) {
        let config = this.config;
        let hostNamespace = config.namespaces.host;
        let host = data.name;
        if ( !host ) {
            host = data.host;
        }
        let checkData = {
            "host:check": {
                "_attr": {
                    "xmlns:host": hostNamespace.xmlns
                },
                "host:name": host
            }
        };
        let xml = this.eppCommand( {
                "check": checkData
            },
            transactionId );
        return xml;
    }

    infoHost( data, transactionId ) {
        let config = this.config;
        let hostNamespace = config.namespaces.host;
        let infoData = {
            "host:info": {
                "_attr": {
                    "xmlns:host": hostNamespace.xmlns
                },
                "host:name": data.name
            }
        };
        let xml = this.eppCommand( {
                "info": infoData
            },
            transactionId );
        return xml;
    }

    createHost( data, transactionId ) {
        let config = this.config;
        let hostNamespace = config.namespaces.host;
        let createData = {
            "_attr": {
                "xmlns:host": hostNamespace.xmlns
            },
            "host:name": data.name,
        };
        if ( data.addr )
            createData[ 'host:addr' ] = this.processIPAddrObjects( data.addr );

        let xml = this.eppCommand( {
                "create": {
                    "host:create": createData
                }
            },
            transactionId );
        return xml;
    }

    updateHost( data, transactionId ) {
        let config = this.config;
        let hostNamespace = config.namespaces.host;
        let updateHostData = {
            "_attr": {
                "xmlns:host": hostNamespace.xmlns
            },
            'host:name': data.name
        };
        let actions = [ "add", "rem" ];
        for ( let i in actions ) {
            let action = actions[ i ];
            let actionSet = data[ action ];
            if ( actionSet ) {
                let actionKey = [ 'host', action ].join( ':' );
                let actionData = {};
                if ( actionSet.addr )
                    actionData[ 'host:addr' ] = this.processIPAddrObjects( actionSet.addr );
                if ( actionSet.status )
                    actionData[ 'host:status' ] = this.processStatusSet( actionSet.status );
                updateHostData[ actionKey ] = actionData;
            }
        }

        let change = data.chg;
        if ( change ) {
            let changeData = {};
            if ( !change.name )
                throw new Error( "when changing the host object, a name is required" );
            changeData[ 'host:name' ] = change.name;
            updateHostData[ 'host:chg' ] = changeData;
        }

        let updateData = {
            "host:update": updateHostData
        };
        let xml = this.eppCommand( {
                "update": updateData
            },
            transactionId );
        return xml;
    }

    deleteHost( data, transactionId ) {
        let config = this.config;
        let hostNamespace = config.namespaces.host;
        let deleteData = {
            "host:delete": {
                "_attr": {
                    "xmlns:host": hostNamespace.xmlns
                },
                "host:name": data.host
            }
        };
        let xml = this.eppCommand( {
                "delete": deleteData
            },
            transactionId );
        return xml;
    }

    checkContact( data, transactionId ) {
        let config = this.config;
        let contactNamespace = config.namespaces.contact;
        let contactId = data.id;
        if ( !contactId ) {
            contactId = data.contact;
        }
        let checkData = {
            "contact:check": {
                "_attr": {
                    "xmlns:contact": contactNamespace.xmlns
                },
                "contact:id": contactId
            }
        };
        let xml = this.eppCommand( {
                "check": checkData
            },
            transactionId );
        return xml;
    }

    infoContact( data, transactionId ) {
        let config = this.config;
        let contactNamespace = config.namespaces.contact;
        let contactId = data.id;
        if ( !contactId ) {
            contactId = data.contact;
        }
        let infoData = {
            "contact:info": {
                "_attr": {
                    "xmlns:contact": contactNamespace.xmlns
                },
                "contact:id": contactId
            }
        };
        let xml = this.eppCommand( {
                "info": infoData
            },
            transactionId );
        return xml;
    }

    createContact( data, transactionId ) {
        let config = this.config;
        let contactNamespace = config.namespaces.contact;
        let processedContactData = this.processContactData( data );
        let createContact = {
            "_attr": {
                "xmlns:contact": contactNamespace.xmlns
            },
            "contact:id": data.id,
        };
        for ( let key in processedContactData ) {
            createContact[ key ] = processedContactData[ key ];
        }
        let xml = this.eppCommand( {
                "create": {
                    "contact:create": createContact
                }
            },
            transactionId );
        return xml;
    }

    updateContact( data, transactionId ) {
        let config = this.config;
        let contactNamespace = config.namespaces.contact;
        let change = data.chg;
        let contactId = data.id;
        if ( !contactId ) {
            contactId = data.contact;
        }

        let updateContactData = {
            "_attr": {
                "xmlns:contact": contactNamespace.xmlns
            },
            "contact:id": contactId
        };
        if ( data.add ) {
            updateContactData[ "contact:add" ] = this.processContactAddRemove( data.add );
        }
        if ( data.rem ) {
            updateContactData[ "contact:rem" ] = this.processContactAddRemove( data.rem );
        }
        if ( change ) {
            updateContactData[ 'contact:chg' ] = this.processContactData( change );
        }
        let xml = this.eppCommand( {
                "update": {
                    "contact:update": updateContactData
                }
            },
            transactionId );
        return xml;
    }

    transferContact( data, transactionId ) {
        let config = this.config;
        let contactNamespace = config.namespaces.contact;
        let contact = data.id;
        if ( !contact )
            contact = data.contact;
        let op = 'request';
        let allowedTransferOps = [ "approve", "cancel", "query", "reject", "request" ];
        if ( data.op ) {
            let joinedOps = allowedTransferOps.join( ', ' );
            let message = "Transfer contact op must be one of the following: [" + joinedOps + "].";
            if ( allowedTransferOps.indexOf( data.op ) < 0 )
                throw new Error( message );
            op = data.op;
        }

        let transferData = {
            "_attr": {
                "xmlns:contact": contactNamespace.xmlns
            },
            "contact:name": contact
        };
        this.normaliseletiants( 'authInfo', data, [ "authcode", "authCode", "auth_code", "password", "pw" ] );
        data.authInfo = data.authInfo || '';
        transferData[ "contact:authInfo" ] = this.processAuthInfo( data.authInfo, 'contact' );
        let xml = this.eppCommand( {
                "transfer": {
                    "_attr": {
                        "op": op
                    },
                    "contact:transfer": transferData
                }
            },
            transactionId );
        return xml;
    }

    deleteContact( data, transactionId ) {
        let config = this.config;
        let contactNamespace = config.namespaces.contact;
        this.normaliseletiants( 'id', data, [ "contact" ] );
        let contactId = data.id;
        let deleteData = {
            "contact:delete": {
                "_attr": {
                    "xmlns:contact": contactNamespace.xmlns
                },
                "contact:id": contactId
            }
        };
        let xml = this.eppCommand( {
                "delete": deleteData
            },
            transactionId );
        return xml;
    }

    poll( data, transactionId ) {
        let op = "req";
        let processedPoll = {
            "_attr": {},
            "_value": null
        };
        if ( data.msgID ) {
            op = "ack";
        }
        if ( !data.op )
            data.op = op;
        for ( let key in data ) {
            processedPoll._attr[ key ] = data[ key ];
        }

        let command = {
            "poll": processedPoll,
        };

        let processedExtension = this.processExtensions( data, 'poll' );
        if ( processedExtension )
            command.extension = processedExtension;

        let xml = this.eppCommand( command, transactionId );
        return xml;
    }

    eppCommand( data, trId ) {
        let commandData = data;
        commandData.clTRID = trId;
        let command = {
            "command": commandData
        };
        return this.eppWrapper( command );
    }

    callConvert( eppData, root ) {
        let xml;
        try {
            xml = convert( root, eppData );
        } catch (e) {
            logger.error( "Caught an error while generating EPP: ", e );
        }
        return xml;
    }

    eppWrapper( data ) {
        let config = this.config;
        let eppData = {
            "_attr": config.namespaces.epp
        };
        for ( let key in data ) {
            eppData[ key ] = data[ key ];
        }
        return this.callConvert( eppData, 'epp' );
    }

    processExtensions( data, command ) {
        let commandMap = this.extensionCommandMap[ command ];
        if ( commandMap && data.extension ) {
            let processedExtension = {};
            for ( let extension in data.extension ) {
                let extensionFunction = commandMap[ extension ];
                if ( extensionFunction ) {
                    let extensionData = data.extension[ extension ];
                    let result = this[ extensionFunction ]( extensionData );
                    for ( let key in result ) {
                        processedExtension[ key ] = result[ key ];
                    }
                }
            }
            return processedExtension;
        }
        return undefined;
    }
}

module.exports = EPP;

