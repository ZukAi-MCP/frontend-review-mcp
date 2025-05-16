"use strict";

var assert = require('assert');
var bitcoin = require('bitcoinjs-lib');
var discoverAddresses = require('./network').discoverAddresses;
var fetchTransactions = require('./network').fetchTransactions;
var fetchUnspents = require('./network').fetchUnspents;
var getServiceAddresses = require('./network').getServiceAddresses;
var getAllOrgLists = require('./network').getAllOrgLists;
var getAllCouponLists = require('./network').getAllCouponLists;
var validate = require('./validator');
var API = require('cs-insight');
var _ = require('lodash');
var HDKey = require('hdkey');
var BigInteger = require('bigi');
const { sum } = require('lodash');
var toAtom = require('lib/convert').toAtom;
var toUnit = require('lib/convert').toUnit;

var shuffle = require('./utils').shuffle
var newBuilder = require('./utils').newBuilder
var getIdx = require('./utils').getIdx
var argmax = require('./utils').argmax
var utxoValues = require('./utils').utxoValues

bitcoin.networks = _.merge(bitcoin.networks, {
  bitcoin: {
    dustThreshold: 546,
    feePerKb: 10000
  },
  testnet: {
    dustThreshold: 546,
    feePerKb: 10000
  },
  litecoin: {
    dustThreshold: 54600,
    dustSoftThreshold: 100000,
    feePerKb: 100000
  },
  smileycoin: {
    dustThreshold: 55000,
    dustSoftThreshold: 100000,
    feePerKb: 100000000,
    maxUnspents: 50
  }
});
bitcoin.networks.bitcoincash = bitcoin.networks.bitcoin;

function getAPI(network) {
    var baseURL = null;

    if ((network === 'bitcoin' || network === 'testnet')) {
        baseURL = process.env.API_BTC_URL;
    } else if (network === 'bitcoincash') {
        baseURL = process.env.API_BCH_URL;
    } else if (network === 'litecoin') {
        baseURL = process.env.API_LTC_URL;
    }

    return new API(network, baseURL)
}

function Wallet(options) {
    if (arguments.length === 0) return this;

    var externalAccount = options.externalAccount
    var internalAccount = options.internalAccount
    var networkName = options.networkName
    var network = bitcoin.networks[networkName]
    var done = options.done
    var txDone = options.txDone ? options.txDone : function() {}

    try {
        if (typeof externalAccount === 'string') {
            this.externalAccount = HDKey.fromExtendedKey(externalAccount, network.bip32)
        } else {
            this.externalAccount = externalAccount
        }

        if (typeof internalAccount === 'string') {
            this.internalAccount = HDKey.fromExtendedKey(internalAccount, network.bip32)
        } else {
            this.internalAccount = internalAccount
        }

        assert(this.externalAccount != null, 'externalAccount cannot be null')
        assert(this.internalAccount != null, 'internalAccount cannot be null')
    } catch (err) {
        return doneError(err)
    }

    this.networkName = networkName
    this.api = getAPI(networkName)
    this.balance = 0
    this.historyTxs = []
    this.unspents = []
    this.minConf = options.minConf || 4;
    this.serviceAddresses = {};
    this.allOrgLists = {};
    this.allCouponLists = {};

    this.fetchServiceAddresses();
    this.fetchAllOrganizationList();
    this.fetchCouponList();

    var that = this;
    var addressFunction = function(node) {
        return getAddress(node, networkName)
    };

    discoverAddresses(this.api, this.externalAccount, this.internalAccount, addressFunction,
        function(err, addresses, changeAddresses, balance, unspentAddresses, txIds) {
            if (err) {
                return doneError(err);
            }

            that.addresses = addresses
            that.changeAddresses = changeAddresses
            that.balance = balance

            var allAddresses = addresses.concat(changeAddresses)

            fetchUnspents(that.api, unspentAddresses, function(err, utxos) {
                if (err) return done(err);
                that.unspents = utxos;
                done(null, that)

                fetchTransactions(that.api, allAddresses, txIds, function(err, historyTxs) {
                    if (err) return txDone(err);
                    that.historyTxs = historyTxs
                    txDone(null, that)
                })
            })
        })

    function doneError(err) {
        done(err)
        txDone(err)
    }
}

