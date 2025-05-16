/**
 * Returns an array of indices.
 * The indices are the cut-off points for the split transaction.
 * That is: If the original transaction had 600 UTXOs lined up,
 * and the maximum number of transactions is 200, then the returned
 * array would be:
 *    idx = [0, 200, 400, 599]
 * So the new transactions would contain inputs
 * Transaction 1: inputs 0 to and excluding 200,
 * Transaction 2: inputs 200 to and excluding 400,
 * Transaction 3. inputs 400 to and including 599 (end of array).
 * @param {*} nUTXO The number of transactions
 * @param {*} maxUnspents Maximum number of unspents
 */
function getIdx(nUTXO, maxUnspents) {
  if (nUTXO <= maxUnspents 
  || nUTXO <= 1
  || maxUnspents <= 1) 
    return -1
  var divide;
  /*
  We are after the smallest possible natural number
  of subintervals of the UTXO list, which puts each interval
  at length of maxUnspents or less.
  */
  for (i = 2; i <= nUTXO; i++) {
    // divide is the length of each interval
    divide = Math.ceil(nUTXO / i)
    if (divide <= maxUnspents) {
      // k is the number of intervals
      var k = i
      break
    }
  }
  var idx = []
  /*
  Construct index array by multiplying interval index (j)
  by the length of each interval (divide).
  Up to and excluding k.
  */
  for (j = 0; j < k; j++) {
    idx.push(j*divide)
  }
  /*
  Push end of array. The last transaction might have a 
  slightly different number of inputs than the rest, 
  because of the use of the ceil() function above.
  */
  if (idx[idx.length-1] != nUTXO-1)
    idx.push(nUTXO-1)
  /*
  The intervals are roughly equal in length.
  This is to decrease the chance of a small interval not having
  enough value to pay for its own transaction fee.
  */
  return idx
}

function newBuilder(to, unspents, builder, that) {
  unspents.forEach(function(unspent, i) {
    builder.addInput(unspent.txId, unspent.vout)
  })
  return builder
}
  
function utxoValues(unspents) {
  var accum = 0
  unspents.forEach(function(unspent) {
    accum += unspent.value
  })
  return accum
}

/**
 * Shuffles the LAST element of the input array with some other element in the array.
 * @param {*} array the array to shuffle
 */
function shuffle(array) {
  var tmpArray = array
  // We only need to swap the last element with some other, since the others have already been shuffled.
  for (let i = tmpArray.length - 1; i > tmpArray.length - 2; i--) {
    let j = Math.floor(Math.random() * (i + 1)); // random index from 0 to i

    // swap elements array[i] and array[j]
    // we use "destructuring assignment" syntax to achieve that
    // let t = array[i]; array[i] = array[j]; array[j] = t
    [tmpArray[i], tmpArray[j]] = [tmpArray[j], tmpArray[i]];
  }
  return tmpArray
}

function argmax(arr) {
  if (arr.length === 0) {
    return -1;
  }

  var max = arr[0];
  var maxIndex = 0;

  for (var i = 1; i < arr.length; i++) {
    if (arr[i] > max) {
      maxIndex = i;
      max = arr[i];
    }
  }

  return maxIndex;
}

module.exports = {
  getIdx: getIdx,
  newBuilder: newBuilder,
  utxoValues: utxoValues,
  shuffle: shuffle,
  argmax: argmax
}
