import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SECRET = 'test-shared-secret-0123456789';
const CODE = readFileSync(new URL('../../google-sheet/Code.gs', import.meta.url), 'utf8');

// A spreadsheet tab: a grid of cells, with the few calls Code.gs uses.
function fakeSheet() {
  const cells = [];
  let maxRows = 1000;
  const sheet = {
    cells,
    getLastRow: () => cells.length,
    getMaxRows: () => maxRows,
    insertRowsAfter: (_after, n) => { maxRows += n; },
    setFrozenRows: () => {},
    getRange(row, col, rows = 1, cols = 1) {
      const range = {
        getValues: () => Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => (cells[row - 1 + r] || [])[col - 1 + c] ?? '')),
        setValues(values) {
          values.forEach((line, r) => line.forEach((v, c) => {
            cells[row - 1 + r] = cells[row - 1 + r] || [];
            cells[row - 1 + r][col - 1 + c] = v;
          }));
          return range;
        },
        setValue: (v) => range.setValues([[v]]),
        setNumberFormat: () => range,
        setNumberFormats: () => range,
        setFontWeight: () => range,
      };
      return range;
    },
  };
  return sheet;
}

// Loads Code.gs with a fresh, empty spreadsheet. call(action, payload) is one request from the server.
export function loadScript() {
  const tabs = new Map();
  const book = {
    getSheetByName: (name) => tabs.get(name) || null,
    insertSheet: (name) => { const s = fakeSheet(); tabs.set(name, s); return s; },
  };
  const sandbox = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: (key) => (key === 'SHARED_SECRET' ? SECRET : null) }) },
    ContentService: { createTextOutput: (text) => ({ setMimeType: () => text }), MimeType: { JSON: 'json' } },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    SpreadsheetApp: { flush: () => {}, getActiveSpreadsheet: () => book },
  };
  vm.createContext(sandbox);
  vm.runInContext(CODE, sandbox);
  const call = (action, payload, secret = SECRET) => JSON.parse(sandbox.doPost({ postData: { contents: JSON.stringify({ secret, action, payload }) } }));
  return { call, tabs, setup: () => sandbox.setup() };
}

