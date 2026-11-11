// Dropping and coming back: phones, the host page, and one phone per account.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, sampleResult } from '../helpers/server.js';
import { LIMITS } from '../../server/config.js';

test('a phone that drops in the lobby keeps its slot for 30 s and rejoins with its token', async (t) => {
  mock.timers.enable({ apis: ['setTimeout'] });
  t.after(() => mock.timers.reset());
  const s = await startServer(t);
  const h = await s.host();
  const a = await s.player(h, 'Ana', { fighter: 'surfer_girl' });
  const b = await s.player(h, 'Max');
  await a.close();
  let roster = await h.next('roster');
  assert.deepEqual(roster.players.map((p) => [p.gamertag, p.connected]), [['Ana', false], ['Max', true]]);
  mock.timers.tick(LIMITS.slotHoldMs - 1000);
  const again = await s.open();
  again.send({ t: 'join', room: h.code, token: a.token });
  const joined = await again.next('joined');
  assert.equal(joined.slot, 0, 'the same slot');
  assert.equal(joined.fighter, 'surfer_girl', 'the pick was kept');
  roster = await h.next('roster');
  assert.deepEqual(roster.players.map((p) => p.connected), [true, true]);
  mock.timers.tick(LIMITS.slotHoldMs * 2);
  assert.ok(s.app.rooms.rooms.get(h.code).slots[0], 'the old timer does not remove the returned player');
  assert.equal(b.ws.readyState, 1);
});

test('a phone that stays away longer than 30 s in the lobby loses its slot', async (t) => {
  mock.timers.enable({ apis: ['setTimeout'] });
  t.after(() => mock.timers.reset());
  const s = await startServer(t);
  const h = await s.host();
  const a = await s.player(h, 'Ana');
  await s.player(h, 'Max');
  await a.close();
  await h.next('roster');
  mock.timers.tick(LIMITS.slotHoldMs + 1);
  const roster = await h.next('roster');
  assert.deepEqual(roster.players.map((p) => p.gamertag), ['Max']);
  // The freed slot goes to the next player.
  const c = await s.player(h, 'Cleo');
  assert.equal(c.slot, 0);
});

test('during a match a dropped player keeps the slot until the match ends and can rejoin any time', async (t) => {
  mock.timers.enable({ apis: ['setTimeout'] });
  t.after(() => mock.timers.reset());
  const s = await startServer(t);
  const h = await s.host();
  const a = await s.player(h, 'Ana', { fighter: 'finance_bro' });
  await s.player(h, 'Max', { fighter: 'house_dj' });
  h.send({ t: 'match_start', stage: 'campus', lives: 3, slots: [0, 1], guests: 0 });
  const { matchId } = await h.next('match_started');
  await h.next('roster');
  h.send({ t: 'to', slot: 'all', msg: { t: 'phase', name: 'match', stage: 'campus' } });
  h.send({ t: 'to', slot: 0, msg: { t: 'status', pct: 87, lives: 2 } });
  await a.next('status');
  await a.close();
  assert.equal((await h.next('roster')).players[0].connected, false);
  mock.timers.tick(LIMITS.slotHoldMs * 10); // far longer than the lobby hold
  assert.ok(s.app.rooms.rooms.get(h.code).slots[0], 'still has the slot mid-match');

  const again = await s.open();
  again.send({ t: 'join', room: h.code, token: a.token });
  const joined = await again.next('joined');
  assert.equal(joined.slot, 0);
  assert.equal(joined.phase, 'match');
  // The server replays the current screen and the player's last status.
  assert.equal((await again.next('phase')).name, 'match');
  assert.deepEqual(await again.next('status'), { t: 'status', pct: 87, lives: 2 });
  again.send({ t: 'input', m: 2, q: 1 });
  assert.equal((await h.next('input')).slot, 0);

  // A player who is still away when the match ends gets the normal 30 s after it.
  await again.close();
  await h.next('roster', { match: (r) => r.players[0].connected === false });
  s.clock.now += 90_000;
  h.send({ t: 'match_result', matchId, result: sampleResult() });
  await h.next('result_saved');
  assert.ok(s.app.rooms.rooms.get(h.code).slots[0]);
  mock.timers.tick(LIMITS.slotHoldMs + 1);
  assert.equal(s.app.rooms.rooms.get(h.code).slots[0], null);
});

test('a phone-specific screen (results) wins over the general one when rejoining, until the host sets a new one', async (t) => {
  const s = await startServer(t);
  const h = await s.host();
  const a = await s.player(h, 'Ana');
  h.send({ t: 'to', slot: 'all', msg: { t: 'phase', name: 'match' } });
  h.send({ t: 'to', slot: 0, msg: { t: 'phase', name: 'results', place: 1 } });
  await a.next('phase', { match: (m) => m.name === 'results' });
  await a.close();
  await h.next('roster');
  let again = await s.open();
  again.send({ t: 'join', room: h.code, token: a.token });
  await again.next('joined');
  assert.equal((await again.next('phase')).name, 'results');
  h.send({ t: 'to', slot: 'all', msg: { t: 'phase', name: 'lobby' } });
  await again.next('phase', { match: (m) => m.name === 'lobby' });
  await again.close();
  again = await s.open();
  again.send({ t: 'join', room: h.code, token: a.token });
  await again.next('joined');
  assert.equal((await again.next('phase')).name, 'lobby');
});

