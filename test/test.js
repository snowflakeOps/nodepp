"use strict";
let chai = require( 'chai' );
let path = require( 'path' );

let expect = chai.expect;
let should = chai.should;
chai.config.truncateThreshold = 0;

let EppFactory = require( '../lib/epp-factory.js' );
let filePath = path.resolve( __dirname, '../config', 'epp-config-example.json' );
let nconf = require( '../lib/utilities/config.js' ).getConfig( filePath );
let logger = require( '../lib/utilities/logging.js' ).getLogger( nconf );

describe( 'EPP serialisation', function() {
    describe( 'general commands', function() {
        let epp,
            config;
        beforeEach( function() {
            config = nconf.get( 'app-config' )[ 'registry-test2' ];
            epp = EppFactory.generate( 'registry-test2', config );
            if ( !epp ) {
                throw new Error( "Unable to initialise epp" );
            }
        } );
        describe( 'helper functions', function() {
            it( 'should process different types of period data', function() {
                let periodData = 3;
                let processedData = epp.processDomainPeriod( periodData );
                expect( processedData._attr.unit ).to.equal( "y" );
                expect( processedData._value ).to.equal( periodData );

                let twelveMonthPeriod = {
                    "unit": "m",
                    "value": 12
                };
                let processedTwelveMonth = epp.processDomainPeriod( twelveMonthPeriod );
                expect( processedTwelveMonth._attr.unit ).to.equal( "m" );
                expect( processedTwelveMonth._value ).to.equal( twelveMonthPeriod.value );

                let unspecifiedUnit = {
                    "value": 2
                };
                let processUnspecUnit = epp.processDomainPeriod( unspecifiedUnit );
                expect( processUnspecUnit._attr.unit ).to.equal( 'y' );

            } );
            it( 'should process arrays of IPs for domain:hostAddr and host:addr objects', function() {
                let nameserver_addr1 = "255.255.255.255";
                let nameserver_addr2 = [ "255.255.255.255", {
                    "ip": "254.254.254.254"
                },
                    {
                        "ip": "::F5::E2",
                        "type": "v6"
                    } ];
                let processedIps1 = epp.processIPAddrObjects( nameserver_addr1 );
                expect( processedIps1 ).to.deep.equal( [ {
                    "_attr": {
                        "ip": "v4"
                    },
                    "_value": nameserver_addr1
                } ] );
                let processedIps2 = epp.processIPAddrObjects( nameserver_addr2 );
                expect( processedIps2[ 2 ] ).to.deep.equal( {
                    "_attr": {
                        "ip": "v6"
                    },
                    "_value": "::F5::E2"
                } );

            } );
            it( 'should preprocess nameserver information', function() {
                let nameservers1 = [ "ns1.test.com", "ns2.test.com", "ns3.test.com" ];
                let nameservers2 = [ {
                    "host": "ns2.test.com"
                },
                    {
                        "host": "ns3.test.com",
                        "addr": "255.255.255.255"
                    },
                    {
                        "host": "ns4.test.com",
                        "addr": [ "255.255.255.255", {
                            "ip": "254.254.254.254"
                        },
                            {
                                "ip": "::F5::E2",
                                "type": "v6"
                            } ]
                    } ];
                let processedNameservers1 = epp.processDomainNS( nameservers1 );
                expect( processedNameservers1 ).to.deep.equal( {
                    "domain:hostObj": nameservers1
                } );
                let processedNameservers2 = epp.processDomainNS( nameservers2 );
                expect( processedNameservers2[ "domain:hostAttr" ][ 2 ][ "domain:hostName" ] ).to.equal( 'ns4.test.com' );
                expect( processedNameservers2[ "domain:hostAttr" ][ 2 ][ "domain:hostAddr" ][ 2 ]._value ).to.equal( '::F5::E2' );
            } );
            it( 'should throw an error if a nameserver obj has no host', function() {
                let nameservers2 = [ {
                    "addr": "255.255.255.255"
                },
                ];
                let processNameserverTest = function() {
                    let processedNameservers2 = epp.processDomainNS( nameservers2 );
                };
                expect( processNameserverTest ).to.throw( "Host required in nameserver object!" );

            } );
            it( 'should correct some alternative data syntax', function() {
                let contactData = {
                    "id": "auto",
                    "telephone": "+1.9405551234",
                    "fax": "+1.9405551233",
                    "email": "john.doe@null.com",
                    "authcode": "xyz123",
                    "disclose": {
                        "flag": 0,
                        "disclosing": [ "voice", "email" ]
                    },
                    "postalInfo": [ {
                        "first_name": "John",
                        "lastname": "Doe",
                        "company": "Example Ltd",
                        "type": "int",
                        "addr": [ {
                            "street": [ "742 Evergreen Terrace", "Apt b" ],
                            "city": "Springfield",
                            "state": "OR",
                            "postcode": "97801",
                            "ccode": "US"
                        } ]
                    } ]
                };
                let processed = epp.processContactData( contactData );
                expect( processed ).to.have.deep.property( 'contact:voice' );
                let contactName = processed[ "contact:postalInfo" ][ 0 ][ "contact:name" ];
                expect( contactName ).to.be.equal( "John Doe" )
            } );

            it( 'should process different types of postalInfo data', function() {
                let postalInfo1 = [ {
                    "name": "John Doe",
                    "org": "Example Ltd",
                    "type": "int",
                    "addr": [ {
                        "street": [ "742 Evergreen Terrace", "Apt b" ],
                        "city": "Springfield",
                        "sp": "OR",
                        "pc": "97801",
                        "cc": "US"
                    } ]
                } ];
                let processedPostal1 = epp.processPostalInfo( postalInfo1 );
                expect( processedPostal1[ 0 ][ "contact:name" ] ).to.be.equal( "John Doe" )
                let postalInfo2 = {
                    "name": "John Doe",
                    "org": "Example Ltd",
                    "type": "int",
                    "addr": [ {
                        "street": [ "742 Evergreen Terrace", "Apt b" ],
                        "city": "Springfield",
                        "sp": "OR",
                        "pc": "97801",
                        "cc": "US"
                    } ]
                };
                let processedPostal2 = epp.processPostalInfo( postalInfo2 );
                expect( processedPostal2[ 0 ][ "contact:name" ] ).to.be.equal( "John Doe" );

            } );
            it( 'should handle different types of contact:addr data', function() {
                let addr1 = [ {
                    "street": [ "742 Evergreen Terrace", "Apt b" ],
                    "city": "Springfield",
                    "sp": "OR",
                    "pc": "97801",
                    "cc": "US"
                } ];
                let processedAddr1 = epp.processPostalAddresses( addr1 );
                expect( processedAddr1[ 0 ][ 'contact:sp' ] ).to.be.equal( "OR" );
                let addr2 = {
                    "street": [ "742 Evergreen Terrace", "Apt b" ],
                    "city": "Springfield",
                    "sp": "OR",
                    "pc": "97801",
                    "cc": "US"
                };
                let processedAddr2 = epp.processPostalAddresses( addr2 );
                expect( processedAddr2[ 0 ][ 'contact:sp' ] ).to.be.equal( "OR" );

            } );
        } );
        describe( 'xml generation', function() {
            it( 'should be an epp object with hexonet config', function() {
                expect( epp ).to.be.an.instanceof( Object );
                expect( config.namespaces.epp.xmlns ).to.be.equal( 'urn:ietf:params:xml:ns:epp-1.0' );
            } );
            it( 'should generate an xml body', function() {
                let xml = epp.login( {
                        "login": "user1",
                        "password": "abc123"
                    },
                    'test-1234' );
                expect( xml ).to.match( /<login>/ );
            } );
            it( 'should generate a hello command', function() {
                let xml = epp.hello();
                expect( xml ).to.match( /<hello\/>/ );
            } );
            it( 'should generate a logout command', function() {
                let xml = epp.logout( 'test-1235' );
                expect( xml ).to.match( /<logout\/>/ );
            } );
            it( 'should generate a checkDomain command', function() {
                let xml = epp.checkDomain( {
                        "domain": "test-domain.com"
                    },
                    'test-12345' );
                expect( xml ).to.match( /<check>(?:(?!<domain:name>).)*<domain:name>test-domain.com/ );
            } );
            it( 'should generate a createContact command', function() {
                let contactData = {
                    "id": "auto",
                    "voice": "+1.9405551234",
                    "fax": "+1.9405551233",
                    "email": "john.doe@null.com",
                    "authInfo": {
                        "pw": "xyz123"
                    },
                    "disclose": {
                        "flag": 0,
                        "disclosing": [ "voice", "email" ]
                    },
                    "postalInfo": [ {
                        "name": "John Doe",
                        "org": "Example Ltd",
                        "type": "int",
                        "addr": [ {
                            "street": [ "742 Evergreen Terrace", "Apt b" ],
                            "city": "Springfield",
                            "sp": "OR",
                            "pc": "97801",
                            "cc": "US"
                        } ]
                    } ]
                };
                let xml = epp.createContact( contactData, 'test-12345' );
                expect( xml ).to.match( /xmlns:contact=\"urn:ietf:params:xml:ns:contact-1.0\"/ );
                expect( xml ).to.match( /<contact:name>John Doe<\/contact:name>/ );
                expect( xml ).to.match( /<contact:addr>(?:(?!<contact:city>).)*<contact:city>Springfield/ );
                expect( xml ).to.match( /<contact:disclose(?:(?!<contact:email>).)*<contact:email\/>/ );
            } );
            it( 'should generate a createContact command with higher-level characters', function() {
                let contactData = {
                    "id": "auto",
                    "voice": "+1.9405551234",
                    "fax": "+1.9405551233",
                    "email": "john.doe@null.com",
                    "authInfo": {
                        "pw": "xyz123"
                    },
                    "disclose": {
                        "flag": 0,
                        "disclosing": [ "voice", "email" ]
                    },
                    "postalInfo": [ {
                        "name": "Harald Müller",
                        "org": "Mein Geschäft",
                        "type": "int",
                        "addr": [ {
                            "street": [ "Ludwig-Braille Straße", "10" ],
                            "city": "München",
                            "sp": "Bayern",
                            "pc": "86371",
                            "cc": "DE"
                        } ]
                    } ]
                };
                let xml = epp.createContact( contactData, 'test-12345' );
                expect( xml ).to.match( /xmlns:contact=\"urn:ietf:params:xml:ns:contact-1.0\"/ );
                expect( xml ).to.match( /<contact:name>Harald Müller<\/contact:name>/ );
                expect( xml ).to.match( /<contact:addr>(?:(?!<contact:city>).)*<contact:city>München/ );
                expect( xml ).to.match( /<contact:disclose(?:(?!<contact:email>).)*<contact:email\/>/ );

            } );
            it( 'should generate a "deleteContact" command', function() {
                let deleteContact = {
                    "id": "p-13243"
                };
                let xml = epp.deleteContact( deleteContact, 'test-1234' );
                expect( xml ).to.match( /<contact:id>(?:(?!<\/contact:id).)*p-13243<\/contact:id/ );
            } );
            it( 'should generate an "update contact" command', function() {
                let updateData = {
                    id: "p-12345",
                    add: [ 'clientDeleteProhibited' ],
                    rem: [ 'clientTransferProhibited' ],
                    chg: {
                        "postalInfo": [ {
                            "name": "John Doe",
                            "org": "Example Ltd",
                            "type": "loc",
                            "addr": [ {
                                "street": [ "742 Evergreen Terrace", "Apt b" ],
                                "city": "Eugene",
                                "sp": "OR",
                                "pc": "97801",
                                "cc": "US"
                            } ]
                        } ],
                        "voice": "+1.9405551234",
                        "fax": "+1.9405551233",
                        "email": "john.doe@null.com",
                        "authInfo": {
                            "pw": "xyz123"
                        },
                        "disclose": {
                            "flag": 0,
                            "disclosing": [ "voice", "email" ]
                        }
                    }
                };
                let xml = epp.updateContact( updateData, 'test-1234' );
                expect( xml ).to.match( /<contact:status\ss=\"clientDeleteProhibited\"/ );
                expect( xml ).to.match( /<contact:status\ss=\"clientTransferProhibited\"/ );
                expect( xml ).to.match( /<contact:chg>(?:(?!<\/contact:chg>).)*<\/contact:chg>/ );
            } );
            it( 'should generate a create domain command', function() {
                let createDomain = {
                    "name": "test-domain.com",
                    "period": {
                        "unit": "y",
                        "value": 2
                    },
                    "ns": [ "ns1.example.net", "ns2.example.net" ],
                    "registrant": "P-12345",
                    "contact": [ {
                        "admin": "P-12345"
                    },
                        {
                            "tech": "P-12346"
                        },
                    ],
                    "authInfo": {
                        "pw": "Axri3kjp"
                    }
                };
                let xml = epp.createDomain( createDomain, 'test-14989' );
                expect( xml ).to.match( /<domain:name>test-domain\.com<\/domain:name>/ );
                expect( xml ).to.match( /<domain:registrant>P-12345<\/domain:registrant/ );
            } );
            it( 'should generate a "deleteDomain" command', function() {
                let deleteDomain = {
                    "name": "my-delete-domain.com"
                };
                let xml = epp.deleteDomain( deleteDomain, 'test-1234' );
                expect( xml ).to.match( /<domain:name>(?:(?!<\/domain:name).)*my-delete-domain.com<\/domain:name/ );
            } );
            it( 'should generate a transfer domain command', function() {
                let transferDomain = {
                    "name": "test-domain.com",
                    "op": "request",
                    "period": 1,
                    "authInfo": {
                        "roid": "P-12345",
                        "pw": "2fooBAR"
                    },
                    "extension": {
                        "commandExt": {
                            "asdf": "test"
                        }
                    }
                };
                let xml = epp.transferDomain( transferDomain, 'test-1234' );
                expect( xml ).to.match( /<transfer op="request"/ );

                let transferReject = {
                    "name": "test-domain.com",
                    "op": "reject",
                    "authInfo": {
                        "roid": "P-12345",
                        "pw": "2fooBAR"
                    }
                };
                xml = epp.transferDomain( transferReject, 'test-1234' );
                expect( xml ).to.match( /<transfer op="reject"/ );
            } );
            it( 'should throw exception if op incorrect', function() {
                let transferDomain = {
                    "name": "test-domain.com",
                    "op": "yipee",
                    "period": 1,
                    "authInfo": {
                        "roid": "P-12345",
                        "pw": "2fooBAR"
                    }
                };
                let throwsError = function() {
                    epp.transferDomain( transferDomain, 'test-1234' );
                };
                expect( throwsError ).to.throw( 'Transfer domain op must be one of the following: [approve, cancel, query, reject, request].' );
            } );
            it( 'should throw exception if no authInfo pw supplied', function() {
                let transferDomain = {
                    "name": "test-domain.com",
                    "op": "request",
                    "period": 1,
                    "authInfo": {
                        "roid": "P-12345",
                    }
                };
                let throwsError = function() {
                    epp.transferDomain( transferDomain, 'test-1234' );
                };
                expect( throwsError ).to.throw( 'pw is required!' );
            } );
            it( 'should render update domain', function() {
                let updateDomain1 = {
                    "name": "test-domain.com",
                    "add": {
                        "ns": [ "ns3.test.com", "ns4.whatever.com" ],
                        "contact": [ {
                            "admin": "P-9876"
                        },
                            {
                                "billing": "PX143"
                            } ],
                        "status": [ "clientUpdateProhibited", {
                            "s": "clientHold",
                            "lang": "en",
                            "value": "Payment Overdue"
                        } ]
                    },
                    "rem": {
                        "ns": [ {
                            "host": "ns1.test-domain.com",
                            "addr": {
                                "type": "v4",
                                "ip": "192.68.2.132"
                            }
                        } ],
                        "contact": [ {
                            "billing": "PX147"
                        } ],
                        "status": [ "clientTransferProhibited", {
                            "s": "clientWhatever",
                            "lang": "en",
                            "value": "Payment Overdue"
                        } ]
                    },
                    "chg": {
                        "registrant": "P-49023",
                        "authInfo": {
                            "pw": "TestPass2"
                        }
                    }
                };
                let xml = epp.updateDomain( updateDomain1, 'test-12346' );
                expect( xml ).to.match( /<domain:add>(?:(?!<\/domain:add).)*ns4.whatever.com/ );
                expect( xml ).to.match( /<domain:rem>(?:(?!<\/domain:rem).)*ns1.test-domain.com/ );
                expect( xml ).to.match( /<domain:chg>(?:(?!<\/domain:registrant>).)*P-49023/ );
            } );
            it( 'should create a createHost command', function() {
                let createHost = {
                    "name": "ns1.host.com",
                    "addr": [ "23.84.43.123", {
                        "ip": "22.4.22.5"
                    },
                        {
                            "ip": "::F3:34::BA:",
                            "type": "v6"
                        } ]
                };
                let xml = epp.createHost( createHost, 'test-1234' );
                expect( xml ).to.match( /<host:name>(?:(?!<\/host:name).)*ns1.host.com/ );
            } );
            it( 'should create an updateHost command', function() {
                let updateHost = {
                    "name": "ns1.host.com",
                    "chg": {
                        "name": "ns2.host.com",
                    },
                    "add": {
                        "addr": {
                            "ip": "::F3:34::BA:",
                            "type": "v6"
                        },
                        "status": [ "clientUpdateProhibited" ]
                    },
                    "rem": {
                        "addr": [ "23.84.43.123", {
                            "ip": "22.4.22.5"
                        } ],
                        "status": [ "clientTransferProhibited", "sneezeAchoo" ]
                    }
                };
                let xml = epp.updateHost( updateHost, 'test-1234' );
                expect( xml ).to.match( /<host:rem>(?:(?!<\/host:rem).)*clientTransferProhibited/ );
                expect( xml ).to.match( /<host:update\s+xmlns:host/ );
            } );
            it( 'should create a poll request', function() {
                let processedPoll = epp.poll( {},
                    'test-1234' );
                expect( processedPoll ).to.match( /<poll\s+op=\"req\"/ );
                let poll2 = {
                    "msgID": 1234
                };
                let processedPoll2 = epp.poll( poll2, 'test-12345' );
                expect( processedPoll2 ).to.match( /<poll[^>]+op=\"ack\"/ );
                expect( processedPoll2 ).to.match( /msgID=\"1234\"/ );
            } );

            it( 'should render an "authInfo" section', function() {
                let authData = {
                    pw: 'teStPass',
                    roid: 'P-12345'
                };
                let processedData = epp.processAuthInfo( authData, 'domain' );
                let xml = epp.callConvert( processedData, 'test' );
                expect( xml ).to.match( /<domain:pw roid="P-12345">teStPass<\/domain:pw>/ );
                let authNoRoidData = {
                    pw: 'teStPass'
                };
                let processedNoRoid = epp.processAuthInfo( authNoRoidData, 'contact' );
                xml = epp.callConvert( processedNoRoid, 'test' );
                expect( xml ).to.match( /<contact:pw>teStPass<\/contact:pw>/ );

                let plainAuthInfo = 'teStPass';
                let processedPlainAuthInfo = epp.processAuthInfo( plainAuthInfo, 'contact' );
                xml = epp.callConvert( processedPlainAuthInfo, 'test' );
                expect( xml ).to.match( /<contact:pw>teStPass<\/contact:pw>/ );

                let emptyString = '';
                let processedEmpty = epp.processAuthInfo( emptyString, 'domain' );
                let xmlEmptyAuth = epp.callConvert( processedEmpty, 'test' );
                expect( xmlEmptyAuth ).to.match( /<domain:pw><\/domain:pw>/ );

                let emptyPw = {
                    pw: ''
                };
                let processEmptyPw = epp.processAuthInfo( emptyPw, 'domain' );
                let xmlEmptyPw = epp.callConvert( processEmptyPw, 'test' );
                expect( xmlEmptyPw ).to.match( /<domain:pw><\/domain:pw>/ );

                let undefinedPw = {
                    pw: undefined
                };
                let processUndefinedPw = epp.processAuthInfo( undefinedPw, 'domain' );
                let xmlUndefPw = epp.callConvert( processUndefinedPw, 'test' );
                expect( xmlUndefPw ).to.match( /<domain:pw><\/domain:pw>/ );

            } );
        } );
    } );
    describe( 'extension handling', function() {
        let epp,
            config;
        beforeEach( function() {
            config = nconf.get( 'app-config' )[ 'registry-test1' ];
            epp = EppFactory.generate( 'registry-test1', config );
        } );
        it( 'should be decorated with the secDNS extension methods', function() {
            expect( epp ).to.respondTo( 'createDomainSecDnsExtension' );
            expect( epp ).to.respondTo( 'updateDomainSecDnsExtension' );
        } );

        it( 'should convert createDomain secDNS data into structure with xmlns', function() {

            let secDnsData = {
                "maxSigLife": 604800,
                "dsData": {
                    "keyTag": 12345,
                    "alg": 3,
                    "digestType": 1,
                    "digest": "49FD46E6C4B45C55D4AC"
                }
            };
            let processedDSData = epp.createDomainSecDnsExtension( secDnsData );
            expect( processedDSData[ 'secDNS:create' ][ 'secDNS:dsData' ][ 'secDNS:digest' ] ).to.be.equal( "49FD46E6C4B45C55D4AC" );

            secDnsData.dsData.keyData = {
                "flags": 257,
                "protocol": 3,
                "alg": 1,
                "pubKey": "AQPJ////4Q=="
            };
            let processedWithKeyData = epp.createDomainSecDnsExtension( secDnsData );
            expect( processedWithKeyData[ 'secDNS:create' ][ 'secDNS:dsData' ][ 'secDNS:keyData' ][ 'secDNS:pubKey' ] ).to.be.equal( "AQPJ////4Q==" );

            let secDnsKeyData = {
                "keyData": {
                    "flags": 257,
                    "protocol": 3,
                    "alg": 1,
                    "pubKey": "AQPJ////4Q=="
                }
            };
            let processedKeyData = epp.createDomainSecDnsExtension( secDnsKeyData );
            expect( processedKeyData[ 'secDNS:create' ][ 'secDNS:keyData' ][ 'secDNS:pubKey' ] ).to.be.equal( "AQPJ////4Q==" );

        } );

        it( 'should handle DNSSEC update data structures', function() {
            let secDnsUpdate = {
                "add": {
                    "dsData": {
                        "keyTag": 12345,
                        "alg": 3,
                        "digestType": 1,
                        "digest": "49FD46E6C4B45C55D4AC"
                    }
                },
                "rem": {
                    "keyData": {
                        "flags": 257,
                        "protocol": 3,
                        "alg": 1,
                        "pubKey": "AQPJ////4Q=="
                    }
                },
                "chg": {
                    "maxSigLife": 604800
                }
            };
            let processedUpdate = epp.updateDomainSecDnsExtension( secDnsUpdate );
            expect( processedUpdate[ 'secDNS:update' ][ 'secDNS:rem' ][ 'secDNS:keyData' ][ 'secDNS:pubKey' ] ).to.be.equal( "AQPJ////4Q==" );
            expect( processedUpdate[ 'secDNS:update' ][ 'secDNS:chg' ][ 'secDNS:maxSigLife' ] ).to.be.equal( 604800 );
        } );
        it( 'should ignore any other data when secDNS:rem contains "all".', function() {
            let secDnsUpdate = {
                "add": {
                    "dsData": {
                        "keyTag": 12345,
                        "alg": 3,
                        "digestType": 1,
                        "digest": "49FD46E6C4B45C55D4AC"
                    }
                },
                "rem": {
                    "all": true,
                    "keyData": {
                        "flags": 257,
                        "protocol": 3,
                        "alg": 1,
                        "pubKey": "AQPJ////4Q=="
                    }
                },
                "chg": {
                    "maxSigLife": 604800
                }
            };
            let processedUpdate = epp.updateDomainSecDnsExtension( secDnsUpdate );
            expect( processedUpdate ).to.not.have.deep.property( "secDNS:update.secDNS:rem.secDNS:keyData" );
            expect( processedUpdate[ 'secDNS:update' ][ 'secDNS:rem' ][ 'secDNS:all' ] ).to.be.equal( "true" );
            let secDnsUpdate2 = {
                "rem": {
                    "all": 'goodtimes',
                },
            };
            let testCrash = function() {
                epp.updateDomainSecDnsExtension( secDnsUpdate2 );
            };
            expect( testCrash ).to.throw( "'all' must be a boolean or truthy number." );

            let createSecDnsData = {
                "keyData": {
                    "flags": 257,
                    "protocol": 3,
                    "alg": 1,
                    "pubKey": "AQPJ////4Q=="
                }
            };
            let testCrash2 = function() {
                epp.updateDomainSecDnsExtension( createSecDnsData );
            };
            expect( testCrash2 ).to.throw( "At least one 'chg', 'add', or 'rem' required in DNSSEC updates." );

        } );
        it( 'should generate an infoDomain command', function() {
            let infoData = {
                "domain": "test-info.com"
            };
            let xml = epp.infoDomain( infoData, 'test-info-1234' );
            expect( xml ).to.match( /<domain:info(?:(?!<\/domain:info).)*test-info\.com/ );
            let infoDataAuthInfo = {
                "domain": "test-info2.com",
                "authInfo": "p349jj39f"
            };
            let xmlAuthInfo = epp.infoDomain( infoDataAuthInfo );
            expect( xmlAuthInfo ).to.match( /<domain:pw>p349jj39f/ );
        } );
        it( 'should generate a renew domain command', function() {
            let renewData = {
                "curExpDate": "2000-04-03",
                "domain": "example.com",
                "period": 5
            };
            let xml = epp.renewDomain( renewData, 'ABC-12345' );
            expect( xml ).to.match( /<domain:period unit=\"y\">5<\/domain:period>/ );

        } );
        it( 'should generate an EPP update with secDNS', function() {
            let updateDomain = {
                "extension": {
                    "DNSSEC": {
                        "add": {
                            "dsData": {
                                "keyTag": 12345,
                                "alg": 3,
                                "digestType": 1,
                                "digest": "49FD46E6C4B45C55D4AC"
                            }
                        },
                        "rem": {
                            "keyData": {
                                "flags": 257,
                                "protocol": 3,
                                "alg": 1,
                                "pubKey": "AQPJ////4Q=="
                            }
                        },
                        "chg": {
                            "maxSigLife": 604800
                        }
                    }
                },
                "name": "test-domain.com",
                "add": {
                    "ns": [ "ns3.test.com", "ns4.whatever.com" ],
                    "contact": [ {
                        "admin": "P-9876"
                    },
                        {
                            "billing": "PX143"
                        } ],
                    "status": [ "clientUpdateProhibited", {
                        "s": "clientHold",
                        "lang": "en",
                        "value": "Payment Overdue"
                    } ]
                },
                "rem": {
                    "ns": [ {
                        "host": "ns1.test-domain.com",
                        "addr": {
                            "type": "v4",
                            "ip": "192.68.2.132"
                        }
                    } ],
                    "contact": [ {
                        "billing": "PX147"
                    } ],
                    "status": [ "clientTransferProhibited", {
                        "s": "clientWhatever",
                        "lang": "en",
                        "value": "Payment Overdue"
                    } ]
                },
                "chg": {
                    "registrant": "P-49023",
                    "authInfo": {
                        "pw": "TestPass2"
                    }
                }
            };
            let xml = epp.updateDomain( updateDomain );
            // Verify that some of the secDNS stuff is in there.
            expect( xml ).to.match( /<extension>(?:(?!<\/extension).)*secDNS:add/ );
        } );
    } );
    describe( 'Hexonet extension', function() {
        let reg2Epp,
            config;
        beforeEach( function() {
            config = nconf.get( 'app-config' )[ 'registry-test2' ];
            reg2Epp = EppFactory.generate( 'registry-test2', config );
        } );
        it( 'should be decorated with the secDNS extension methods', function() {
            expect( reg2Epp ).to.respondTo( 'createDomainExtension' );
        } );
        it( 'should process Hexonet "keyvalue" extension', function() {
            let keyValueData = {
                "X-ASIA-CED-ACCEPT-TRUSTEE-TAC": "1",
                "OWNERCONTACT1": "P-TAF28517",
                "OWNERCONTACT2": "P-TAF28559"
            };
            let processedExtension = reg2Epp.createDomainExtension( keyValueData );
            expect( processedExtension ).to.have.nested.property( "keyvalue:extension.keyvalue:kv[1]._attr.value", "P-TAF28517" );
            expect( processedExtension ).to.have.nested.property( "keyvalue:extension.keyvalue:kv[2]._attr.key", "OWNERCONTACT2" );
        } );
    } );
} );