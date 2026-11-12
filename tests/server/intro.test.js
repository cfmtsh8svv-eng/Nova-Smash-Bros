// The intro before every match (GAME_SPEC §10b, D-153): a player's Skip travels from the
// phone to the host, only from players of the running match, and the intro screen the host
// sends to the phones is checked field by field.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../helpers/server.js';
import { relayProblem } from '../../server/rooms.js';

// Three players in the room; Ana and Max play, Zoe sits this match out.
async function matchOfTwo(s) {
  const h = await s.host();
  const a = await s.player(h, 'Ana', { fighter: 'finance_bro' });
  const b = await s.player(h, 'Max', { fighter: 'house_dj' });
  const c = await s.player(h, 'Zoe', { fighter: 'house_dj' });
  h.send({ t: 'match_start', stage: 'beach', lives: 3, slots: [a.slot, b.slot] });
  await h.next('match_started');
  await h.next('roster', { match: (r) => r.phase === 'match' });
  return { h, a, b, c };
}

test('a Skip from a player of the match reaches the host with their slot', async (t) => {
  const s = await startServer(t);
  const { h, a, b } = await matchOfTwo(s);
  a.send({ t: 'skip' });
  assert.deepEqual(await h.next('skip'), { t: 'skip', slot: a.slot });
  b.send({ t: 'skip' });
  assert.deepEqual(await h.next('skip'), { t: 'skip', slot: b.slot });
});

test('a Skip from a player who is not in the match, or outside a match, is dropped quietly', async (t) => {
  const s = await startServer(t);
  const h = await s.host();
  const a = await s.player(h, 'Ana', { fighter: 'finance_bro' });
  await s.player(h, 'Max', { fighter: 'house_dj' });
  a.send({ t: 'skip' }); // in the lobby
  await h.settle();
  await a.settle();
  assert.equal(h.inbox.filter((m) => m.t === 'skip').length, 0);
  assert.equal(a.inbox.filter((m) => m.t === 'error').length, 0, 'a late tap is no offence');

  const s2 = await startServer(t);
  const { h: h2, c } = await matchOfTwo(s2);
  h2.drain();
  c.send({ t: 'skip' }); // Zoe watches this match
  await h2.settle();
  assert.equal(h2.inbox.filter((m) => m.t === 'skip').length, 0);
});

test('a Skip with anything in it but its type is refused', async (t) => {
  const s = await startServer(t);
  const { h, a } = await matchOfTwo(s);
  h.drain();
  for (const extra of [{ slot: 1 }, { all: true }, { n: 1 }]) {
    a.send({ t: 'skip', ...extra });
    assert.equal((await a.next('error')).code, 'bad_message', JSON.stringify(extra));
  }
  await h.settle();
  assert.equal(h.inbox.filter((m) => m.t === 'skip').length, 0);
});

test('the host cannot send a Skip; it is a phone message', async (t) => {
  const s = await startServer(t);
  const { h } = await matchOfTwo(s);
  h.send({ t: 'skip' });
  assert.equal((await h.next('error')).code, 'not_host');
});

test('the intro screen message the host sends to phones is checked field by field', () => {
  const good = [
    { t: 'phase', name: 'intro', stage: 'beach', slots: [0, 1], endsIn: 20, skipped: [] },
    { t: 'phase', name: 'intro', stage: 'bairro', slots: [0, 1, 2, 3], endsIn: 3, skipped: [0, 2] },
    { t: 'phase', name: 'intro' },
  ];
  for (const m of good) assert.equal(relayProblem(m), false, JSON.stringify(m));
  const bad = [
    { t: 'phase', name: 'intro', stage: 'moon' },
    { t: 'phase', name: 'intro', slots: [7] },
    { t: 'phase', name: 'intro', skipped: [0, 1, 2, 3, 0] },
    { t: 'phase', name: 'intro', skipped: ['ana'] },
    { t: 'phase', name: 'intro', endsIn: 400 },
    { t: 'phase', name: 'intro', endsIn: -1 },
    { t: 'phase', name: 'intro', items: ['nata'] },
  ];
  for (const m of bad) assert.equal(relayProblem(m), true, JSON.stringify(m));
});

test('a phone that rejoins during the intro is shown the intro again', async (t) => {
  const s = await startServer(t);
  const { h, a } = await matchOfTwo(s);
  const intro = { t: 'phase', name: 'intro', stage: 'beach', slots: [0, 1], endsIn: 18, skipped: [] };
  h.send({ t: 'to', slot: 'all', msg: intro });
  assert.deepEqual(await a.next('phase'), intro);
  await a.close();
  await h.next('roster');
  const again = await s.open();
  again.send({ t: 'join', room: h.code, token: a.token });
  await again.next('joined');
  assert.deepEqual(await again.next('phase'), intro);
});
