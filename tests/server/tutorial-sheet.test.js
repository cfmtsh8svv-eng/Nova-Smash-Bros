import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScript } from '../helpers/sheet-script.js';

function register(script, gamertag) {
  const hex = 'ab'.repeat(16);
  const result = script.call('createPlayer', { gamertag, gamertag_lower: gamertag.toLowerCase(), salt: hex, pin_hash: hex + hex, created_at: '2026-11-17T10:00:00.000Z' });
  assert.equal(result.ok, true);
  return result.data;
}

test('Code.gs tutorial flag: new players, legacy fallback, idempotent completion, validation and setup migration', () => {
  const script = loadScript();
  assert.equal(register(script, 'Ana').tutorial_done, false);
  const cells = script.tabs.get('players').cells;
  assert.equal(cells[0][14], 'tutorial_done');
  assert.equal(cells[1][14], 0);
  cells[1][14] = ''; cells[1][5] = 1;
  assert.equal(script.call('getPlayer', { gamertag_lower: 'ana' }).data.tutorial_done, true);
  cells[1][14] = 0;
  assert.equal(script.call('getPlayer', { gamertag_lower: 'ana' }).data.tutorial_done, false);
  const before = cells[1].slice(0, 14);
  for (let i = 0; i < 2; i++) assert.equal(script.call('completeTutorial', { gamertag_lower: 'ana' }).ok, true);
  assert.equal(cells[1][14], 1);
  assert.deepEqual(cells[1].slice(0, 14), before, 'no account or score changes');
  for (const lower of ['=1+1', 'missing', '', 123]) assert.equal(script.call('completeTutorial', { gamertag_lower: lower }).ok, false);
  assert.equal(script.call('completeTutorial', { gamertag_lower: 'ana' }, 'wrong-secret').error, 'forbidden');
  // setup adds only the header and number format to a 14-column legacy sheet.
  cells[0].pop(); cells[1].pop();
  const legacy = structuredClone(cells[1]);
  // The mock exposes setup through the sandbox in loadScript.
  script.setup();
  assert.equal(cells[0][14], 'tutorial_done');
  assert.deepEqual(cells[1], legacy);
});