test('one phone per account: a second login signs the first phone out with a clear message', async (t) => {
  const s = await startServer(t);
  const h = await s.host();
  const first = await s.player(h, 'Ana', { fighter: 'house_dj' });
  // The same gamertag logs in on another phone.
  const login = await s.api('/api/login', { gamertag: 'Ana', pin: '1234' });
  assert.equal(login.status, 200);
  const out = await first.next('signed_out');
  assert.match(out.msg, /another phone/);
  assert.equal(await first.closed, 4001);
  // The old token no longer works ...
  const stale = await s.open();
  stale.send({ t: 'join', room: h.code, token: first.token });
  assert.equal((await stale.next('error')).code, 'signed_out');
  // ... and the new phone takes over the same slot and pick.
  const second = await s.open();
  second.send({ t: 'join', room: h.code, token: login.data.token });
  const joined = await second.next('joined');
  assert.equal(joined.slot, first.slot);
  assert.equal(joined.fighter, 'house_dj');
});

test('the same token opened twice (two tabs): the newer connection wins', async (t) => {
  const s = await startServer(t);
  const h = await s.host();
  const first = await s.player(h, 'Ana');
  const second = await s.open();
  second.send({ t: 'join', room: h.code, token: first.token });
  assert.equal((await second.next('joined')).slot, 0);
  assert.equal((await first.next('signed_out')).code, 'signed_out');
  h.send({ t: 'room_set', closed: false });
  const roster = await h.next('roster', { match: (r) => r.players.length === 1 && r.players[0].connected });
  assert.equal(roster.players.length, 1);
});

test('a player who taps Leave frees the slot at once', async (t) => {
  const s = await startServer(t);
  const h = await s.host();
  const a = await s.player(h, 'Ana');
  a.send({ t: 'leave' });
  await a.next('left');
  assert.equal((await h.next('roster')).players.length, 0);
  // ... and can join again later on the same connection.
  a.send({ t: 'join', room: h.code, token: a.token });
  assert.equal((await a.next('joined')).slot, 0);
});

test('the host page can reconnect with its key and gets its room back', async (t) => {
  mock.timers.enable({ apis: ['setTimeout'] });
  t.after(() => mock.timers.reset());
  const s = await startServer(t);
  const h = await s.host();
  const a = await s.player(h, 'Ana', { fighter: 'finance_bro' });
  await s.player(h, 'Max', { fighter: 'house_dj' });
  h.send({ t: 'match_start', stage: 'campus', lives: 3, slots: [0, 1], guests: 0 });
  const { matchId } = await h.next('match_started');
  await h.close();
  assert.deepEqual(await a.next('host'), { t: 'host', connected: false });
  mock.timers.tick(LIMITS.hostHoldMs - 1000);
  const back = await s.open();
  back.send({ t: 'host_resume', code: h.code, hostKey: h.hostKey });
  const room = await back.next('room');
  assert.deepEqual([room.code, room.resumed, room.phase, room.matchId], [h.code, true, 'match', matchId]);
  assert.equal((await back.next('roster')).players.length, 2);
  assert.deepEqual(await a.next('host'), { t: 'host', connected: true });
  mock.timers.tick(LIMITS.hostHoldMs * 2);
  assert.ok(s.app.rooms.rooms.has(h.code), 'the room survived');
  // The match goes on: inputs reach the new host connection.
  a.send({ t: 'input', m: 4, q: 9 });
  assert.equal((await back.next('input')).m, 4);
});

test('a room whose host stays away for a minute is closed and the phones are told', async (t) => {
  mock.timers.enable({ apis: ['setTimeout'] });
  t.after(() => mock.timers.reset());
  const s = await startServer(t);
  const h = await s.host();
  const a = await s.player(h, 'Ana');
  await h.close();
  await a.next('host');
  mock.timers.tick(LIMITS.hostHoldMs + 1);
  const closed = await a.next('closed');
  assert.match(closed.msg, /host left/);
  assert.equal(s.app.rooms.rooms.size, 0);
  const late = await s.open();
  late.send({ t: 'host_resume', code: h.code, hostKey: h.hostKey });
  assert.equal((await late.next('error')).code, 'room_gone');
});

test('rooms nobody uses for hours are removed', async (t) => {
  const s = await startServer(t);
  const h = await s.host();
  const a = await s.player(h, 'Ana');
  s.clock.now += LIMITS.roomIdleMs - 1000;
  s.app.rooms.sweep();
  assert.equal(s.app.rooms.rooms.size, 1);
  s.clock.now += 2000;
  s.app.rooms.sweep();
  assert.equal(s.app.rooms.rooms.size, 0);
  assert.match((await a.next('closed')).msg, /nothing happened/);
});
