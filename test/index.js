var assert = require('assert')
var API = require('cs-insight')
var sinon = require('sinon')
var async = require('async')
var bitcoin = require('bitcoinjs-lib')
var Transaction = bitcoin.Transaction
var TransactionBuilder = bitcoin.TransactionBuilder
var HDNode = bitcoin.HDNode
var Address = bitcoin.address
var testnet = bitcoin.networks.testnet
var fixtures = require('./wallet')
var addressFixtures = require('./addresses')
var transactionsFixtures = require('./transactions')
var balanceFixtures = require('./balance')
var history = require('./history')
var rewire = require('rewire')
var Wallet = require('../')
var wif = require('wif')
var BigInteger = require('bigi')

var noop = function() {}

describe('Common Blockchain Wallet', function() {
  var externalAccount
  var internalAccount

  before(function() {
    externalAccount = "tprv8eTJwLvUafTQT1irF54EtaYbzakkbvDaAiP3FfHzpfLiamKqGSJDzG2pQfXQDWVWmmHhM3ERRdeG7V2b7aYNZWKy8UYNQL511sWZuUNNBNR"
    internalAccount = "tprv8eTJwLvUafTQVZgNArJSWQgwu6vtBgEzB9LACG4GPhwofFCSaCMzqj5eYqmZ1qmTJVmsa82EfUqkdpUtMmnKp5RJaUdc1KCjzSUc3nRsoXf"
  })

  describe('process env', function() {
    it('should setup wrapper api url by process env (bitcoin)', function(done) {
      process.env.API_BTC_URL = 'hello-world'
      var wallet = new Wallet({
        externalAccount: externalAccount,
        internalAccount: internalAccount,
        networkName: 'bitcoin',
        done: function() {
          done()
        }
      })
      process.env.API_BTC_URL = undefined
      assert.equal(wallet.api.apiURL, 'hello-world')
    })

    it('should setup wrapper api url by process env (litecoin)', function(done) {
      process.env.API_LTC_URL = 'hello-lite-world'
      var wallet = new Wallet({
        externalAccount: externalAccount,
        internalAccount: internalAccount,
        networkName: 'litecoin',
        done: function() {
          done()
        }
      })
      process.env.API_LTC_URL = undefined
      assert.equal(wallet.api.apiURL, 'hello-lite-world')
    })

    it('should setup insight API wrapper', function(done) {
      this.timeout(100000)
      var wallet = new Wallet({
        externalAccount: externalAccount,
        internalAccount: internalAccount,
        networkName: 'testnet',
        done: function() {
          done()
        }
      })
      assert(wallet.api instanceof require('cs-insight'))
    })
  })

  describe.skip('network dependent tests', function() {
    this.timeout(100000)
    var wallet
    var addresses = ["n2DTZtbDbNAX315g3vtUdLKLWeAGtLUKd5","n3Ry7ra8hFmhPWdFJJNY5YBFNyED8T2F6L","mjuRrrDwYY4qfK5Cea3PcaqE1Wix7ieBWM"]
    var changeAddresses = ['mk1iSBkdVGkj4rHsgvnNj78sViw8Pq2KBY', 'n4QqWKg6kzgDGtLybDcHCMVPLZuJgT3MZr', 'mk3vi2jCLzzxCUMxvrgL2zumS3CQGedWqN', 'mhoDWJcxYfmKAu57trrhaG9uHWPx5q8W9z', 'mqsxmdRAZ52UUbmrsovDvLuAmFxyXFiaE5', 'mtmw3orgdjNhCJSCCVMLFMf38txz6CzHB9', 'n38DfSrxRr9BoydsXt6NpQDUWAhZCoGWkb', 'muAYGwrAkM4iAAWyGWt9bvat6hGiYAaN1t']

    before(function(done) {
      wallet = new Wallet({
        externalAccount: externalAccount,
        internalAccount: internalAccount,
        networkName: 'testnet',
        done: done
      })
    })

    describe('constructor', function() {
      it('returns error when externalAccount and internalAccount are missing', function(done) {
        new Wallet({
          networkName: 'testnet',
          done: function(err) {
            assert(err)
            done()
          }
        })
      })

      it('accepts externalAccount and internalAccount as objects', function() {
        new Wallet({
          externalAccount: HDNode.fromBase58(externalAccount),
          internalAccount: HDNode.fromBase58(internalAccount),
          networkName: 'testnet',
          done: function(err, w) {
            assert.ifError(err)
            assert.equal(w.externalAccount.toBase58(), externalAccount)
            assert.equal(w.internalAccount.toBase58(), internalAccount)
          }
        })
      })

      describe('wallet properties', function() {
        it('initializes a txGraph', function() {
          assert(wallet.txGraph)
          assert.equal(wallet.txGraph.heads.length, 1)
        })

        it('assigns externalAccount and internalAccount', function() {
          assert.equal(wallet.externalAccount.toBase58(), externalAccount)
          assert.equal(wallet.internalAccount.toBase58(), internalAccount)
        })

        it('assigns addresses and changeAddresses', function() {
          assert.deepEqual(wallet.addresses, addresses)
          assert.deepEqual(wallet.changeAddresses, changeAddresses)
        })

        it('assigns networkName', function() {
          assert.equal(wallet.networkName, 'testnet')
        })

        it('assigns api', function() {
          assert(wallet.api instanceof API)
          assert.equal(wallet.api.getProxyURL(), undefined)
        })

        it('api uses a proxy url passed in as an environment variable (blockr)', function(done) {
          var url = 'https://proxy.coin.space/?url='
          process.env.INSIGHT_PROXY_URL = url
          var wallet = new Wallet({
            externalAccount: externalAccount,
            internalAccount: internalAccount,
            networkName: 'testnet',
            done: function(err, w) {
              process.env.INSIGHT_PROXY_URL = undefined
              assert.ifError(err)

              assert.equal(wallet.api.getProxyURL(), url)
              done()
            }
          })
        })

        it('assigns txMetadata', function() {
          var txIds = wallet.txGraph.getAllNodes().filter(function(n) {
            return n.tx != null
          }).map(function(n) { return n.id })
          assert.deepEqual(Object.keys(wallet.txMetadata).sort(), txIds.sort())

          for(var key in wallet.txMetadata) {
            assert.equal(typeof wallet.txMetadata[key].confirmations, 'number')
            assert.equal(typeof wallet.txMetadata[key].timestamp, 'number')
          }
        })
      })
    })

    describe('serialization & deserialization', function() {
      it('works', function() {
        var parsed = Wallet.deserialize(wallet.serialize())

        assert.equal(parsed.txGraph.heads.length, wallet.txGraph.heads.length)
        assert.equal(parsed.txGraph.heads[0].id, wallet.txGraph.heads[0].id)
        assert.equal(parsed.externalAccount.toBase58(), wallet.externalAccount.toBase58())
        assert.equal(parsed.internalAccount.toBase58(), wallet.internalAccount.toBase58())
        assert.equal(parsed.addressIndex, wallet.addressIndex)
        assert.equal(parsed.changeAddressIndex, wallet.changeAddressIndex)
        assert.equal(parsed.networkName, wallet.networkName)
        assert.equal(typeof parsed.api, typeof wallet.api)
        assert.deepEqual(parsed.txMetadata, wallet.txMetadata)
      })
    })
  })

  describe('non-network dependent tests', function() {
    var readOnlyWallet
    var addresses = addressFixtures.addresses
    var changeAddresses = addressFixtures.changeAddresses
    var sandbox = sinon.sandbox.create();

    before(function() {
      // this should be treated as a convenient read-only wallet
      readOnlyWallet = Wallet.deserialize(JSON.stringify(fixtures))
    })

    afterEach(function(){
      sandbox.restore();
    })

    describe('getBalance', function() {
      it('works', function() {
        assert.equal(readOnlyWallet.getBalance(), 0)
      })

      it('calculates it correctly when one of the head transactions has value 0', function(done) {
        var myWallet = Wallet.deserialize(JSON.stringify(fixtures))

        sandbox.stub(myWallet.api.transactions, 'get').callsArgWith(2, null, [transactionsFixtures.fundedAddressZero])

        fundAddressZero(myWallet, function(err, fundingTx) {
          if (err) return done(err);

          myWallet.api.transactions.get.restore()
          sandbox.stub(myWallet.api.transactions, 'get').callsArgWith(2, null, [transactionsFixtures.fundedChangeAddress])

          var tx = new Transaction()
          tx.addInput(fundingTx.getHash(), 0)
          tx.addOutput(Address.toOutputScript(myWallet.changeAddresses[0], testnet), 200000)

          myWallet.processTx(tx, function(err) {
            if (err) return done(err);

            assert.equal(myWallet.getBalance(), 200000)
            done()
          })
        })
      })

      function fundAddressZero(wallet, done) {
        var tx = new Transaction()
        tx.addInput((new Transaction()).getHash(), 0)
        tx.addOutput(Address.toOutputScript(wallet.addresses[0], testnet), 200000)

        wallet.processTx(tx, function(err) {
          if (err) return done(err);
          done(null, tx)
        })
      }
    })

    describe('getNextAddress', function() {
      it('works', function() {
        assert.deepEqual(readOnlyWallet.getNextAddress(), 'mk9p4BPMSTK5C5zZ3Gf6mWZNtBQyC3RC7K')
      })
    })

    describe('getNextChangeAddress', function() {
      it('works', function() {
        assert.deepEqual(readOnlyWallet.getNextChangeAddress(), 'mrsMaRK7PNQt1i9sv11Dx8ZCE6aZxDKCyi')
      })
    })

    describe('getPrivateKeyForAddress', function(){
      it('returns the private key for the given address', function(){
        assert.equal(
          readOnlyWallet.getPrivateKeyForAddress(addresses[1]).toWIF(),
          wif.encode(testnet.wif, readOnlyWallet.externalAccount.deriveChild(1).privateKey, true)
        )
        assert.equal(
          readOnlyWallet.getPrivateKeyForAddress(changeAddresses[0]).toWIF(),
          wif.encode(testnet.wif, readOnlyWallet.internalAccount.deriveChild(0).privateKey, true)
        )
      })

      it('raises an error when address is not found', function(){
        assert.throws(function() {
          readOnlyWallet.getPrivateKeyForAddress(changeAddresses[changeAddresses.length])
        }, /Unknown address. Make sure the address is from the keychain and has been generated./)
      })
    })

    describe('processTx', function() {
      var tx, externalAddress, myWallet, nextAddress, nextChangeAddress

      before(function(done) {
        externalAddress = 'mh8evwuteapNy7QgSDWeUXTGvFb4mN1qvs'
        myWallet = Wallet.deserialize(JSON.stringify(fixtures))
        nextAddress = myWallet.getNextAddress()

        nextChangeAddress = myWallet.getNextChangeAddress()

        prevTx = new Transaction()
        prevTx.addInput((new Transaction()).getHash(), 0)
        prevTx.addOutput(Address.toOutputScript(nextAddress, testnet), 200000)

        tx = new Transaction()
        tx.addInput((new Transaction()).getHash(), 0)
        tx.addOutput(Address.toOutputScript(externalAddress, testnet), 50000)
        tx.addOutput(Address.toOutputScript(nextChangeAddress, testnet), 130000)

        sandbox.stub(myWallet.api.transactions, 'get').callsArgWith(2, null, [transactionsFixtures.fundedAddressZero])

        async.series([
          function(cb) { myWallet.processTx(prevTx, cb)},
          function(cb) { myWallet.processTx(tx, cb)}
        ], function(err) {
          myWallet.api.transactions.get.restore()
          done(err)
        })
      })

      describe('address derivation', function() {
        var myWalletSnapshot
        before(function() {
          myWalletSnapshot = myWallet.serialize()
        })

        after(function() {
          myWallet = Wallet.deserialize(myWalletSnapshot)
        })

        it('adds the next change address to changeAddresses if the it is used to receive funds', function() {
          assert.equal(myWallet.changeAddresses.indexOf(nextChangeAddress), myWallet.changeAddresses.length - 1)
        })

        it('adds the next address to addresses if the it is used to receive funds', function() {
          assert.equal(myWallet.addresses.indexOf(nextAddress), myWallet.addresses.length - 1)
        })

        it('does not add the same address more than once', function(done) {
          sandbox.stub(myWallet.api.transactions, 'get').callsArgWith(2, null, [transactionsFixtures.fundedAddressZero])
          var nextNextAddress = myWallet.getNextAddress()

          var aTx = new Transaction()
          aTx.addInput((new Transaction()).getHash(), 1)
          aTx.addOutput(Address.toOutputScript(myWallet.getNextAddress(), testnet), 200000)

          var bTx = new Transaction()
          bTx.addInput((new Transaction()).getHash(), 2)
          bTx.addOutput(Address.toOutputScript(myWallet.getNextAddress(), testnet), 200000)

          async.series([
            function(cb) { myWallet.processTx(aTx, cb)},
            function(cb) { myWallet.processTx(bTx, cb)}
          ], function(err) {
            if (err) return done(err);
            assert.equal(myWallet.addresses.indexOf(nextNextAddress), myWallet.addresses.length - 1)
            done()
          })
        })
      })
    })

    describe('getTransactionHistory', function() {
      var actualHistory
      before(function() {
        actualHistory = readOnlyWallet.getTransactionHistory()
      })

      it('returns the expected transactions in expected order', function() {
        var txIds = actualHistory.map(function(tx) {
          return tx.txId
        })

        var expectedIds = history.txs.map(function(tx) {
          return tx.id
        })

        assert.deepEqual(txIds, expectedIds)
      })

      it('returns the transactions with the expected values & fees', function() {
        var actual = actualHistory.map(function(tx) {
          return { id: tx.txId, fee: tx.fees, value: tx.amount }
        })

        var expected = history.txs.map(function(tx) {
          return { id: tx.id, fee: tx.fee, value: tx.value }
        })

        assert.deepEqual(actual, expected)
      })
    })

    describe('createTx', function() {
      var to, value

      before(function(){
        to = 'mh8evwuteapNy7QgSDWeUXTGvFb4mN1qvs'
        value = 500000
      })

      describe('with utxos passed in', function() {
        var utxos = [{
          txId: '98440fe7035aaec39583f68a251602a5623d34f95dbd9f54e7bc8ff29551729f',
          address: 'mwrRQPbo9Ck2BypSWT74vfG3kEE99Aungq',
          value: 400000,
          vout: 0,
          confirmations: 3
        }, {
          txId: '97bad8569bbd71f27b562b49cc65b5fa683e96c7912fac2f9d68e343a59d570e',
          address: 'mwrRQPbo9Ck2BypSWT74vfG3kEE99Aungq',
          value: 500000,
          vout: 0,
          confirmations: 2
        }, {
          txId: '7e6be25012e2ee3450b1435d5115d68a9be1cb376e094877df12a1508f003937',
          address: 'mkGgTrTSX5szqJf2xMUY6ab7LE5wVJvNYA',
          value: 510000,
          vout: 0,
          confirmations: 1
        }, {
          txId: 'a3fa16de242caaa97d69f2d285377a04847edbab4eec13e9ff083e14f77b71c8',
          address: 'mkGgTrTSX5szqJf2xMUY6ab7LE5wVJvNYA',
          value: 520000,
          vout: 0,
          confirmations: 0
        }]

        describe('transaction outputs', function(){
          it('includes the specified address and amount', function(){
            var tx = readOnlyWallet.createTx(to, value, null, null, utxos)

            assert.equal(tx.outs.length, 2)
            var out = tx.outs[0]
            var outAddress = Address.fromOutputScript(out.script, testnet)

            assert.equal(outAddress.toString(), to)
            assert.equal(out.value, value)
          })

          describe('change', function(){
            it('uses the next change address', function(){
              var fee = 0
              var tx = readOnlyWallet.createTx(to, value, fee, null, utxos)

              assert.equal(tx.outs.length, 2)
              var out = tx.outs[1]
              var outAddress = Address.fromOutputScript(out.script, testnet)

              assert.equal(outAddress.toString(), readOnlyWallet.getNextChangeAddress())
              assert.equal(out.value, 10000)
            })

            it('skips change if it is not above dust threshold', function(){
              var fee = 9454
              var tx = readOnlyWallet.createTx(to, value, fee, null, utxos)
              assert.equal(tx.outs.length, 1)
            })
          })
        })

        describe('choosing utxo', function(){
          it('takes fees into account', function(){
            var tx = readOnlyWallet.createTx(to, value, null, null, utxos)

            assert.equal(tx.ins.length, 1)
            hash = new Buffer(utxos[2].txId, 'hex').reverse();
            assert.deepEqual(tx.ins[0].hash, hash)
            assert.equal(tx.ins[0].index, 0)
          })

          it('respects specified minConf', function(){
            var tx = readOnlyWallet.createTx(to, value, null, 0, utxos)

            assert.equal(tx.ins.length, 1)
            hash = new Buffer(utxos[3].txId, 'hex').reverse();
            assert.deepEqual(tx.ins[0].hash, hash)
            assert.equal(tx.ins[0].index, 0)
          })
        })

        describe('validations', function(){
          it('errors on invalid utxos', function(){
            assert.throws(function() { readOnlyWallet.createTx(to, value, null, null, {}) })
          })
        })
      })

      describe('without utxos passed in', function() {
        var address1, address2, unspentTxs

        before(function(){
          unspentTxs = []

          address1 = readOnlyWallet.addresses[0]
          address2 = readOnlyWallet.changeAddresses[0]

          var pair0 = createTxPair(address1, 400000) // not enough for value
          unspentTxs.push(pair0.tx)

          var pair1 = createTxPair(address1, 500000) // not enough for only value
          unspentTxs.push(pair1.tx)

          var pair2 = createTxPair(address2, 510000) // enough for value and fee
          unspentTxs.push(pair2.tx)

          var pair3 = createTxPair(address2, 520000) // enough for value and fee
          unspentTxs.push(pair3.tx)

          function createTxPair(address, amount) {
            var prevTx = new Transaction()
            prevTx.addInput((new Transaction()).getHash(), 0)
            prevTx.addOutput(Address.toOutputScript(to, testnet), amount)

            var tx = new Transaction()
            tx.addInput(prevTx.getHash(), 0)
            tx.addOutput(Address.toOutputScript(address, testnet), amount)

            return { prevTx: prevTx, tx: tx }
          }
        })

        describe('transaction outputs', function(){
          it('includes the specified address and amount', function(){
            var tx = readOnlyWallet.createTx(to, value)

            assert.equal(tx.outs.length, 2)
            var out = tx.outs[0]
            var outAddress = Address.fromOutputScript(out.script, testnet)

            assert.equal(outAddress.toString(), to)
            assert.equal(out.value, value)
          })

          describe('change', function(){
            it('uses the next change address', function(){
              var fee = 0
              var tx = readOnlyWallet.createTx(to, value, fee)

              assert.equal(tx.outs.length, 2)
              var out = tx.outs[1]
              var outAddress = Address.fromOutputScript(out.script, testnet)

              assert.equal(outAddress.toString(), readOnlyWallet.getNextChangeAddress())
              assert.equal(out.value, 10000)
            })

            it('skips change if it is not above dust threshold', function(){
              var fee = 9454
              var tx = readOnlyWallet.createTx(to, value, fee)
              assert.equal(tx.outs.length, 1)
            })
          })
        })

        describe('choosing utxo', function(){
          it('takes fees into account', function(){
            var tx = readOnlyWallet.createTx(to, value)

            assert.equal(tx.ins.length, 1)
            assert.deepEqual(tx.ins[0].hash, unspentTxs[2].getHash())
            assert.equal(tx.ins[0].index, 0)
          })

          it('respects specified minConf', function(){
            var tx = readOnlyWallet.createTx(to, value, null, 0)

            assert.equal(tx.ins.length, 1)
            assert.deepEqual(tx.ins[0].hash, unspentTxs[3].getHash())
            assert.equal(tx.ins[0].index, 0)
          })
        })

        describe('transaction fee', function(){
          it('allows fee to be specified', function(){
            var fee = 30000
            var tx = readOnlyWallet.createTx(to, value, fee)

            assert.equal(getFee(tx), fee)
          })

          it('allows fee to be set to zero', function(){
            value = 510000
            var fee = 0
            var tx = readOnlyWallet.createTx(to, value, fee)

            assert.equal(getFee(tx), fee)
          })

          function getFee(tx) {
            var inputValue = tx.ins.reduce(function(memo, input){
              var id = Array.prototype.reverse.call(input.hash).toString('hex')
              var prevTx = unspentTxs.filter(function(t) {
                return t.getId() === id
              })[0]
              return memo + prevTx.outs[0].value
            }, 0)

            return tx.outs.reduce(function(memo, output){
              return memo - output.value
            }, inputValue)
          }
        })

        describe('signing', function(){
          it('signes the inputs with respective keys', function(){
            var fee = 30000
            sandbox.stub(TransactionBuilder.prototype, "sign")
            sandbox.stub(TransactionBuilder.prototype, "build")

            var tx = readOnlyWallet.createTx(to, value, fee)

            assert(TransactionBuilder.prototype.sign.calledWith(0, readOnlyWallet.getPrivateKeyForAddress(address2)))
            assert(TransactionBuilder.prototype.sign.calledWith(1, readOnlyWallet.getPrivateKeyForAddress(address1)))
            assert(TransactionBuilder.prototype.build.calledWith())
          })
        })

        describe('validations', function(){
          it('errors on invalid address', function(){
            assert.throws(function() { readOnlyWallet.createTx('123', value) })
          })

          it('errors on address with the wrong version', function(){
            assert.throws(function() { readOnlyWallet.createTx('LNjYu1akN22USK3sUrSuJn5WoLMKX5Az9B', value) })
          })

          it('errors on below dust value', function(){
            assert.throws(function() { readOnlyWallet.createTx(to, 546) })
          })

          it('errors on insufficient funds', function(){
            assert.throws(function() { readOnlyWallet.createTx(to, 1405001) })
          })
        })
      })

    })

    describe('estimateFees', function() {
      var address, to

      before(function(){
        readOnlyWallet = Wallet.deserialize(JSON.stringify(fixtures)) // reset wallet
        to = 'mh8evwuteapNy7QgSDWeUXTGvFb4mN1qvs'
      })

      it('calculates it correctly with single tx input', function() {
        assert.deepEqual(readOnlyWallet.estimateFees(to, 20000, [10000]), [2260])
      })

      it('calculates it correctly with multiple tx inputs', function() {
        assert.deepEqual(readOnlyWallet.estimateFees(to, 520000, [10000, 200000]), [3740, 74800])
      })

      it('calculates it correctly with utxos passed in', function() {
        var utxos = [{
          txId: '98440fe7035aaec39583f68a251602a5623d34f95dbd9f54e7bc8ff29551729f',
          address: 'mwrRQPbo9Ck2BypSWT74vfG3kEE99Aungq',
          value: 1520000,
          vout: 0,
          confirmations: 3
        }];
        assert.deepEqual(readOnlyWallet.estimateFees(to, 520000, [10000, 200000], utxos), [2260, 45200])
      })

      it('throws error when unspents are invalid', function() {
        assert.throws(function() {
          readOnlyWallet.estimateFees(to, 20000, [10000], 300);
        }, function(e) {
          assert.equal(e.message, 'Expect utxos to be an array');
          return true
        })
      })
    })

    describe('sendTx', function() {

      var tx = new Transaction()

      beforeEach(function(){
        sandbox.stub(Wallet.prototype, "processTx").callsArg(1)
      })

      it('propagates the transaction through the API', function(done) {
        sandbox.stub(readOnlyWallet.api.transactions, 'propagate').callsArg(1)

        readOnlyWallet.sendTx(tx, function(err) {
          assert.ifError(err)
          assert(readOnlyWallet.api.transactions.propagate.calledWith(tx.toHex()))
          done()
        })
      })

      it('processes the transaction on success', function(done) {
        sandbox.stub(readOnlyWallet.api.transactions, 'propagate').callsArg(1)

        readOnlyWallet.sendTx(tx, function(err) {
          assert.ifError(err)
          assert(Wallet.prototype.processTx.calledWith(tx))
          done()
        })
      })

      it('invokes callback with error on error', function(done) {
        var error = new Error('oops')
        sandbox.stub(readOnlyWallet.api.transactions, 'propagate').callsArgWith(1, error)

        readOnlyWallet.sendTx(tx, function(err) {
          assert.equal(err, error)
          done()
        })
      })
    })

    describe('createPrivateKey', function() {
      it('works', function() {
        var privateKey = readOnlyWallet.createPrivateKey('91tphZbASvHRsscCgB6TZibcSYwVNHzBX6xKvjFSMTNvzizaMyo')
        assert(privateKey instanceof bitcoin.ECPair)
      })
    })

    describe('createImportTx', function() {
      var options

      beforeEach(function() {
        var node = readOnlyWallet.internalAccount.deriveChild(0);
        var privateKey = new bitcoin.ECPair(BigInteger.fromBuffer(node.privateKey), null, {
          network: testnet
        })
        options = {
          privateKey: privateKey,
          unspents: [{
            txId: 'a3fa16de242caaa97d69f2d285377a04847edbab4eec13e9ff083e14f77b71c8',
            address: 'mkGgTrTSX5szqJf2xMUY6ab7LE5wVJvNYA',
            value: 10000,
            vout: 0,
            confirmations: 10
          }],
          amount: 10000,
          to: 'n4j3tshEMhXrgzmw8eCTqBujpdGWeVcpCD',
          fee: 1000
        }
      })

      it('works', function() {
        var tx = readOnlyWallet.createImportTx(options)
        assert(tx instanceof bitcoin.Transaction)
      })

      it('errors on amount less than fee', function() {
        options.fee = 20000
        assert.throws(function() { readOnlyWallet.createImportTx(options) })
      })

    })

    describe('getImportTxOptions', function() {
      it('works', function(done) {
        var unspents = [{
          txId: 'a3fa16de242caaa97d69f2d285377a04847edbab4eec13e9ff083e14f77b71c8',
          address: 'mkGgTrTSX5szqJf2xMUY6ab7LE5wVJvNYA',
          value: 10000,
          vout: 0,
          confirmations: 10
        },
        {
          txId: '7e6be25012e2ee3450b1435d5115d68a9be1cb376e094877df12a1508f003937',
          address: 'mkGgTrTSX5szqJf2xMUY6ab7LE5wVJvNYA',
          value: 10000,
          vout: 0,
          confirmations: 0
        }]
        sandbox.stub(readOnlyWallet.api.addresses, 'unspents').returns(Promise.resolve(unspents))

        var node = readOnlyWallet.internalAccount.deriveChild(0);
        var privateKey = new bitcoin.ECPair(BigInteger.fromBuffer(node.privateKey), null, {
          network: testnet
        })
        readOnlyWallet.getImportTxOptions(privateKey).then(function(options) {
          assert.equal(options.privateKey, privateKey)
          assert.equal(options.amount, 10000)
          assert.equal(options.unspents.length, 1)
          assert.deepEqual(options.unspents[0], unspents[0])
          done()
        }).catch(done)
      })
    })

    describe('exportPrivateKeys', function() {
      it('works', function() {
        var csv = readOnlyWallet.exportPrivateKeys();
        assert.equal(typeof csv, 'string');
      })

      it('errors on missing unspent address', function() {
        var myWallet = Wallet.deserialize(JSON.stringify(fixtures))
        myWallet.unspents.push('missing_address')
        assert.throws(function() {
          myWallet.exportPrivateKeys()
        }, /Unknown address. Make sure the address is from the keychain and has been generated./)
      })
    })

  })
})