Wallet.bitcoin = bitcoin;

Wallet.prototype.getBalance = function() {
    return this.balance
}

Wallet.prototype.fetchServiceAddresses = function() {
    getServiceAddresses(this.api)
        .then(data => { this.serviceAddresses = data })
        .catch(console.error);
}

Wallet.prototype.fetchAllOrganizationList = function() {
  getAllOrgLists(this.api)
  .then(data => {
    // re-arranging the orglist until corewallet has been updated
    var orgs = data['Organizations'];
    this.allOrgLists = orgs;
  })
  .catch(console.error);
}

Wallet.prototype.fetchCouponList = function() {
  getAllCouponLists(this.api)
  .then(data => {
    this.allCouponLists = data;
  }).catch(console.error);
}

Wallet.prototype.getServiceAddresses = function() {
    return this.serviceAddresses;
}

Wallet.prototype.getAllOrgLists = function() {
    return this.allOrgLists;
}

Wallet.prototype.getCouponLists = function () {
  return this.allCouponLists;
}

Wallet.prototype.getNextChangeAddress = function() {
    return getAddress(this.internalAccount.deriveChild(this.changeAddresses.length), this.networkName);
}

Wallet.prototype.getNextAddress = function() {
    return getAddress(this.externalAccount.deriveChild(this.addresses.length), this.networkName);
}

Wallet.prototype.exportPrivateKeys = function() {
    if (this.unspents.length === 0) return '';
    var that = this;
    var network = bitcoin.networks[this.networkName];
    var lines = ['address,privatekey'];
    var exported = {};
    that.unspents.forEach(function(unspent) {
        if (exported[unspent.address]) return false;
        exported[unspent.address] = true;
        lines.push(unspent.address + ',' + that.getPrivateKeyForAddress(unspent.address).toWIF(network));
    });
    return lines.join('\n');
}

Wallet.prototype.getPrivateKeyForAddress = function(address) {
    var index
    var network = bitcoin.networks[this.networkName];
    if ((index = this.addresses.indexOf(address)) > -1) {
        return new bitcoin.ECPair(BigInteger.fromBuffer(this.externalAccount.deriveChild(index).privateKey), null, {
            network: network
        });
    } else if ((index = this.changeAddresses.indexOf(address)) > -1) {
        return new bitcoin.ECPair(BigInteger.fromBuffer(this.internalAccount.deriveChild(index).privateKey), null, {
            network: network
        });
    } else {
        throw new Error('Unknown address. Make sure the address is from the keychain and has been generated.')
    }
}

