"use strict";

var bip32utils = require('bip32-utils')
var async = require('async')
var Big = require('big.js')

function discoverAddressesForAccounts(api, externalAccount, internalAccount, addressFunction, callback) {
    var functions = [externalAccount, internalAccount].map(function(account) {
        var deriveFunction = function(parent, index) {
            return parent.deriveChild(index);
        }
        var iterator = new bip32utils.Chain(account, 0, addressFunction, deriveFunction)
        return function(cb) { discoverUsedAddresses(iterator, api, cb) }
    })

    async.parallel(functions, function(err, results) {
        if (err) return callback(err);

        var txIds = results[0].txIds.concat(results[1].txIds);
        txIds = txIds.filter(function(item, i) {
            return txIds.indexOf(item) === i;
        })

        callback(null, results[0].addresses, results[1].addresses,
            btcToSatoshi(results[0].balance + results[1].balance),
            results[0].unspentAddresses.concat(results[1].unspentAddresses),
            txIds)
    })
}

function discoverUsedAddresses(iterator, api, done) {
    var usedAddresses = []
    var unspentAddresses = []
    var txIds = []
    var balance = 0

    bip32utils.discovery(iterator, 10, function(addresses, callback) {
        usedAddresses = usedAddresses.concat(addresses)

        api.addresses.summary(addresses, function(err, results) {
            if (err) return callback(err);

            txIds = txIds.concat(results.reduce(function(memo, result) {
                return memo.concat(result.txIds)
            }, []))

            balance += results.reduce(function(total, address) {
                if (address.balance > 0) {
                    unspentAddresses.push(address.address)
                }
                return total += address.balance
            }, 0)

            var areUsed = results.reduce(function(obj, result) {
                obj[result.address] = result.txCount > 0
                return obj
            }, {})
            callback(undefined, areUsed)
        })
    }, function(err, k) {
        if (err) return done(err);

        console.info('Discovered ' + k + ' addresses')

        done(null, {
            addresses: usedAddresses.slice(0, k),
            balance: balance,
            unspentAddresses: unspentAddresses,
            txIds: txIds
        })
    })
}

function fetchTransactions(api, addresses, txIds, done) {
    var params = {
        noRaw: 1,
        noAsm: 1,
        noSpent: 1,
        noScriptSig: 1
    }
    api.transactions.get(txIds, params, function(err, txs) {
        if (err) return done(err);

        txs.forEach(function(tx) {
            tx.fees = btcToSatoshi(tx.fees)

            var inputValue = tx.vin.reduce(function(memo, input) {
                if (addresses.indexOf(input.addr) >= 0) {
                    return memo + input.valueSat
                }
                return memo
            }, 0)
            var outputValue = tx.vout.reduce(function(memo, output) {
                if (output.scriptPubKey.addresses && addresses.indexOf(output.scriptPubKey.addresses[0]) >= 0) {
                    return memo + output.value * 100000000;
                }
                return memo
            }, 0)
            tx.amount = outputValue - inputValue
            if (tx.amount < 0) {
                tx.amount += tx.fees
            }

        })

        done(null, txs)
    })
}

function btcToSatoshi(btc) {
    return parseInt(new Big(btc).times(100000000), 10)
}

function fetchUnspents(api, addresses, done) {
    api.addresses.unspents(addresses, function(err, unspents) {
        if (err) return done(err);
        done(null, unspents)
    })
}

function getAdditionalTxIds(txs) {
    var inputTxIds = txs.reduce(function(memo, tx) {
        tx.ins.forEach(function(input) {
            var hash = new Buffer(input.hash)
            Array.prototype.reverse.call(hash)
            memo[hash.toString('hex')] = true
        })
        return memo
    }, {})

    var txIds = txs.map(function(tx) { return tx.getId() })

    return Object.keys(inputTxIds).filter(function(id) {
        return txIds.indexOf(id) < 0
    })
}

function getServiceAddresses(api) {
    return api.blocks.getServiceAddresses(function(err, addresses) {
        if (err) return err;
        return addresses;
    });
}

function getOrganizationList(api, orgAddress){
    return api.blocks.getOrganizationList(orgAddress, function(err, orgAddresses) {
	if (err) return err; 
	return orgAddresses;
    });
}

function getAllOrgLists(api) {
    return api.blocks.getAllOrgLists(
	function(err, addresses) {
	  if(err) return err;
	  return addresses;
	});
}

function getAllCouponLists(api){
    return api.blocks.getAllCouponLists(
        function(err, coupons) {
            if(err) return err;
            return coupons;
        }
    );
}

module.exports = {
    discoverAddresses: discoverAddressesForAccounts,
    fetchTransactions: fetchTransactions,
    fetchUnspents: fetchUnspents,
    getServiceAddresses: getServiceAddresses,
    getOrganizationList: getOrganizationList,
    getAllOrgLists: getAllOrgLists, 
    getAllCouponLists: getAllCouponLists,
}
