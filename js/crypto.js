(function (global) {
  'use strict';

  var UINT32_RANGE = 4294967296;
  var MAX_BYTES_PER_CALL = 65536;

  function getCrypto() {
    var cryptoObject = global.crypto || global.msCrypto;
    if (!cryptoObject || typeof cryptoObject.getRandomValues !== 'function') {
      throw new Error('Tu navegador no dispone de crypto.getRandomValues(). No se pueden generar secretos seguros.');
    }
    return cryptoObject;
  }

  function assertInteger(value, name) {
    if (!Number.isInteger(value)) {
      throw new TypeError(name + ' debe ser un número entero.');
    }
  }

  function randomUint32() {
    var values = new Uint32Array(1);
    getCrypto().getRandomValues(values);
    return values[0];
  }

  function randomInt(maxExclusive) {
    assertInteger(maxExclusive, 'maxExclusive');
    if (maxExclusive < 1 || maxExclusive > UINT32_RANGE) {
      throw new RangeError('maxExclusive debe estar entre 1 y 4294967296.');
    }
    if (maxExclusive === 1) {
      return 0;
    }
    var limit = Math.floor(UINT32_RANGE / maxExclusive) * maxExclusive;
    var value;
    do {
      value = randomUint32();
    } while (value >= limit);
    return value % maxExclusive;
  }

  function randomBytes(length) {
    assertInteger(length, 'length');
    if (length < 0 || length > 1048576) {
      throw new RangeError('length debe estar entre 0 y 1048576.');
    }
    var bytes = new Uint8Array(length);
    for (var offset = 0; offset < length; offset += MAX_BYTES_PER_CALL) {
      var end = Math.min(offset + MAX_BYTES_PER_CALL, length);
      getCrypto().getRandomValues(bytes.subarray(offset, end));
    }
    return bytes;
  }

  function pick(items) {
    if (!items || typeof items.length !== 'number' || items.length === 0) {
      throw new Error('No hay elementos disponibles para elegir.');
    }
    return items[randomInt(items.length)];
  }

  function shuffle(items) {
    var copy = Array.prototype.slice.call(items);
    for (var index = copy.length - 1; index > 0; index -= 1) {
      var swapIndex = randomInt(index + 1);
      var temporary = copy[index];
      copy[index] = copy[swapIndex];
      copy[swapIndex] = temporary;
    }
    return copy;
  }

  function bytesToHex(bytes) {
    var hex = '';
    for (var index = 0; index < bytes.length; index += 1) {
      hex += bytes[index].toString(16).padStart(2, '0');
    }
    return hex;
  }

  global.SecureRandom = {
    randomInt: randomInt,
    randomBytes: randomBytes,
    pick: pick,
    shuffle: shuffle,
    bytesToHex: bytesToHex,
    isAvailable: function () {
      try {
        getCrypto();
        return true;
      } catch (error) {
        return false;
      }
    }
  };
})(window);