Wallet.prototype.createTx = function(to, value, fee, minConf, unspents) {
    if (typeof value === 'string') value = parseInt(value);
    if (typeof fee === 'string') fee = parseInt(fee);

    var network = bitcoin.networks[this.networkName]
    validate.preCreateTx(to, value, network)

    if (minConf == null) {
        minConf = this.minConf
    }

    var utxos = null
    if (unspents != null) {
        validate.utxos(unspents)
        utxos = unspents.filter(function(unspent) {
            return unspent.confirmations >= minConf
        })
    } else {
        utxos = getCandidateOutputs(this.unspents, minConf)
    }

    utxos = utxos.sort(function(o1, o2) {
        return o2.value - o1.value
    })

  var accum = 0
  var estimatedFee = 0
  var change = 0
  var subTotal = value
  var unspents = []

  var network = bitcoin.networks[this.networkName]
  var builder = new bitcoin.TransactionBuilder(network)
  builder.addOutput(to, value)

  var maxUnspents = network.maxUnspents
  var splitUnspents = []; var builders = []; var accums = []; var fees = [];
  var sumAccums; var sumFees

  var that = this
  utxos.some(function (unspent) {

        builder.addInput(unspent.txId, unspent.vout)
        unspents.push(unspent)

    if (fee == undefined || isNaN(fee)) {
      estimatedFee = estimateFeePadChangeOutput(builder.buildIncomplete(), network, network.feePerKb)
    } else {
      estimatedFee = fee
    }

    accum += unspent.value
    subTotal = value + estimatedFee
    if (value < network.dustSoftThreshold) {
      throw new Error('Transaction amount too small')
    } else if (unspents.length > maxUnspents) {
      /*
      Since number of UTXOs exceeds the maximum, will split it into
      many smaller transactions.
      What's different about this scenario is that there is a fee
      to be paid for each transaction.
      Keep adding utxos until the combined fees for all transactions
      are covered.
      */

      /* 
      idx: indices for unspents, how the transaction should be split.
      Example: idx = [0, 100, 200, 299]
      ^ Transaction is split at inputs 100 and 200, so the transactions become
      Transaction 1: inputs 0 to and excluding 100
      Transaction 2: inputs 100 to and excluding 200
      Transaction 3: inputs 200 to and including 299 (end of array)
      */
      var idx = getIdx(unspents.length, maxUnspents)
      builders = []; splitUnspents = []; accums = []; fees = []
      /*
      Inputs in unspents array are ordered from lowest to highest values, so
      shuffling will make it less likely that the first transaction doesn't even
      have enough value to cover the transaction fee.
      */
      var shuffledUnspents = shuffle(unspents)
      var finalIdx = idx.length - 2

      for (var i = 0; i <= finalIdx; i++) {
        /*
        If we're at the last interval (starting at idx.length-2), 
        we don't want to leave the last index out anymore.
        The last index is otherwise left out, because that's where we start
        in the next iteration of the for loop, and we don't want to reuse any unspents.
        */
        if (i == finalIdx) {
          var endIdx = idx[i + 1] + 1
        } else {
          var endIdx = idx[i + 1]
        }

        // Slice unspents corresponding to the indices in idx array
        var tempUnspents = shuffledUnspents.slice(idx[i], endIdx)
        // We use this array to sign the inputs later on
        splitUnspents.push(tempUnspents)
        // Accumulated value for inputs
        accums.push(utxoValues(tempUnspents))
        var splitBuilder = newBuilder(
          to, tempUnspents,
          new bitcoin.TransactionBuilder(network),
          that)
        /*
        When handling a large transaction that is split into many smaller ones,
        we can't determine the value to send before knowing the fee.
        And estimateFeePadChangeOutput requires there to be an output present.
        So we create a dummy output here, with an estimated fee.
        */
        var tmpBuilder = newBuilder(
          to, tempUnspents,
          new bitcoin.TransactionBuilder(network),
          that)
        var suspectedFee = (134 * tempUnspents.length + 34 + 10) * network.feePerKb / 1000
        // This is a dummy output. The output value doesn't matter.
        // We just don't want it to be negative.
        tmpBuilder.addOutput(to, Math.abs(accums[i] - suspectedFee))
        fees.push(
          estimateFeePadChangeOutput(
            tmpBuilder.buildIncomplete(), network, network.feePerKb)
        )

        if (accums[i] < fees[i]) {
          /*
          If a subtransaction can't afford its own transaction fee (accums[i]-fees[i]<0)
          then we continue with the for loop. The subtransaction will be missing from the
          builders array, but since we check for sumAccums >= subTotal anyway, this doesn't matter.
          That is: Either the builders array can't afford the transaction, or it can.
          It doesn't matter if this faulty subtransaction is missing or not.
          */
          continue
        }
        /*
        We don't know the value we're going to send in this particular transaction
        until we know the fee. That is because the value is not predetermined,
        it depends on the fee. So really, the value is accum minus fee
        for this particular subtransaction.
        */
        splitBuilder.addOutput(to, accums[i] - fees[i])
        builders.push(splitBuilder)
      }

      sumAccums = sum(accums); sumFees = sum(fees)
      subTotal = value + sumFees
      if (sumAccums >= subTotal) {
        change = sumAccums - subTotal
        if (change > network.dustSoftThreshold) {
          // The most valuable transaction handles the change
          builders[argmax(accums)].addOutput(that.getNextChangeAddress(), change)
        }
        return true
      }
    } else {
      if (accum >= subTotal) {
        change = accum - subTotal
        if (change > network.dustThreshold) {
          builder.addOutput(that.getNextChangeAddress(), change)
        }
        builders.push(builder)
        return true
      }
    }
  })


  if (this.networkName === 'bitcoincash') {
    var hashType = bitcoin.Transaction.SIGHASH_ALL | bitcoin.Transaction.SIGHASH_BITCOINCASHBIP143;
    builder.enableBitcoinCash(true)
    unspents.forEach(function (unspent, i) {
      builder.sign(i, that.getPrivateKeyForAddress(unspent.address), null, hashType, unspent.value)
    })
  } else if (unspents.length <= maxUnspents) {
    validate.postCreateTx(value, accum, this.getBalance(), estimatedFee)
    unspents.forEach(function (unspent, i) {
      builder.sign(i, that.getPrivateKeyForAddress(unspent.address))
    })
    builders[0] = builder.build()
  } else {
    validate.postCreateTx(value, sumAccums, that.getBalance(), sumFees)
    builders.forEach(function (builder, i) {
      if (accums[i] < network.dustSoftThreshold) {
        throw new error('Transaction amount too small. Your transaction was split into many parts, and one of them happened to be below the minimum value required.')
      }
      validate.postCreateTx(accums[i] - fees[i], accums[i], that.getBalance(), fees[i])
      splitUnspents[i].forEach(function (unspent, j) {
        builder.sign(j, that.getPrivateKeyForAddress(unspent.address))
      })
      builders[i] = builder.build()
    })
  }

  return builders
}

