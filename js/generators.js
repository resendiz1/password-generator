(function (global) {
  'use strict';

  var random = global.SecureRandom;

  var PASSWORD_SETS = {
    upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    lower: 'abcdefghijklmnopqrstuvwxyz',
    digits: '0123456789',
    symbols: '!@#$%^&*()-_=+[]{};:,.?/|~'
  };
  var SET_ORDER = ['upper', 'lower', 'digits', 'symbols'];
  var AMBIGUOUS = ['O', '0', 'l', 'I'];

  function assertIntegerInRange(value, minimum, maximum, label) {
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
      throw new RangeError(label + ' debe ser un número entero entre ' + minimum + ' y ' + maximum + '.');
    }
  }

  function uniqueCharacters(value) {
    return Array.from(new Set(Array.from(value)));
  }

  function filterAmbiguous(characters) {
    return characters.filter(function (character) {
      return AMBIGUOUS.indexOf(character) === -1;
    });
  }

  function entropyForPool(length, poolSize) {
    if (length <= 0 || poolSize <= 1) {
      return 0;
    }
    return length * (Math.log(poolSize) / Math.LN2);
  }

  function strengthFromEntropy(bits) {
    if (!Number.isFinite(bits) || bits <= 0) {
      return { label: 'Sin datos', className: 'bg-secondary', percent: 0 };
    }
    if (bits < 28) {
      return { label: 'Muy débil', className: 'bg-danger', percent: Math.max(6, Math.round((bits / 128) * 100)) };
    }
    if (bits < 50) {
      return { label: 'Débil', className: 'bg-danger', percent: Math.round((bits / 128) * 100) };
    }
    if (bits < 70) {
      return { label: 'Aceptable', className: 'bg-warning', percent: Math.round((bits / 128) * 100) };
    }
    if (bits < 100) {
      return { label: 'Fuerte', className: 'bg-success', percent: Math.round((bits / 128) * 100) };
    }
    return { label: 'Excelente', className: 'bg-success', percent: 100 };
  }

  function uuidV4() {
    var bytes = random.randomBytes(16);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    var hex = random.bytesToHex(bytes);
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20, 32);
  }

  function uuidBatch(count) {
    assertIntegerInRange(count, 1, 10000, 'La cantidad de UUID');
    var unique = new Set();
    var attempts = 0;
    var maximumAttempts = count * 100 + 1000;
    while (unique.size < count) {
      unique.add(uuidV4());
      attempts += 1;
      if (attempts > maximumAttempts) {
        throw new Error('No se pudo completar el lote sin duplicados. Inténtalo de nuevo.');
      }
    }
    return Array.from(unique).map(function (value) {
      return { value: value, entropy: 122 };
    });
  }

  function validatePasswordOptions(options) {
    assertIntegerInRange(options.length, 8, 128, 'La longitud');
    if (!Array.isArray(options.sets) || options.sets.length === 0) {
      throw new Error('Selecciona al menos un tipo de carácter.');
    }
    options.sets.forEach(function (setName) {
      if (SET_ORDER.indexOf(setName) === -1) {
        throw new Error('Tipo de carácter no válido: ' + setName + '.');
      }
    });
    if (options.length < options.sets.length) {
      throw new Error('La longitud debe ser igual o mayor que el número de tipos seleccionados.');
    }
  }

  function buildPasswordPool(sets, excludeAmbiguous) {
    var pool = [];
    var required = [];
    sets.forEach(function (setName) {
      var characters = uniqueCharacters(PASSWORD_SETS[setName]);
      if (excludeAmbiguous) {
        characters = filterAmbiguous(characters);
      }
      if (characters.length === 0) {
        throw new Error('El conjunto seleccionado se queda sin caracteres al excluir los ambiguos.');
      }
      required.push(characters);
      pool = pool.concat(characters);
    });
    return { pool: uniqueCharacters(pool.join('')), required: required };
  }

  function password(options) {
    validatePasswordOptions(options);
    var poolData = buildPasswordPool(options.sets, Boolean(options.excludeAmbiguous));
    var characters = poolData.required.map(function (setCharacters) {
      return random.pick(setCharacters);
    });
    while (characters.length < options.length) {
      characters.push(random.pick(poolData.pool));
    }
    var value = random.shuffle(characters).join('');
    return { value: value, entropy: entropyForPool(options.length, poolData.pool.length) };
  }

  function passwordBatch(options, count) {
    assertIntegerInRange(count, 1, 100, 'La cantidad de contraseñas');
    validatePasswordOptions(options);
    var results = [];
    for (var index = 0; index < count; index += 1) {
      results.push(password(options));
    }
    return results;
  }

  function validatePassphraseOptions(options) {
    assertIntegerInRange(options.words, 3, 12, 'El número de palabras');
    if (typeof options.separator !== 'string' || options.separator.length > 5) {
      throw new Error('El separador no es válido.');
    }
    if (!Array.isArray(global.Wordlist) || global.Wordlist.length < 2) {
      throw new Error('La lista de palabras no está disponible.');
    }
  }

  function passphrase(options) {
    validatePassphraseOptions(options);
    var selected = [];
    for (var index = 0; index < options.words; index += 1) {
      var word = random.pick(global.Wordlist);
      if (options.capitalize) {
        word = word.charAt(0).toUpperCase() + word.slice(1);
      }
      selected.push(word);
    }
    var value = selected.join(options.separator);
    var entropy = options.words * (Math.log(global.Wordlist.length) / Math.LN2);
    if (options.includeNumber) {
      value += options.separator + String(random.randomInt(100)).padStart(2, '0');
      entropy += Math.log(100) / Math.LN2;
    }
    if (options.capitalize) {
      entropy += options.words;
    }
    return { value: value, entropy: entropy };
  }

  function passphraseBatch(options, count) {
    assertIntegerInRange(count, 1, 100, 'La cantidad de frases');
    validatePassphraseOptions(options);
    var results = [];
    for (var index = 0; index < count; index += 1) {
      results.push(passphrase(options));
    }
    return results;
  }

  function hexToken(length) {
    assertIntegerInRange(length, 8, 256, 'La longitud hexadecimal');
    if (length % 2 !== 0) {
      throw new RangeError('La longitud hexadecimal debe ser un número par.');
    }
    var value = random.bytesToHex(random.randomBytes(length / 2));
    return { value: value, entropy: length * 4 };
  }

  function hexTokenBatch(length, count) {
    assertIntegerInRange(count, 1, 100, 'La cantidad de tokens');
    var results = [];
    for (var index = 0; index < count; index += 1) {
      results.push(hexToken(length));
    }
    return results;
  }

  function base64Token(byteCount) {
    assertIntegerInRange(byteCount, 8, 128, 'La cantidad de bytes');
    var bytes = random.randomBytes(byteCount);
    var binary = '';
    for (var index = 0; index < bytes.length; index += 1) {
      binary += String.fromCharCode(bytes[index]);
    }
    return { value: global.btoa(binary), entropy: byteCount * 8 };
  }

  function base64TokenBatch(byteCount, count) {
    assertIntegerInRange(count, 1, 100, 'La cantidad de tokens');
    var results = [];
    for (var index = 0; index < count; index += 1) {
      results.push(base64Token(byteCount));
    }
    return results;
  }

  function customToken(alphabet, length) {
    if (typeof alphabet !== 'string') {
      throw new Error('El alfabeto no es válido.');
    }
    var characters = uniqueCharacters(alphabet);
    if (characters.length < 2) {
      throw new Error('El alfabeto debe contener al menos 2 caracteres distintos.');
    }
    assertIntegerInRange(length, 1, 256, 'La longitud personalizada');
    var output = '';
    for (var index = 0; index < length; index += 1) {
      output += random.pick(characters);
    }
    return { value: output, entropy: entropyForPool(length, characters.length) };
  }

  function customTokenBatch(alphabet, length, count) {
    assertIntegerInRange(count, 1, 100, 'La cantidad de tokens');
    var results = [];
    for (var index = 0; index < count; index += 1) {
      results.push(customToken(alphabet, length));
    }
    return results;
  }

  function analyzePassword(value) {
    var text = typeof value === 'string' ? value : '';
    var characters = Array.from(text);
    var length = characters.length;
    var upper = (text.match(/[A-Z]/g) || []).length;
    var lower = (text.match(/[a-z]/g) || []).length;
    var digits = (text.match(/[0-9]/g) || []).length;
    var symbols = length - upper - lower - digits;
    var unique = new Set(characters).size;
    var poolSize = 0;
    if (lower > 0) {
      poolSize += 26;
    }
    if (upper > 0) {
      poolSize += 26;
    }
    if (digits > 0) {
      poolSize += 10;
    }
    if (symbols > 0) {
      poolSize += 32;
    }
    var entropy = entropyForPool(length, poolSize);
    return {
      length: length,
      upper: upper,
      lower: lower,
      digits: digits,
      symbols: symbols,
      unique: unique,
      entropy: entropy,
      strength: strengthFromEntropy(entropy),
      requirements: {
        length8: length >= 8,
        length12: length >= 12,
        upper: upper > 0,
        lower: lower > 0,
        digit: digits > 0,
        symbol: symbols > 0,
        unique: length > 0 && unique >= Math.ceil(length * 0.5)
      }
    };
  }

  global.Generators = {
    PASSWORD_SETS: PASSWORD_SETS,
    AMBIGUOUS: AMBIGUOUS,
    uuidV4: uuidV4,
    uuidBatch: uuidBatch,
    password: password,
    passwordBatch: passwordBatch,
    passphrase: passphrase,
    passphraseBatch: passphraseBatch,
    hexToken: hexToken,
    hexTokenBatch: hexTokenBatch,
    base64Token: base64Token,
    base64TokenBatch: base64TokenBatch,
    customToken: customToken,
    customTokenBatch: customTokenBatch,
    analyzePassword: analyzePassword,
    strengthFromEntropy: strengthFromEntropy
  };
})(window);
