(function (global) {
  'use strict';

  var MAX_HISTORY = 100;
  var TOOL_KEYS = ['uuid', 'password', 'passphrase', 'token'];
  var SECRET_KEYS = ['password', 'passphrase', 'token'];
  var COPY_NOUNS = {
    uuid: 'UUID',
    password: 'contraseñas',
    passphrase: 'frases',
    token: 'tokens'
  };

  var state = {
    tools: {
      uuid: { items: [], options: null, generatedAt: null, label: 'UUID v4', fileBase: 'uuid', revealed: true },
      password: { items: [], options: null, generatedAt: null, label: 'Contraseñas', fileBase: 'contrasenas', revealed: true },
      passphrase: { items: [], options: null, generatedAt: null, label: 'Frases de contraseña', fileBase: 'frases', revealed: true },
      token: { items: [], options: null, generatedAt: null, label: 'Tokens', fileBase: 'tokens', revealed: true }
    },
    history: [],
    historySequence: 0
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function createElement(tag, className, text) {
    var element = document.createElement(tag);
    if (className) {
      element.className = className;
    }
    if (text !== undefined) {
      element.textContent = text;
    }
    return element;
  }

  function clearChildren(element) {
    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }
  }

  function setHidden(element, hidden) {
    element.classList.toggle('d-none', hidden);
  }

  function formatTimestamp(iso) {
    if (!iso) {
      return '';
    }
    var date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return iso;
    }
    return date.toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  function maskValue(value) {
    var length = Array.from(value).length;
    return '\u2022'.repeat(Math.min(length, 40));
  }

  function strengthBadge(entropy) {
    var strength = global.Generators.strengthFromEntropy(entropy);
    return {
      badge: createElement('span', 'badge ' + strength.className, strength.label),
      strength: strength
    };
  }

  function showToast(message, variant) {
    var container = byId('toastContainer');
    if (!container) {
      return;
    }
    var type = variant || 'success';
    var toastElement = createElement('div', 'toast align-items-center border-0 text-bg-' + type);
    toastElement.setAttribute('role', type === 'danger' ? 'alert' : 'status');
    toastElement.setAttribute('aria-live', type === 'danger' ? 'assertive' : 'polite');
    toastElement.setAttribute('aria-atomic', 'true');
    var wrapper = createElement('div', 'd-flex');
    var body = createElement('div', 'toast-body', message);
    var close = createElement('button', 'btn-close me-2 m-auto' + (type === 'warning' ? '' : ' btn-close-white'));
    close.type = 'button';
    close.setAttribute('data-bs-dismiss', 'toast');
    close.setAttribute('aria-label', 'Cerrar notificación');
    wrapper.appendChild(body);
    wrapper.appendChild(close);
    toastElement.appendChild(wrapper);
    container.appendChild(toastElement);
    if (global.bootstrap && global.bootstrap.Toast) {
      var toast = new global.bootstrap.Toast(toastElement, { delay: 2600, autohide: true });
      toastElement.addEventListener('hidden.bs.toast', function () {
        toastElement.remove();
      });
      toast.show();
    } else {
      global.setTimeout(function () {
        toastElement.remove();
      }, 2600);
    }
  }

  function fallbackCopy(text) {
    return new Promise(function (resolve, reject) {
      var textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.top = '-9999px';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      var copied = false;
      try {
        copied = document.execCommand('copy');
      } catch (error) {
        copied = false;
      }
      textarea.remove();
      if (copied) {
        resolve();
      } else {
        reject(new Error('No se pudo copiar.'));
      }
    });
  }

  function copyText(text, successMessage) {
    if (typeof text !== 'string' || text.length === 0) {
      showToast('No hay nada que copiar.', 'warning');
      return Promise.resolve(false);
    }
    var clipboardAttempt;
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function' && global.isSecureContext) {
      clipboardAttempt = navigator.clipboard.writeText(text);
    } else {
      clipboardAttempt = Promise.reject(new Error('Portapapeles no disponible.'));
    }
    return clipboardAttempt.then(function () {
      showToast(successMessage || 'Copiado al portapapeles.', 'success');
      return true;
    }).catch(function () {
      return fallbackCopy(text).then(function () {
        showToast(successMessage || 'Copiado al portapapeles.', 'success');
        return true;
      }).catch(function () {
        showToast('No se pudo copiar al portapapeles.', 'danger');
        return false;
      });
    });
  }

  function setFieldError(input, feedback, message) {
    if (input) {
      input.classList.add('is-invalid');
      input.setAttribute('aria-invalid', 'true');
    }
    if (feedback) {
      feedback.textContent = message;
    }
  }

  function clearFieldError(input, feedback) {
    if (input) {
      input.classList.remove('is-invalid');
      input.removeAttribute('aria-invalid');
    }
    if (feedback) {
      feedback.textContent = '';
    }
  }

  function readInteger(input, minimum, maximum, label, feedback) {
    clearFieldError(input, feedback);
    var raw = String(input.value).trim();
    var value = Number(raw);
    if (raw === '' || !Number.isInteger(value) || value < minimum || value > maximum) {
      setFieldError(input, feedback, label + ' debe ser un número entero entre ' + minimum + ' y ' + maximum + '.');
      return null;
    }
    return value;
  }

  function bindClearOnInput(inputId, feedbackId) {
    var input = byId(inputId);
    var feedback = byId(feedbackId);
    if (!input) {
      return;
    }
    input.addEventListener('input', function () {
      clearFieldError(input, feedback);
    });
    input.addEventListener('change', function () {
      clearFieldError(input, feedback);
    });
  }

  function addHistory(toolKey, items) {
    var tool = state.tools[toolKey];
    if (!items.length) {
      return;
    }
    var entries = items.map(function (item) {
      state.historySequence += 1;
      return {
        id: state.historySequence,
        tool: toolKey,
        label: tool.label,
        value: item.value,
        entropy: item.entropy,
        generatedAt: tool.generatedAt,
        revealed: false
      };
    });
    state.history = entries.concat(state.history).slice(0, MAX_HISTORY);
    renderHistory();
  }

  function setToolResults(toolKey, results, options, label, fileBase) {
    var tool = state.tools[toolKey];
    var keepRevealed = tool.revealed !== false;
    tool.items = results.map(function (result) {
      return {
        value: result.value,
        entropy: result.entropy,
        revealed: keepRevealed
      };
    });
    tool.options = options;
    tool.label = label;
    tool.fileBase = fileBase;
    tool.generatedAt = new Date().toISOString();
    renderTool(toolKey);
    addHistory(toolKey, tool.items);
  }

  function updateCountBadge(id, count) {
    var badge = byId(id);
    if (badge) {
      badge.textContent = String(count);
    }
  }

  function updateSecretToggleLabel(toolKey) {
    var tool = state.tools[toolKey];
    var button = byId(toolKey + 'ToggleAll');
    var allRevealed = tool.items.length > 0 && tool.items.every(function (item) {
      return item.revealed;
    });
    if (button) {
      button.textContent = allRevealed ? 'Ocultar' : 'Mostrar';
      button.setAttribute('aria-pressed', String(allRevealed));
    }
  }

  function createSecretRow(toolKey, item, index) {
    var row = createElement('div', 'secret-item');
    row.setAttribute('data-index', String(index));
    var main = createElement('div', 'secret-main');
    var position = createElement('span', 'secret-index', String(index + 1));
    var value = createElement('code', 'secret-value', item.revealed ? item.value : maskValue(item.value));
    main.appendChild(position);
    main.appendChild(value);
    var actions = createElement('div', 'secret-actions');
    var strength = strengthBadge(item.entropy);
    var bits = createElement('span', 'secret-entropy', Math.round(item.entropy || 0) + ' bits');
    var reveal = createElement('button', 'btn btn-sm btn-outline-secondary', item.revealed ? 'Ocultar' : 'Mostrar');
    reveal.type = 'button';
    reveal.setAttribute('data-action', 'reveal');
    reveal.setAttribute('aria-pressed', String(item.revealed));
    var copy = createElement('button', 'btn btn-sm btn-outline-primary', 'Copiar');
    copy.type = 'button';
    copy.setAttribute('data-action', 'copy');
    actions.appendChild(strength.badge);
    actions.appendChild(bits);
    actions.appendChild(reveal);
    actions.appendChild(copy);
    row.appendChild(main);
    row.appendChild(actions);
    return row;
  }

  function renderSecretList(toolKey) {
    var tool = state.tools[toolKey];
    var list = byId(toolKey + 'List');
    var empty = byId(toolKey + 'Empty');
    var hasItems = tool.items.length > 0;
    updateCountBadge(toolKey + 'CountBadge', tool.items.length);
    if (empty) {
      setHidden(empty, hasItems);
    }
    if (list) {
      setHidden(list, !hasItems);
      clearChildren(list);
      if (hasItems) {
        var fragment = document.createDocumentFragment();
        tool.items.forEach(function (item, index) {
          fragment.appendChild(createSecretRow(toolKey, item, index));
        });
        list.appendChild(fragment);
      }
    }
    updateSecretToggleLabel(toolKey);
  }

  function renderUUID() {
    var tool = state.tools.uuid;
    var hasItems = tool.items.length > 0;
    updateCountBadge('uuidCountBadge', tool.items.length);
    var empty = byId('uuidEmpty');
    var wrapper = byId('uuidTableWrap');
    var body = byId('uuidResults');
    setHidden(empty, hasItems);
    setHidden(wrapper, !hasItems);
    clearChildren(body);
    if (!hasItems) {
      return;
    }
    var fragment = document.createDocumentFragment();
    tool.items.forEach(function (item, index) {
      var row = document.createElement('tr');
      var indexCell = createElement('td', 'text-secondary small', String(index + 1));
      var valueCell = document.createElement('td');
      valueCell.appendChild(createElement('code', 'uuid-value', item.value));
      var actionCell = createElement('td', 'text-end');
      var copy = createElement('button', 'btn btn-sm btn-outline-primary', 'Copiar');
      copy.type = 'button';
      copy.setAttribute('data-index', String(index));
      actionCell.appendChild(copy);
      row.appendChild(indexCell);
      row.appendChild(valueCell);
      row.appendChild(actionCell);
      fragment.appendChild(row);
    });
    body.appendChild(fragment);
  }

  function renderTool(toolKey) {
    if (toolKey === 'uuid') {
      renderUUID();
    } else {
      renderSecretList(toolKey);
    }
  }

  function renderHistory() {
    updateCountBadge('historyCountBadge', state.history.length);
    updateCountBadge('historyTabBadge', state.history.length);
    var empty = byId('historyEmpty');
    var list = byId('historyList');
    var hasItems = state.history.length > 0;
    setHidden(empty, hasItems);
    setHidden(list, !hasItems);
    clearChildren(list);
    var allRevealed = hasItems && state.history.every(function (entry) {
      return entry.revealed;
    });
    var toggle = byId('historyToggleAll');
    toggle.textContent = allRevealed ? 'Ocultar todo' : 'Mostrar todo';
    toggle.setAttribute('aria-pressed', String(allRevealed));
    if (!hasItems) {
      return;
    }
    var fragment = document.createDocumentFragment();
    state.history.forEach(function (entry, index) {
      var row = createElement('div', 'secret-item history-item');
      row.setAttribute('data-index', String(index));
      var main = createElement('div', 'secret-main');
      main.appendChild(createElement('span', 'badge text-bg-secondary history-tool', entry.label));
      main.appendChild(createElement('code', 'secret-value', entry.revealed ? entry.value : maskValue(entry.value)));
      var actions = createElement('div', 'secret-actions');
      actions.appendChild(createElement('span', 'secret-entropy', formatTimestamp(entry.generatedAt)));
      var reveal = createElement('button', 'btn btn-sm btn-outline-secondary', entry.revealed ? 'Ocultar' : 'Mostrar');
      reveal.type = 'button';
      reveal.setAttribute('data-action', 'reveal');
      reveal.setAttribute('aria-pressed', String(entry.revealed));
      var copy = createElement('button', 'btn btn-sm btn-outline-primary', 'Copiar');
      copy.type = 'button';
      copy.setAttribute('data-action', 'copy');
      actions.appendChild(reveal);
      actions.appendChild(copy);
      row.appendChild(main);
      row.appendChild(actions);
      fragment.appendChild(row);
    });
    list.appendChild(fragment);
  }

  function clearTool(toolKey) {
    var tool = state.tools[toolKey];
    tool.items = [];
    tool.options = null;
    tool.generatedAt = null;
    renderTool(toolKey);
    showToast('Resultados eliminados.', 'success');
  }

  function copyAll(toolKey) {
    var tool = state.tools[toolKey];
    if (!tool.items.length) {
      showToast('No hay resultados para copiar.', 'warning');
      return;
    }
    var text = tool.items.map(function (item) {
      return item.value;
    }).join('\n');
    copyText(text, 'Se copiaron ' + tool.items.length + ' ' + COPY_NOUNS[toolKey] + '.');
  }

  function toggleAllSecret(toolKey) {
    var tool = state.tools[toolKey];
    if (!tool.items.length) {
      showToast('No hay resultados que mostrar.', 'warning');
      return;
    }
    var allRevealed = tool.items.every(function (item) {
      return item.revealed;
    });
    tool.items.forEach(function (item) {
      item.revealed = !allRevealed;
    });
    tool.revealed = !allRevealed;
    renderSecretList(toolKey);
  }

  function toggleSecretItem(toolKey, index) {
    var tool = state.tools[toolKey];
    var item = tool.items[index];
    if (!item) {
      return;
    }
    item.revealed = !item.revealed;
    tool.revealed = tool.items.every(function (current) {
      return current.revealed;
    });
    var list = byId(toolKey + 'List');
    var row = list.querySelector('[data-index="' + index + '"]');
    if (row) {
      row.querySelector('.secret-value').textContent = item.revealed ? item.value : maskValue(item.value);
      var button = row.querySelector('[data-action="reveal"]');
      button.textContent = item.revealed ? 'Ocultar' : 'Mostrar';
      button.setAttribute('aria-pressed', String(item.revealed));
    }
    updateSecretToggleLabel(toolKey);
  }

  function toggleAllHistory() {
    if (!state.history.length) {
      showToast('El historial está vacío.', 'warning');
      return;
    }
    var allRevealed = state.history.every(function (entry) {
      return entry.revealed;
    });
    state.history.forEach(function (entry) {
      entry.revealed = !allRevealed;
    });
    renderHistory();
  }

  function toggleHistoryItem(index) {
    var entry = state.history[index];
    if (!entry) {
      return;
    }
    entry.revealed = !entry.revealed;
    var list = byId('historyList');
    var row = list.querySelector('[data-index="' + index + '"]');
    if (row) {
      row.querySelector('.secret-value').textContent = entry.revealed ? entry.value : maskValue(entry.value);
      var button = row.querySelector('[data-action="reveal"]');
      button.textContent = entry.revealed ? 'Ocultar' : 'Mostrar';
      button.setAttribute('aria-pressed', String(entry.revealed));
    }
    var allRevealed = state.history.every(function (current) {
      return current.revealed;
    });
    var toggle = byId('historyToggleAll');
    toggle.textContent = allRevealed ? 'Ocultar todo' : 'Mostrar todo';
    toggle.setAttribute('aria-pressed', String(allRevealed));
  }

  function generateUUID() {
    var input = byId('uuidCount');
    var feedback = byId('uuidCountFeedback');
    var count = readInteger(input, 1, 10000, 'La cantidad', feedback);
    if (count === null) {
      return;
    }
    try {
      var results = global.Generators.uuidBatch(count);
      setToolResults('uuid', results, { cantidad: count }, 'UUID v4', 'uuid');
      showToast(count === 1 ? 'UUID generado.' : count + ' UUID generados.', 'success');
    } catch (error) {
      setFieldError(input, feedback, error.message);
    }
  }

  function selectedPasswordSets() {
    var pairs = [
      ['pwUpper', 'upper'],
      ['pwLower', 'lower'],
      ['pwDigits', 'digits'],
      ['pwSymbols', 'symbols']
    ];
    return pairs.filter(function (pair) {
      return byId(pair[0]).checked;
    }).map(function (pair) {
      return pair[1];
    });
  }

  function generatePasswords() {
    var lengthInput = byId('passwordLength');
    var lengthFeedback = byId('passwordLengthFeedback');
    var quantityInput = byId('passwordQuantity');
    var quantityFeedback = byId('passwordQuantityFeedback');
    var setsFeedback = byId('passwordSetsFeedback');
    setsFeedback.textContent = '';
    var length = readInteger(lengthInput, 8, 128, 'La longitud', lengthFeedback);
    if (length === null) {
      return;
    }
    var quantity = readInteger(quantityInput, 1, 100, 'La cantidad', quantityFeedback);
    if (quantity === null) {
      return;
    }
    var sets = selectedPasswordSets();
    if (sets.length === 0) {
      setsFeedback.textContent = 'Selecciona al menos un tipo de carácter.';
      showToast('Selecciona al menos un tipo de carácter.', 'warning');
      return;
    }
    var excludeAmbiguous = byId('pwExcludeAmbiguous').checked;
    var options = {
      length: length,
      sets: sets,
      excludeAmbiguous: excludeAmbiguous
    };
    try {
      var results = global.Generators.passwordBatch(options, quantity);
      setToolResults('password', results, {
        longitud: length,
        cantidad: quantity,
        incluye: sets,
        excluir_ambiguos: excludeAmbiguous
      }, 'Contraseñas', 'contrasenas');
      showToast(quantity === 1 ? 'Contraseña generada.' : quantity + ' contraseñas generadas.', 'success');
    } catch (error) {
      setFieldError(lengthInput, lengthFeedback, error.message);
    }
  }

  function generatePassphrases() {
    var wordsInput = byId('passphraseWords');
    var wordsFeedback = byId('passphraseWordsFeedback');
    var quantityInput = byId('passphraseQuantity');
    var quantityFeedback = byId('passphraseQuantityFeedback');
    var words = readInteger(wordsInput, 3, 12, 'El número de palabras', wordsFeedback);
    if (words === null) {
      return;
    }
    var quantity = readInteger(quantityInput, 1, 100, 'La cantidad', quantityFeedback);
    if (quantity === null) {
      return;
    }
    var separator = byId('passphraseSeparator').value;
    var capitalize = byId('passphraseCapitalize').checked;
    var includeNumber = byId('passphraseNumber').checked;
    var options = {
      words: words,
      separator: separator,
      capitalize: capitalize,
      includeNumber: includeNumber
    };
    try {
      var results = global.Generators.passphraseBatch(options, quantity);
      setToolResults('passphrase', results, {
        palabras: words,
        cantidad: quantity,
        separador: separator === ' ' ? 'espacio' : separator,
        capitalizar: capitalize,
        numero_final: includeNumber
      }, 'Frases de contraseña', 'frases');
      showToast(quantity === 1 ? 'Frase generada.' : quantity + ' frases generadas.', 'success');
    } catch (error) {
      setFieldError(wordsInput, wordsFeedback, error.message);
    }
  }

  function updateTokenOptions() {
    var type = byId('tokenType').value;
    setHidden(byId('tokenHexOptions'), type !== 'hex');
    setHidden(byId('tokenBase64Options'), type !== 'base64');
    setHidden(byId('tokenCustomOptions'), type !== 'custom');
  }

  function generateTokens() {
    var type = byId('tokenType').value;
    var quantityInput = byId('tokenQuantity');
    var quantityFeedback = byId('tokenQuantityFeedback');
    var quantity = readInteger(quantityInput, 1, 100, 'La cantidad', quantityFeedback);
    if (quantity === null) {
      return;
    }
    var results;
    var options;
    var label;
    try {
      if (type === 'hex') {
        var hexInput = byId('tokenHexLength');
        var hexFeedback = byId('tokenHexLengthFeedback');
        var hexLength = readInteger(hexInput, 8, 256, 'La longitud hexadecimal', hexFeedback);
        if (hexLength === null) {
          return;
        }
        if (hexLength % 2 !== 0) {
          setFieldError(hexInput, hexFeedback, 'La longitud hexadecimal debe ser un número par.');
          return;
        }
        results = global.Generators.hexTokenBatch(hexLength, quantity);
        options = { tipo: 'hexadecimal', cantidad: quantity, caracteres: hexLength };
        label = 'Tokens hexadecimales';
      } else if (type === 'base64') {
        var bytesInput = byId('tokenBase64Bytes');
        var bytesFeedback = byId('tokenBase64BytesFeedback');
        var byteCount = readInteger(bytesInput, 8, 128, 'La cantidad de bytes', bytesFeedback);
        if (byteCount === null) {
          return;
        }
        results = global.Generators.base64TokenBatch(byteCount, quantity);
        options = { tipo: 'base64', cantidad: quantity, bytes: byteCount };
        label = 'Tokens Base64';
      } else {
        var alphabetInput = byId('tokenAlphabet');
        var alphabetFeedback = byId('tokenAlphabetFeedback');
        var customLengthInput = byId('tokenCustomLength');
        var customLengthFeedback = byId('tokenCustomLengthFeedback');
        clearFieldError(alphabetInput, alphabetFeedback);
        var alphabet = alphabetInput.value;
        var uniqueAlphabet = Array.from(new Set(Array.from(alphabet)));
        if (uniqueAlphabet.length < 2) {
          setFieldError(alphabetInput, alphabetFeedback, 'El alfabeto debe contener al menos 2 caracteres distintos.');
          return;
        }
        var customLength = readInteger(customLengthInput, 1, 256, 'La longitud', customLengthFeedback);
        if (customLength === null) {
          return;
        }
        results = global.Generators.customTokenBatch(alphabet, customLength, quantity);
        options = { tipo: 'personalizado', cantidad: quantity, longitud: customLength, alfabeto: alphabet };
        label = 'Tokens personalizados';
      }
      setToolResults('token', results, options, label, 'tokens');
      showToast(quantity === 1 ? 'Token generado.' : quantity + ' tokens generados.', 'success');
    } catch (error) {
      if (type === 'hex') {
        setFieldError(byId('tokenHexLength'), byId('tokenHexLengthFeedback'), error.message);
      } else if (type === 'base64') {
        setFieldError(byId('tokenBase64Bytes'), byId('tokenBase64BytesFeedback'), error.message);
      } else {
        setFieldError(byId('tokenAlphabet'), byId('tokenAlphabetFeedback'), error.message);
      }
    }
  }

  function handleExport(toolKey, format) {
    var tool = state.tools[toolKey];
    if (!tool.items.length) {
      showToast('Genera resultados antes de exportar.', 'warning');
      return;
    }
    var payload = {
      tool: toolKey,
      label: tool.label,
      fileBase: tool.fileBase,
      generatedAt: tool.generatedAt || new Date().toISOString(),
      options: tool.options,
      items: tool.items
    };
    try {
      var filename = global.Exporters.download(format, payload);
      showToast('Descarga iniciada: ' + filename, 'success');
    } catch (error) {
      showToast(error.message, 'danger');
    }
  }

  function updateChecker() {
    var value = byId('checkerInput').value;
    var result = global.Generators.analyzePassword(value);
    byId('checkerLength').textContent = String(result.length);
    byId('checkerUpper').textContent = String(result.upper);
    byId('checkerLower').textContent = String(result.lower);
    byId('checkerDigits').textContent = String(result.digits);
    byId('checkerSymbols').textContent = String(result.symbols);
    byId('checkerUnique').textContent = String(result.unique);
    byId('checkerEntropy').textContent = result.entropy.toFixed(0);
    var label = byId('checkerStrengthLabel');
    var bar = byId('checkerStrengthBar');
    var progress = byId('checkerStrengthProgress');
    if (result.length === 0) {
      label.textContent = 'Sin datos';
      label.className = 'badge text-bg-secondary';
      bar.className = 'progress-bar bg-secondary';
      bar.style.width = '0%';
      progress.setAttribute('aria-valuenow', '0');
    } else {
      label.textContent = result.strength.label;
      label.className = 'badge ' + result.strength.className;
      bar.className = 'progress-bar ' + result.strength.className;
      bar.style.width = Math.max(4, result.strength.percent) + '%';
      progress.setAttribute('aria-valuenow', String(result.strength.percent));
    }
    var requirementMap = {
      length8: 'reqLength8',
      length12: 'reqLength12',
      upper: 'reqUpper',
      lower: 'reqLower',
      digit: 'reqDigit',
      symbol: 'reqSymbol',
      unique: 'reqUnique'
    };
    Object.keys(requirementMap).forEach(function (key) {
      byId(requirementMap[key]).classList.toggle('met', Boolean(result.requirements[key]));
    });
  }

  function applyTheme(theme) {
    var dark = theme === 'dark';
    document.documentElement.setAttribute('data-bs-theme', dark ? 'dark' : 'light');
    var toggle = byId('themeToggle');
    toggle.setAttribute('aria-pressed', String(dark));
    toggle.setAttribute('aria-label', dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
    byId('themeLabel').textContent = dark ? 'Modo claro' : 'Modo oscuro';
  }

  function bindSecretListEvents(toolKey) {
    var list = byId(toolKey + 'List');
    list.addEventListener('click', function (event) {
      var button = event.target.closest('button[data-action]');
      if (!button) {
        return;
      }
      var row = button.closest('.secret-item');
      if (!row) {
        return;
      }
      var index = Number(row.getAttribute('data-index'));
      var item = state.tools[toolKey].items[index];
      if (!item) {
        return;
      }
      if (button.getAttribute('data-action') === 'copy') {
        copyText(item.value, 'Copiado al portapapeles.');
      } else {
        toggleSecretItem(toolKey, index);
      }
    });
  }

  function bindHistoryEvents() {
    var list = byId('historyList');
    list.addEventListener('click', function (event) {
      var button = event.target.closest('button[data-action]');
      if (!button) {
        return;
      }
      var row = button.closest('.secret-item');
      if (!row) {
        return;
      }
      var index = Number(row.getAttribute('data-index'));
      var entry = state.history[index];
      if (!entry) {
        return;
      }
      if (button.getAttribute('data-action') === 'copy') {
        copyText(entry.value, 'Copiado al portapapeles.');
      } else {
        toggleHistoryItem(index);
      }
    });
  }

  function bindUUIDEvents() {
    byId('uuidForm').addEventListener('submit', function (event) {
      event.preventDefault();
      generateUUID();
    });
    Array.prototype.forEach.call(document.querySelectorAll('.uuid-preset'), function (button) {
      button.addEventListener('click', function () {
        byId('uuidCount').value = button.getAttribute('data-count');
        generateUUID();
      });
    });
    byId('uuidCopyAll').addEventListener('click', function () {
      copyAll('uuid');
    });
    byId('uuidRegenerate').addEventListener('click', generateUUID);
    byId('uuidClear').addEventListener('click', function () {
      clearTool('uuid');
    });
    byId('uuidResults').addEventListener('click', function (event) {
      var button = event.target.closest('button[data-index]');
      if (!button) {
        return;
      }
      var index = Number(button.getAttribute('data-index'));
      var item = state.tools.uuid.items[index];
      if (item) {
        copyText(item.value, 'UUID copiado al portapapeles.');
      }
    });
  }

  function bindPasswordEvents() {
    var lengthInput = byId('passwordLength');
    var lengthRange = byId('passwordLengthRange');
    lengthInput.addEventListener('input', function () {
      if (lengthInput.value !== '') {
        lengthRange.value = lengthInput.value;
      }
    });
    lengthRange.addEventListener('input', function () {
      lengthInput.value = lengthRange.value;
      clearFieldError(lengthInput, byId('passwordLengthFeedback'));
    });
    byId('passwordForm').addEventListener('submit', function (event) {
      event.preventDefault();
      generatePasswords();
    });
    byId('passwordToggleAll').addEventListener('click', function () {
      toggleAllSecret('password');
    });
    byId('passwordCopyAll').addEventListener('click', function () {
      copyAll('password');
    });
    byId('passwordRegenerate').addEventListener('click', generatePasswords);
    byId('passwordClear').addEventListener('click', function () {
      clearTool('password');
    });
    Array.prototype.forEach.call(document.querySelectorAll('#passwordForm input[type="checkbox"]'), function (checkbox) {
      checkbox.addEventListener('change', function () {
        byId('passwordSetsFeedback').textContent = '';
      });
    });
  }

  function bindPassphraseEvents() {
    byId('passphraseForm').addEventListener('submit', function (event) {
      event.preventDefault();
      generatePassphrases();
    });
    byId('passphraseToggleAll').addEventListener('click', function () {
      toggleAllSecret('passphrase');
    });
    byId('passphraseCopyAll').addEventListener('click', function () {
      copyAll('passphrase');
    });
    byId('passphraseRegenerate').addEventListener('click', generatePassphrases);
    byId('passphraseClear').addEventListener('click', function () {
      clearTool('passphrase');
    });
  }

  function bindTokenEvents() {
    byId('tokenType').addEventListener('change', updateTokenOptions);
    byId('tokenForm').addEventListener('submit', function (event) {
      event.preventDefault();
      generateTokens();
    });
    byId('tokenToggleAll').addEventListener('click', function () {
      toggleAllSecret('token');
    });
    byId('tokenCopyAll').addEventListener('click', function () {
      copyAll('token');
    });
    byId('tokenRegenerate').addEventListener('click', generateTokens);
    byId('tokenClear').addEventListener('click', function () {
      clearTool('token');
    });
  }

  function bindCheckerEvents() {
    var input = byId('checkerInput');
    var toggle = byId('checkerToggle');
    input.addEventListener('input', updateChecker);
    toggle.addEventListener('click', function () {
      var showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      toggle.textContent = showing ? 'Mostrar' : 'Ocultar';
      toggle.setAttribute('aria-pressed', String(!showing));
    });
    byId('checkerClear').addEventListener('click', function () {
      input.value = '';
      updateChecker();
      input.focus();
    });
  }

  function bindHistoryControls() {
    byId('historyToggleAll').addEventListener('click', toggleAllHistory);
    byId('historyCopyAll').addEventListener('click', function () {
      if (!state.history.length) {
        showToast('El historial está vacío.', 'warning');
        return;
      }
      copyText(state.history.map(function (entry) {
        return entry.value;
      }).join('\n'), 'Historial copiado (' + state.history.length + ' resultados).');
    });
    byId('historyClear').addEventListener('click', function () {
      state.history = [];
      renderHistory();
      showToast('Historial eliminado.', 'success');
    });
  }

  function bindExportButtons() {
    Array.prototype.forEach.call(document.querySelectorAll('.export-btn'), function (button) {
      button.addEventListener('click', function () {
        handleExport(button.getAttribute('data-tool'), button.getAttribute('data-format'));
      });
    });
  }

  function showCryptoError() {
    var main = document.querySelector('main');
    var alert = createElement('div', 'alert alert-danger', 'Tu navegador no dispone de crypto.getRandomValues(). Por seguridad, el generador no puede crear secretos.');
    alert.setAttribute('role', 'alert');
    main.insertBefore(alert, main.firstChild);
    Array.prototype.forEach.call(document.querySelectorAll('form button[type="submit"]'), function (button) {
      button.disabled = true;
    });
  }

  function bindClearEvents() {
    bindClearOnInput('uuidCount', 'uuidCountFeedback');
    bindClearOnInput('passwordLength', 'passwordLengthFeedback');
    bindClearOnInput('passwordQuantity', 'passwordQuantityFeedback');
    bindClearOnInput('passphraseWords', 'passphraseWordsFeedback');
    bindClearOnInput('passphraseQuantity', 'passphraseQuantityFeedback');
    bindClearOnInput('tokenHexLength', 'tokenHexLengthFeedback');
    bindClearOnInput('tokenBase64Bytes', 'tokenBase64BytesFeedback');
    bindClearOnInput('tokenAlphabet', 'tokenAlphabetFeedback');
    bindClearOnInput('tokenCustomLength', 'tokenCustomLengthFeedback');
    bindClearOnInput('tokenQuantity', 'tokenQuantityFeedback');
  }

  function init() {
    bindClearEvents();
    bindUUIDEvents();
    bindPasswordEvents();
    bindPassphraseEvents();
    bindTokenEvents();
    bindCheckerEvents();
    bindHistoryControls();
    bindExportButtons();
    SECRET_KEYS.forEach(bindSecretListEvents);
    bindHistoryEvents();
    byId('themeToggle').addEventListener('click', function () {
      var current = document.documentElement.getAttribute('data-bs-theme');
      applyTheme(current === 'dark' ? 'light' : 'dark');
    });
    updateTokenOptions();
    renderTool('uuid');
    renderTool('password');
    renderTool('passphrase');
    renderTool('token');
    renderHistory();
    updateChecker();
    applyTheme('light');
    if (!global.SecureRandom.isAvailable()) {
      showCryptoError();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