Wallet.prototype.estimateFees = function(to, value, feeRates, unspents) {
    if (typeof value !== 'number') value = parseInt(value);
    var network = bitcoin.networks[this.networkName]

    validate.preCreateTx(to, value, network)

  var minConf = this.minConf
  var maxUnspents = network.maxUnspents
  var utxos = null;
  if (unspents != null) {
    validate.utxos(unspents)
    utxos = unspents.filter(function (unspent) {
      return unspent.confirmations >= minConf
    })
  } else {
    unspents = []
    utxos = getCandidateOutputs(this.unspents, minConf)
  }
  utxos = utxos.sort(function (o1, o2) {
    return o2.value - o1.value
  })

  var subTotal = value
  var feeRatesArr = []; var sumFees;

  var that = this
  for (var k = 0; k < feeRates.length; k++) {
    var builder = new bitcoin.TransactionBuilder(network)
    builder.addOutput(to, value)

    var accum = 0
    var estimatedFee = 0
    utxos.some(function (unspent,n) {
      builder.addInput(unspent.txId, unspent.vout)
      unspents.push(unspent)

      var j = k
      if (feeRates == undefined) {
        estimatedFee = estimateFeePadChangeOutput(builder.buildIncomplete(), network, network.feePerKb)
      } else {
        estimatedFee = feeRates[j]
      }

      accum += unspent.value
      subTotal = value + estimatedFee
      if (unspents.length > maxUnspents) {
        /*
        Since number of UTXOs exceeds the maximum, will split it into
        many smaller transactions.
        What's different about this scenario is that there is a fee
        to be paid for each transaction.
        Keep adding utxos until the combined fees for all transactions
        are covered.
        */

        /* 
        idx: indices for unspents, how the transaction should be split.
        Example: idx = [0, 100, 200, 299]
        ^ Transaction is split at inputs 100 and 200, so the transactions become
        Transaction 1: inputs 0 to and excluding 100
        Transaction 2: inputs 100 to and excluding 200
        Transaction 3: inputs 200 to and including 299 (end of array)
        */
        var idx = getIdx(unspents.length, maxUnspents)
        var accums = []; var fees = []
        /*
        Inputs in unspents array are ordered from lowest to highest values, so
        shuffling will make it less likely that the first transaction doesn't even
        have enough value to cover the transaction fee.
        */
        var shuffledUTXO = shuffle(unspents)
        var finalIdx = idx.length - 2

        for (var i = 0; i <= finalIdx; i++) {
          /*
          If we're at the last interval (starting at idx.length-2), 
          we don't want to leave the last index out anymore.
          The last index is otherwise left out, because that's where we start
          in the next iteration of the for loop, and we don't want to reuse any unspents.
          */
          if (i == finalIdx) {
            var endIdx = idx[i + 1] + 1
          } else {
            var endIdx = idx[i + 1]
          }

          // Slice UTXOs corresponding to the indices in idx array
          var tempUnspents = shuffledUTXO.slice(idx[i], endIdx)
          // Accumulated value for inputs
          accums.push(utxoValues(tempUnspents))
          var tmpBuilder = newBuilder(
            to, tempUnspents,
            new bitcoin.TransactionBuilder(network),
            that)
          var suspectedFee = (134 * tempUnspents.length + 34 + 10) * network.feePerKb / 1000
          // This is a dummy output. The output value doesn't matter.
          // We just don't want it to be negative.
          tmpBuilder.addOutput(to, Math.abs(accums[i] - suspectedFee))
          fees.push(estimateFeePadChangeOutput(tmpBuilder.buildIncomplete(), network, network.feePerKb))
        }

        var sumAccums = sum(accums); var sumFees = sum(fees)
        subTotal = value + sumFees
        if (sumAccums >= subTotal) {
          feeRatesArr.push(sumFees)
          return true
        }
        // We've used all unspents and we still haven't reached subTotal.
        // User can't afford the transaction.
        if (unspents.length == utxos.length) {
          // To avoid returning an empty fee, push anyway:
          feeRatesArr.push(sumFees)
        }
      } else { // if unspents.length <= maxUnspents
        if (accum >= subTotal) {
          feeRatesArr.push(estimatedFee)
          return true
        }
        if (unspents.length == utxos.length) {
          feeRatesArr.push(estimatedFee)
        }
      }
    })
  }

  return feeRatesArr
}

