// The crown of the last match's winner (GAME_SPEC §4, D-154): stored as last_won,
// changed by every saved result, sent to the host in the roster, and kept in the
// server's memory when the sheet cannot be written.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, sampleResult } from '../helpers/server.js';
import { SheetsStore } from '../../server/store/sheets.js';
import { MemoryStore } from '../../server/store/memory.js';
import { DataService } from '../../server/data.js';

const crowns = (roster) => Object.fromEntries(roster.players.map((p) => [p.gamertag, p.crown]));

// Ana and Max (and, if asked, Zoe) in a room, ready, and a match between the given slots.
async function play(s, h, slots, result) {
  h.send({ t: 'match_start', stage: 'campus', lives: 3, slots });
  const { matchId } = await h.next('match_started');
  s.clock.now += 90_000;
  h.drain();
  h.send({ t: 'match_result', matchId, result });
  const saved = await h.next('result_saved');
  return saved;
}

async function readyAgain(h, players) {
  for (const p of players) {
    p.send({ t: 'pick', fighter: 'finance_bro', ready: true });
    await h.next('roster', { match: (r) => r.players.find((x) => x.slot === p.slot).ready });
  }
}

test('a new player has no crown; the winner of a saved match gets one, the others lose theirs', async (t) => {
  const s = await startServer(t);
  const h = await s.host();
  const a = await s.player(h, 'Ana', { fighter: 'finance_bro' });
  const b = await s.player(h, 'Max', { fighter: 'house_dj' });
  const c = await s.player(h, 'Zoe', { fighter: 'house_dj' });
  assert.deepEqual(crowns(await (h.send({ t: 'room_set', closed: false }), h.next('roster'))), { Ana: false, Max: false, Zoe: false });

  // Ana beats Max: Ana wears the crown.
  await play(s, h, [a.slot, b.slot], sampleResult({ slots: [a.slot, b.slot] }));
  assert.deepEqual(crowns(await h.next('roster', { match: (r) => r.players.some((p) => p.crown) })), { Ana: true, Max: false, Zoe: false });
  assert.equal(s.store.players.get('ana').last_won, true);
  assert.equal(s.store.players.get('max').last_won, false);

  // Zoe beats Max: now Ana and Zoe both wear one (several crowns at once).
  await readyAgain(h, [b, c]);
  await play(s, h, [c.slot, b.slot], sampleResult({ slots: [c.slot, b.slot] }));
  assert.deepEqual(crowns(await h.next('roster', { match: (r) => r.players.find((p) => p.gamertag === 'Zoe').crown })), { Ana: true, Max: false, Zoe: true });

  // Max beats Ana: Ana loses hers, Max gets one, Zoe keeps hers.
  await readyAgain(h, [a, b]);
  await play(s, h, [b.slot, a.slot], sampleResult({ slots: [b.slot, a.slot] }));
  assert.deepEqual(crowns(await h.next('roster', { match: (r) => r.players.find((p) => p.gamertag === 'Max').crown })), { Ana: false, Max: true, Zoe: true });
});

test('a practice match (one account readable) changes no crown', async (t) => {
  const s = await startServer(t);
  const h = await s.host();
  const a = await s.player(h, 'Ana', { fighter: 'finance_bro' });
  const b = await s.player(h, 'Max', { fighter: 'house_dj' });
  s.store.players.delete('max');
  s.app.data.players.delete('max');
  const saved = await play(s, h, [a.slot, b.slot], sampleResult({ slots: [a.slot, b.slot] }));
  assert.equal(saved.stored, false);
  assert.equal(s.store.players.get('ana').last_won, false);
});

test('with the sheet down the server still moves the crown in its own memory', async (t) => {
  const s = await startServer(t);
  const h = await s.host();
  const a = await s.player(h, 'Ana', { fighter: 'finance_bro' });
  const b = await s.player(h, 'Max', { fighter: 'house_dj' });
  s.store.failing = true;
  const saved = await play(s, h, [b.slot, a.slot], sampleResult({ slots: [b.slot, a.slot] }));
  assert.equal(saved.stored, true);
  assert.equal(s.store.players.get('max').last_won, false, 'nothing reached the store');
  assert.deepEqual(crowns(await h.next('roster', { match: (r) => r.players.some((p) => p.crown) })), { Ana: false, Max: true });
  assert.equal(s.app.data.players.get('max').last_won, true);
});

test('the data service sets last_won from the win in each update', () => {
  const data = new DataService(new MemoryStore(), { autoRetry: false });
  data.players.set('ana', { gamertag: 'Ana', gamertag_lower: 'ana', matches: 0, wins: 0, points: 0, kos: 0, falls: 0, damage_dealt: 0, damage_taken: 0, achievements: [], last_won: true });
  data.players.set('max', { gamertag: 'Max', gamertag_lower: 'max', matches: 0, wins: 0, points: 0, kos: 0, falls: 0, damage_dealt: 0, damage_taken: 0, achievements: [], last_won: false });
  const update = (lower, wins) => ({ gamertag_lower: lower, deltas: { matches: 1, wins, points: 10, kos: 0, falls: 0, damage_dealt: 0, damage_taken: 0 }, achievements: [] });
  data.recordMatch({ match_id: 'x' }, [update('ana', 0), update('max', 1)]);
  assert.equal(data.players.get('ana').last_won, false);
  assert.equal(data.players.get('max').last_won, true);
  data.stop();
});

test('the sheet client reads last_won: 1 is a crown; 0, an empty cell or junk is not', async () => {
  for (const [cell, crown] of [[1, true], ['1', true], [true, true], [0, false], ['', false], [undefined, false], ['yes', false], [2, false]]) {
    const store = new SheetsStore({ url: 'https://script.example/exec', secret: 'x', fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, data: { gamertag: 'Ana', gamertag_lower: 'ana', salt: 'ab', pin_hash: 'cd', last_won: cell } }) }) });
    assert.equal((await store.getPlayer('ana')).last_won, crown, JSON.stringify(cell));
  }
});
