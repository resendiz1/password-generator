(function (global) {
  'use strict';

  var FORMATS = {
    txt: { extension: 'txt', mime: 'text/plain' },
    csv: { extension: 'csv', mime: 'text/csv' },
    json: { extension: 'json', mime: 'application/json' }
  };

  function pad(number) {
    return String(number).padStart(2, '0');
  }

  function fileTimestamp(date) {
    return String(date.getFullYear()) + pad(date.getMonth() + 1) + pad(date.getDate()) + '-' + pad(date.getHours()) + pad(date.getMinutes()) + pad(date.getSeconds());
  }

  function sanitizeBase(value) {
    return String(value || 'resultados').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'resultados';
  }

  function csvCell(value) {
    var text = String(value == null ? '' : value);
    if (/[",\r\n;]/.test(text)) {
      return '"' + text.replace(/"/g, '""') + '"';
    }
    return text;
  }

  function entropyValue(entropy) {
    return Number.isFinite(entropy) ? Math.round(entropy * 10) / 10 : '';
  }

  function buildTXT(payload) {
    return payload.items.map(function (item) {
      return item.value;
    }).join('\r\n') + '\r\n';
  }

  function buildCSV(payload) {
    var generatedAt = payload.generatedAt;
    var rows = [['indice', 'herramienta', 'valor', 'entropia_bits', 'fecha']];
    payload.items.forEach(function (item, index) {
      rows.push([
        index + 1,
        payload.label,
        item.value,
        entropyValue(item.entropy),
        generatedAt
      ]);
    });
    return '\ufeff' + rows.map(function (row) {
      return row.map(csvCell).join(',');
    }).join('\r\n') + '\r\n';
  }

  function buildJSON(payload) {
    var document = {
      herramienta: payload.tool,
      nombre: payload.label,
      fecha_generacion: payload.generatedAt,
      opciones: payload.options,
      total: payload.items.length,
      resultados: payload.items.map(function (item, index) {
        return {
          indice: index + 1,
          valor: item.value,
          entropia_bits: entropyValue(item.entropy)
        };
      })
    };
    return JSON.stringify(document, null, 2) + '\n';
  }

  function build(format, payload) {
    if (!FORMATS[format]) {
      throw new Error('Formato de exportación no válido.');
    }
    if (!payload || !Array.isArray(payload.items) || payload.items.length === 0) {
      throw new Error('No hay resultados para exportar.');
    }
    if (format === 'txt') {
      return { content: buildTXT(payload), mime: FORMATS.txt.mime, extension: FORMATS.txt.extension };
    }
    if (format === 'csv') {
      return { content: buildCSV(payload), mime: FORMATS.csv.mime, extension: FORMATS.csv.extension };
    }
    return { content: buildJSON(payload), mime: FORMATS.json.mime, extension: FORMATS.json.extension };
  }

  function download(format, payload) {
    var output = build(format, payload);
    var now = new Date();
    var filename = sanitizeBase(payload.fileBase || payload.tool) + '-' + fileTimestamp(now) + '.' + output.extension;
    var blob = new Blob([output.content], { type: output.mime + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    global.setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1500);
    return filename;
  }

  global.Exporters = {
    build: build,
    download: download
  };
})(window);