Wallet.prototype.sendTx = function(tx, done) {
    var that = this
    this.api.transactions.propagate(tx.toHex(), function(err) {
        if (err) return done(err);
        that.processTx(tx, done)
    })
}

Wallet.prototype.processTx = function(tx, done) {
    var that = this
    var foundUsed = true
    while (foundUsed) {
        foundUsed = addToAddresses.bind(this)(this.getNextAddress(), this.getNextChangeAddress())
    }

    var allAddresses = that.addresses.concat(that.changeAddresses)

    fetchTransactions(that.api, allAddresses, [tx.getId()], function(err, historyTxs) {
        if (err) return done(err);

        var historyTx = historyTxs[0]

        that.balance += (historyTx.amount - historyTx.fees)
        historyTx.vin.forEach(function(input) {
            that.unspents = that.unspents.filter(function(unspent) {
                return unspent.txId !== input.txid
            })
        })
        that.historyTxs.unshift(historyTx)
        done(null, historyTx)
    })

    function addToAddresses(nextAddress, nextChangeAddress) {
        var found = tx.outs.some(function(out) {
            var address = bitcoin.address.fromOutputScript(out.script, bitcoin.networks[this.networkName]).toString()
            if (nextChangeAddress === address) {
                this.changeAddresses.push(address)
                return true
            } else if (nextAddress === address) {
                this.addresses.push(address)
                return true
            }
        }, this)

        if (found) return true
    }
}

Wallet.prototype.createPrivateKey = function(wif) {
    var network = bitcoin.networks[this.networkName];
    return bitcoin.ECPair.fromWIF(wif, network);
}

Wallet.prototype.createImportTx = function(options) {
    var network = bitcoin.networks[this.networkName];
    var builder = new bitcoin.TransactionBuilder(network);
    if (typeof options.fee === 'string') options.fee = parseInt(options.fee);
    var amount = options.amount - options.fee;
    if (amount < 0) {
        throw new Error('Insufficient funds');
    }
    options.unspents.forEach(function(unspent, i) {
        builder.addInput(unspent.txId, unspent.vout);
    });
    builder.addOutput(options.to, amount);

    if (this.networkName === 'bitcoincash') {
        var hashType = bitcoin.Transaction.SIGHASH_ALL | bitcoin.Transaction.SIGHASH_BITCOINCASHBIP143;
        builder.enableBitcoinCash(true)
        builder.inputs.forEach(function(input, i) {
            builder.sign(i, options.privateKey, null, hashType, options.unspents[i].value)
        })
    } else {
        builder.inputs.forEach(function(input, i) {
            builder.sign(i, options.privateKey);
        });
    }
    return builder.build();
}

