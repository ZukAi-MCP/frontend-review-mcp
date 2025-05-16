var assert = require('assert')
var validate = require('../lib/validator')
var networks = require('bitcoinjs-lib').networks

describe('validator', function(){
  describe('preCreateTx', function(){
    var network = networks.testnet

    describe('destination address validation', function(){
      var value = 1000

      it('catches invalid address', function(){
        assert.throws(function(){
          validate.preCreateTx('123', value, network)
        }, function(e) {
          assert.equal(e.message, 'Invalid address')
          assert.equal(e.details, 'Invalid checksum')
          return true
        })
      })

      it('catches address with the wrong version', function(){
        assert.throws(function(){
          validate.preCreateTx('LNjYu1akN22USK3sUrSuJn5WoLMKX5Az9B', value, network)
        }, function(e) {
          assert.equal(e.message, 'Invalid address')
          assert.equal(e.details, 'Invalid address version prefix')
          return true
        })
      })

      it('allows valid pubKeyHash address', function(){
        assert.doesNotThrow(function() {
          validate.preCreateTx('mmGUSgaP7E8ig34MG2w1HzVjgwbqJoRQQu', value, network)
        })
      })

      it('allows valid p2sh address', function(){
        assert.doesNotThrow(function() {
          validate.preCreateTx('2MvR3wixpB1usCNRugN6ufwxfT4GEFxoRhQ', value, network)
        })
      })
    })

    describe('when value is below dust threshold', function(){
      it('throws an error', function(){
        assert.throws(function() {
          validate.preCreateTx('mmGUSgaP7E8ig34MG2w1HzVjgwbqJoRQQu', 546, network)
        }, function(e) {
          assert.equal(e.message, "Invalid value")
          assert.equal(e.details, "Not above dust threshold")
          assert.equal(e.dustThreshold, 546)
          return true
        })
      })
    })
  })

  describe('postCreateTx', function(){
    describe('when there is not enough money', function(){
      it('throws an error', function(){
        assert.throws(function() {
          validate.postCreateTx(1420000, 1410000, 1410000, 2260)
        }, function(e) {
          assert.equal(e.message, "Insufficient funds")
          assert.equal(e.details, null)
          return true
        })
      })

      it('when the total balance including zero conf is enough to meet the amount, it populates the error details field', function(){
        assert.throws(function() {
          validate.postCreateTx(1410001, 1410000, 1420001, 2260)
        }, function(e) {
          assert.equal(e.message, "Insufficient funds")
          assert.equal(e.details, "Additional funds confirmation pending")
          return true
        })
      })

      it('when value is close to unconfirmed balance, it populates the error details field', function(){
        assert.throws(function() {
          validate.postCreateTx(1420000, 1410000, 1420001, 2260)
        }, function(e) {
          assert.equal(e.message, "Insufficient funds")
          assert.equal(e.details, "Attempt to empty wallet")
          return true
        })
      })
    })
  })

  describe('utxos', function(){
    it('throws an error when it is not an array', function(){
      assert.throws(function() { validate.utxos({}) })
      assert.throws(function() { validate.utxos(1) })
      assert.throws(function() { validate.utxos('foobar') })
    });

    ['txId', 'address', 'value', 'vout', 'confirmations'].forEach(function(field){
      describe('when ' + field + ' is missing', function(){
        it('throws an error', function(){
          assert.throws(function() {
            var utxo = getUtxo()
            delete utxo[field]
            validate.utxos([utxo])
          }, function(e) {
            var expectedMessage = field + " field"
            assert(e.message.indexOf(expectedMessage) > 0,
              "expect error message to contain: " + expectedMessage + ", but got: " + e.message)
            return true
          })
        })
      })
    })

    function getUtxo() {
      return {
        txId: '121954538a10eb7a59e319745b97302c2cf6ce1e159fe0de17f6038963a68fac',
        address: '1Ao9jfhQgsfHT97qsQ3GDnQ9czJnFaXNyw',
        value: 378340414,
        vout: 0
      }
    }
  })
})
