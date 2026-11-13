// The Google Sheet script (google-sheet/Code.gs) against what the server really sends.
//
// Code.gs runs inside Google, so it is loaded here into a Node sandbox with a small
// stand-in for the spreadsheet. That is enough to catch the script refusing data the
// server produces, which the in-memory store of the other tests never would: a match
// won by a bot was refused this way and its result lost (D-182).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import { scoreResult } from '../../server/results.js';
import { DataService } from '../../server/data.js';
import { MemoryStore, StoreError } from '../../server/store/memory.js';
import { startServer } from '../helpers/server.js';

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
function loadScript() {
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
  return { call, tabs };
}

const HEX = 'ab'.repeat(16);
function register(script, gamertag) {
  const reply = script.call('createPlayer', { gamertag, gamertag_lower: gamertag.toLowerCase(), salt: HEX, pin_hash: HEX + HEX, created_at: '2026-11-13T10:00:00.000Z' });
  assert.equal(reply.ok, true, JSON.stringify(reply));
  return reply.data;
}

// A checked result of a match of Ana (slot 0), Max (slot 1) and the bot Freshman (slot 2).
function line(slot, place, fighterId) {
  const won = place === 1;
  return { slot, place, falls: won ? 0 : 1, kos: won ? 2 : 0, specialKos: 0, endLives: won ? 1 : 0, endPercent: 40, damageDealt: won ? 100 : 20, damageTaken: won ? 40 : 60, fighterId };
}
const MATCH = () => ({ id: randomUUID(), stage: 'campus', lives: 1, slots: [0, 1], bots: [{ slot: 2, name: 'Freshman', fighter: 'house_dj', level: 'medium' }] });

test('Code.gs saves a match whatever the server writes as its winner: a player, a bot or "(unknown)"', () => {
  // accounts: the slots whose account the server could read (slot -> gamertag).
  const cases = [
    { name: 'a player won', slots: [0, 1], accounts: { 0: 'Ana', 1: 'Max' }, places: { 0: 1, 1: 2, 2: 3 }, winner: 'Ana' },
    { name: 'the bot won', slots: [0, 1], accounts: { 0: 'Ana', 1: 'Max' }, places: { 0: 2, 1: 3, 2: 1 }, winner: '(bot)' },
    // The winner's account (slot 0) could not be read; the two others still count.
    { name: 'the winner could not be read', slots: [0, 1, 3], accounts: { 1: 'Max', 3: 'Zoe' }, places: { 0: 1, 1: 2, 3: 3, 2: 4 }, winner: '(unknown)' },
  ];
  for (const c of cases) {
    const script = loadScript();
    const rows = new Map(Object.entries(c.accounts).map(([slot, tag]) => [Number(slot), register(script, tag)]));
    const match = { ...MATCH(), slots: c.slots };
    const checked = { durationS: 40, players: [...c.slots, 2].map((slot) => line(slot, c.places[slot], slot === 2 ? 'house_dj' : 'finance_bro')) };
    const scored = scoreResult(match, checked, rows, Date.parse('2026-11-13T10:05:00Z'));
    assert.equal(scored.matchRow.winner, c.winner, c.name);
    const reply = script.call('recordMatch', { match: scored.matchRow, updates: scored.updates });
    assert.deepEqual(reply, { ok: true, data: { duplicate: false } }, `${c.name}: ${JSON.stringify(reply)}`);
    assert.equal(script.tabs.get('matches').cells.length, 2, `${c.name}: header and one match row`);
    assert.equal(script.tabs.get('matches').cells[1][6], c.winner);
    for (const row of rows.values()) {
      const saved = script.call('getPlayer', { gamertag_lower: row.gamertag_lower }).data;
      assert.equal(saved.matches, 1, `${c.name}: ${row.gamertag} has the match counted`);
    }
  }
});

test('Code.gs: the same match twice is counted once; numbers, achievements and the crown land in the row', () => {
  const script = loadScript();
  const rows = new Map([[0, register(script, 'Ana')], [1, register(script, 'Max')]]);
  const match = MATCH();
  const scored = scoreResult(match, { durationS: 40, players: [line(0, 1, 'finance_bro'), line(1, 2, 'surfer_girl'), line(2, 3, 'house_dj')] }, rows, Date.now());
  assert.deepEqual(script.call('recordMatch', { match: scored.matchRow, updates: scored.updates }).data, { duplicate: false });
  assert.deepEqual(script.call('recordMatch', { match: scored.matchRow, updates: scored.updates }).data, { duplicate: true });
  const ana = script.call('getPlayer', { gamertag_lower: 'ana' }).data;
  assert.equal(ana.matches, 1);
  assert.equal(ana.wins, 1);
  assert.equal(ana.points, scored.updates[0].deltas.points);
  assert.equal(ana.last_won, true);
  assert.ok(ana.achievements.includes('first_win'));
  assert.equal(script.call('getPlayer', { gamertag_lower: 'max' }).data.last_won, false);
  assert.deepEqual(script.call('listPlayers', {}).data.map((p) => p.gamertag), ['Ana', 'Max']);
});

test('Code.gs refuses a wrong secret, an unknown action and a made-up winner', () => {
  const script = loadScript();
  assert.equal(script.call('ping', {}, 'wrong-secret-0123456789').error, 'forbidden');
  assert.equal(script.call('nope', {}).error, 'bad_request');
  const rows = new Map([[0, register(script, 'Ana')], [1, register(script, 'Max')]]);
  const scored = scoreResult(MATCH(), { durationS: 40, players: [line(0, 1, 'finance_bro'), line(1, 2, 'surfer_girl'), line(2, 3, 'house_dj')] }, rows, Date.now());
  for (const winner of ['(keyboard player)', '=HYPERLINK("x")', '']) {
    assert.equal(script.call('recordMatch', { match: { ...scored.matchRow, winner }, updates: scored.updates }).error, 'bad_request', winner);
  }
});

test('a result the store refuses for good is counted at /healthz', async (t) => {
  class Refusing extends MemoryStore {
    async recordMatch() { throw new StoreError('bad_request', 'Invalid match data.'); }
  }
  const data = new DataService(new Refusing(), { autoRetry: false });
  data.recordMatch({ match_id: 'x' }, []);
  await data.flush();
  assert.equal(data.dropped, 1);
  assert.equal(data.pending, 0);

  const s = await startServer(t);
  assert.equal((await s.api('/healthz')).data.droppedResults, 0);
});