Wallet.prototype.getImportTxOptions = function(privateKey) {
    var that = this;
    var network = bitcoin.networks[that.networkName];
    var address = privateKey.getAddress();
    return that.api.addresses.unspents([address]).then(function(unspents) {
        unspents = unspents.filter(function(unspent) {
            return unspent.confirmations >= that.minConf;
        });
        var amount = unspents.reduce(function(total, unspent) {
            return total += unspent.value;
        }, 0);
        return {
            privateKey: privateKey,
            unspents: unspents,
            amount: amount
        }
    });
}

function getCandidateOutputs(unspents, minConf) {
    return unspents.filter(function(unspent) {
        return unspent.confirmations >= minConf
    })
}

function estimateFeePadChangeOutput(tx, network, feePerKb) {
    var tmpTx = tx.clone()
    tmpTx.addOutput(tx.outs[0].script, network.dustSoftThreshold || 0)

    var baseFee = feePerKb / 1000
    var byteSize = tmpTx.ins.length * 148 + tmpTx.outs.length * 34 + 10

    var fee = baseFee * byteSize
    if (network.dustSoftThreshold === undefined) return fee

    tmpTx.outs.forEach(function(e) {
        if (e.value < network.dustSoftThreshold) {
            fee += feePerKb
        }
    })

    return parseInt(toAtom(Math.ceil(toUnit(fee))))
}


Wallet.prototype.getTransactionHistory = function() {
    return this.historyTxs.sort(function(a, b) {
        return a.confirmations - b.confirmations
    })
}

Wallet.prototype.serialize = function () {

    return JSON.stringify({
        externalAccount: this.externalAccount.privateExtendedKey,
        internalAccount: this.internalAccount.privateExtendedKey,
        addressIndex: this.addresses.length,
        changeAddressIndex: this.changeAddresses.length,
        networkName: this.networkName,
        balance: this.getBalance(),
        unspents: this.unspents,
        historyTxs: this.historyTxs,
        minConf: this.minConf
    })
}

Wallet.deserialize = function(json) {
    var wallet = new Wallet()
    var deserialized = JSON.parse(json)
    var network = bitcoin.networks[deserialized.networkName]
    wallet.externalAccount = HDKey.fromExtendedKey(deserialized.externalAccount, network.bip32)
    wallet.internalAccount = HDKey.fromExtendedKey(deserialized.internalAccount, network.bip32)
    wallet.addresses = deriveAddresses(wallet.externalAccount, network, deserialized.addressIndex)
    wallet.changeAddresses = deriveAddresses(wallet.internalAccount, network, deserialized.changeAddressIndex)
    wallet.networkName = deserialized.networkName
    wallet.api = getAPI(deserialized.networkName)
    wallet.balance = deserialized.balance
    wallet.unspents = deserialized.unspents
    wallet.historyTxs = deserialized.historyTxs
    wallet.minConf = deserialized.minConf

    return wallet
}

function getAddress(node, networkName) {
    var hash = bitcoin.crypto.hash160(node.publicKey);
    var pubKeyHash = bitcoin.networks[networkName].pubKeyHash;
    return bitcoin.address.toBase58Check(hash, pubKeyHash);
}

function deriveAddresses(account, network, untilId) {
    var addresses = []
    for (var i = 0; i < untilId; i++) {
        var hash = bitcoin.crypto.hash160(account.deriveChild(i).publicKey);
        var pubKeyHash = network.pubKeyHash;
        addresses.push(bitcoin.address.toBase58Check(hash, pubKeyHash))
    }
    return addresses
}

module.exports = Wallet
