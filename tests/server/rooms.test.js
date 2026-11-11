// Rooms and the WebSocket protocol: who may do what, and that bad messages are dropped.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, sampleResult, sleep } from '../helpers/server.js';
import { createToken } from '../../server/accounts.js';
import { LIMITS } from '../../server/config.js';
import { BIT } from '../../src/game/input.js';

// Two ready players and a started match. Returns the match id.
async function startedMatch(s, { lives = 3, stage = 'campus' } = {}) {
  const h = await s.host();
  const a = await s.player(h, 'Ana', { fighter: 'finance_bro' });
  const b = await s.player(h, 'Max', { fighter: 'house_dj' });
  h.send({ t: 'match_start', stage, lives, slots: [a.slot, b.slot], guests: 0 });
  const { matchId } = await h.next('match_started');
  await h.next('roster');
  return { h, a, b, matchId };
}

test('a host gets a room with a 4-letter code', async (t) => {
  const s = await startServer(t);
  const h = await s.host();
  assert.match(h.code, /^[A-HJ-NP-Z]{4}$/);
  assert.equal(s.app.rooms.rooms.size, 1);
});

test('players join with their session token and get the first free slot', async (t) => {
  const s = await startServer(t);
  const h = await s.host();
  const a = await s.player(h, 'Ana');
  const b = await s.player(h, 'Max');
  assert.deepEqual([a.slot, b.slot], [0, 1]);
  h.send({ t: 'room_set', closed: false });
  const roster = await h.next('roster');
  assert.deepEqual(roster.players.map((p) => [p.slot, p.gamertag, p.connected, p.fighter, p.ready]), [[0, 'Ana', true, null, false], [1, 'Max', true, null, false]]);
});

test('joining a room that does not exist is refused', async (t) => {
  const s = await startServer(t);
  const token = await s.register('Ana');
  for (const room of ['ZZZZ', 'abcd', 'AB', '', null, 12, 'ABCDE', '../x']) {
    const p = await s.open();
    p.send({ t: 'join', room, token });
    const err = await p.next('error');
    assert.equal(err.code, 'room_not_found');
    assert.match(err.msg, /Room not found/);
  }
});

test('a fifth player sees "Room full"', async (t) => {
  const s = await startServer(t);
  const h = await s.host();
  for (const name of ['One', 'Two', 'Three', 'Four']) await s.player(h, name);
  const fifth = await s.open();
  fifth.send({ t: 'join', room: h.code, token: await s.register('Five') });
  const err = await fifth.next('error');
  assert.equal(err.code, 'room_full');
  assert.match(err.msg, /Room full/);
  h.send({ t: 'room_set', closed: false });
  assert.equal((await h.next('roster')).players.length, 4);
});

test('joining is refused without a token, with a tampered one and with an expired one', async (t) => {
  const s = await startServer(t);
  const h = await s.host();
  const good = await s.register('Ana');
  const expired = createToken('Ana', 'sid', 'test-session-secret-0123456789', s.clock.now - LIMITS.sessionMs - 1000);
  const forged = createToken('Ana', 'sid', 'some-other-secret', s.clock.now);
  const tampered = good.slice(0, -2) + (good.endsWith('AA') ? 'BB' : 'AA');
  const ghost = createToken('Ghost', 'sid', 'test-session-secret-0123456789', s.clock.now); // valid signature, no such player
  for (const token of [undefined, '', 'nonsense', expired, forged, tampered, ghost, 42, { a: 1 }]) {
    const p = await s.open();
    p.send({ t: 'join', room: h.code, token });
    assert.equal((await p.next('error')).code, 'bad_token');
  }
  h.send({ t: 'room_set', closed: false });
  assert.equal((await h.next('roster')).players.length, 0);
});

test('a closed room lets nobody new in, but a player who was in can come back', async (t) => {
  const s = await startServer(t);
  const h = await s.host();
  const a = await s.player(h, 'Ana');
  h.send({ t: 'room_set', closed: true });
  assert.equal((await h.next('roster')).closed, true);
  const late = await s.open();
  late.send({ t: 'join', room: h.code, token: await s.register('Late') });
  const err = await late.next('error');
  assert.equal(err.code, 'room_closed');
  // Ana's phone drops and reconnects with her token.
  await a.close();
  await h.next('roster');
  const again = await s.open();
  again.send({ t: 'join', room: h.code, token: a.token });
  assert.equal((await again.next('joined')).slot, 0);
});

// ---- access control ----

test('a player cannot start a match, submit a result, close the room or talk to other phones', async (t) => {
  const s = await startServer(t);
  const h = await s.host();
  const a = await s.player(h, 'Ana', { fighter: 'finance_bro' });
  await s.player(h, 'Max', { fighter: 'house_dj' });
  const tries = [
    { t: 'match_start', stage: 'campus', lives: 3, slots: [0, 1], guests: 0 },
    { t: 'match_result', matchId: 'x', result: sampleResult() },
    { t: 'match_abort', matchId: 'x' },
    { t: 'room_set', closed: true },
    { t: 'to', slot: 1, msg: { t: 'feedback', kind: 'ko', text: 'You lose' } },
    { t: 'host_resume', code: h.code, hostKey: 'guess' },
    { t: 'host_create' },
  ];
  for (const msg of tries) {
    a.send(msg);
    const err = await a.next('error');
    assert.equal(err.code, 'not_host', msg.t);
    assert.match(err.msg, /Only the host/);
  }
  await a.settle();
  const room = s.app.rooms.rooms.get(h.code);
  assert.equal(room.phase, 'lobby');
  assert.equal(room.closed, false);
  assert.equal(room.match, null);
  assert.equal(s.store.matches.size, 0);
});

test('a socket that has not joined anything cannot send game messages', async (t) => {
  const s = await startServer(t);
  const h = await s.host();
  const stranger = await s.open();
  for (const msg of [{ t: 'input', m: 1, q: 1 }, { t: 'pick', fighter: 'house_dj', ready: true }, { t: 'match_start', stage: 'campus', lives: 3, slots: [], guests: 2 }, { t: 'to', slot: 'all', msg: { t: 'phase', name: 'match' } }]) {
    stranger.send(msg);
    assert.equal((await stranger.next('error')).code, 'not_joined');
  }
  await h.settle();
  assert.equal(h.inbox.length, 0, 'the host saw nothing of it');
});

test('a host cannot touch another host\'s room', async (t) => {
  const s = await startServer(t);
  const h1 = await s.host();
  const h2 = await s.host();
  const a = await s.player(h1, 'Ana', { fighter: 'finance_bro' });
  const b = await s.player(h1, 'Max', { fighter: 'house_dj' });
  // h2 has no players: starting with h1's slots fails, and nothing reaches h1's phones.
  h2.send({ t: 'match_start', stage: 'campus', lives: 3, slots: [0, 1], guests: 0 });
  assert.equal((await h2.next('error')).code, 'bad_start');
  h2.send({ t: 'to', slot: 'all', msg: { t: 'phase', name: 'lobby' } });
  await h2.settle();
  await a.settle();
  assert.equal(a.inbox.length + b.inbox.length, 0);
  // Taking over the room needs the host key.
  const thief = await s.open();
  thief.send({ t: 'host_resume', code: h1.code, hostKey: 'A'.repeat(32) });
  assert.equal((await thief.next('error')).code, 'room_gone');
  thief.send({ t: 'host_resume', code: h1.code });
  assert.equal((await thief.next('error')).code, 'room_gone');
  assert.equal(s.app.rooms.rooms.get(h1.code).host.ws.readyState, 1, 'the real host is still connected');
});

// ---- starting a match ----

test('the host starts a match once two players have picked a fighter', async (t) => {
  const s = await startServer(t);
  const { h, matchId } = await startedMatch(s);
  assert.match(matchId, /^[0-9a-f-]{36}$/);
  assert.equal(s.app.rooms.rooms.get(h.code).phase, 'match');
});

test('starting is refused with too few players, unready players or bad settings', async (t) => {
  const s = await startServer(t);
  const h = await s.host();
  const a = await s.player(h, 'Ana', { fighter: 'finance_bro' });
  const b = await s.player(h, 'Max'); // has not picked
  const start = (over) => h.send({ t: 'match_start', stage: 'campus', lives: 3, slots: [a.slot, b.slot], guests: 0, ...over });

  start({});
  let err = await h.next('error');
  assert.equal(err.code, 'bad_start');
  assert.match(err.msg, /Max has not picked a fighter/);

  start({ slots: [a.slot] });
  assert.match((await h.next('error')).msg, /At least 2 players/);

  start({ slots: [a.slot, 3] });
  assert.match((await h.next('error')).msg, /not in the room/);

  for (const over of [{ stage: 'moon' }, { lives: 0 }, { lives: 4 }, { lives: '3' }, { guests: 3 }, { guests: -1 }, { slots: 'all' }, { slots: [0, 0] }, { slots: [0, 1, 2, 3, 0] }, { slots: [0, 9] }]) {
    start(over);
    assert.equal((await h.next('error')).code, 'bad_message', JSON.stringify(over));
  }
  assert.equal(s.app.rooms.rooms.get(h.code).phase, 'lobby');
});

test('a match can start with 2 or 3 of the players in the room, and with keyboard guests', async (t) => {
  const s = await startServer(t);
  const h = await s.host();
  const a = await s.player(h, 'Ana', { fighter: 'finance_bro' });
  await s.player(h, 'Max'); // still choosing: left out
  h.send({ t: 'match_start', stage: 'beach', lives: 2, slots: [a.slot], guests: 1 });
  assert.ok((await h.next('match_started')).matchId);
});

test('a second match cannot be started while one is running, and picks are frozen', async (t) => {
  const s = await startServer(t);
  const { h, a } = await startedMatch(s);
  h.send({ t: 'match_start', stage: 'campus', lives: 3, slots: [0, 1], guests: 0 });
  assert.match((await h.next('error')).msg, /already running/);
  a.send({ t: 'pick', fighter: 'surfer_girl', ready: true });
  assert.match((await a.next('error')).msg, /after this match/);
  assert.equal(s.app.rooms.rooms.get(h.code).slots[0].fighter, 'finance_bro');
});

// ---- results ----

test('the host submits a result: points, stats and the leaderboard are updated', async (t) => {
  const s = await startServer(t);
  const { h, matchId } = await startedMatch(s);
  s.clock.now += 90_000;
  h.send({ t: 'match_result', matchId, result: sampleResult() });
  const saved = await h.next('result_saved');
  assert.equal(saved.stored, true);
  assert.deepEqual(saved.players.map((p) => [p.gamertag, p.place, p.points]), [['Ana', 1, 130], ['Max', 2, 64]]);
  assert.deepEqual(saved.players[0].achievements.map((a) => a.name).sort(), ['First Win', 'Untouchable']);
  assert.deepEqual(saved.leaderboard.map((p) => [p.rank, p.gamertag, p.points]), [[1, 'Ana', 130], [2, 'Max', 64]]);
  const ana = s.store.players.get('ana');
  assert.deepEqual([ana.matches, ana.wins, ana.points, ana.kos, ana.falls, ana.damage_dealt, ana.damage_taken], [1, 1, 130, 3, 0, 300, 40]);
  assert.equal(s.store.matches.size, 1);
  assert.equal(s.store.matches.get(matchId).winner, 'Ana');
  assert.equal(s.app.rooms.rooms.get(h.code).phase, 'lobby');
  const board = await s.api('/api/leaderboard');
  assert.equal(board.data.players[0].gamertag, 'Ana');
});

test('a duplicate result for the same match is refused and counted once', async (t) => {
  const s = await startServer(t);
  const { h, matchId } = await startedMatch(s);
  s.clock.now += 90_000;
  h.send({ t: 'match_result', matchId, result: sampleResult() });
  h.send({ t: 'match_result', matchId, result: sampleResult() });
  await h.next('result_saved');
  const err = await h.next('error');
  assert.equal(err.code, 'no_match');
  assert.match(err.msg, /already saved/);
  assert.equal(s.store.matches.size, 1);
  assert.equal(s.store.players.get('ana').points, 130);
});

test('a result for a match id that was never started is refused', async (t) => {
  const s = await startServer(t);
  const h = await s.host();
  await s.player(h, 'Ana', { fighter: 'finance_bro' });
  await s.player(h, 'Max', { fighter: 'house_dj' });
  h.send({ t: 'match_result', matchId: '11111111-2222-3333-4444-555555555555', result: sampleResult() });
  assert.equal((await h.next('error')).code, 'no_match');
  const { matchId } = await (async () => {
    h.send({ t: 'match_start', stage: 'campus', lives: 3, slots: [0, 1], guests: 0 });
    return h.next('match_started');
  })();
  for (const wrong of ['other', null, 5, matchId + 'x']) {
    h.send({ t: 'match_result', matchId: wrong, result: sampleResult() });
    assert.equal((await h.next('error')).code, 'no_match');
  }
  assert.equal(s.store.matches.size, 0);
});

test('a result naming a player who is not in the room is refused', async (t) => {
  const s = await startServer(t);
  const { h, matchId } = await startedMatch(s);
  s.clock.now += 90_000;
  h.send({ t: 'match_result', matchId, result: sampleResult({ slots: [0, 3] }) });
  const err = await h.next('error');
  assert.equal(err.code, 'bad_result');
  assert.match(err.msg, /missing from the result/);
  assert.equal(s.store.matches.size, 0);
  assert.equal(s.store.players.get('ana').points, 0);
});

test('an implausible result is refused and nothing is stored', async (t) => {
  const s = await startServer(t);
  const { h, matchId } = await startedMatch(s);
  // Sent one second after the start, claiming a 60 second match.
  s.clock.now += 1000;
  h.send({ t: 'match_result', matchId, result: sampleResult() });
  assert.match((await h.next('error')).msg, /longer than the time since it started/);
  // Later, with absurd numbers.
  s.clock.now += 90_000;
  const absurd = sampleResult();
  absurd.players[0].damageDealt = 99999;
  h.send({ t: 'match_result', matchId, result: absurd });
  assert.equal((await h.next('error')).code, 'bad_result');
  assert.equal(s.store.matches.size, 0);
  // The match is still open: the honest result is accepted afterwards.
  h.send({ t: 'match_result', matchId, result: sampleResult() });
  assert.equal((await h.next('result_saved')).stored, true);
});

test('a match with fewer than two logged-in players gives no points', async (t) => {
  const s = await startServer(t);
  const h = await s.host();
  const a = await s.player(h, 'Ana', { fighter: 'finance_bro' });
  h.send({ t: 'match_start', stage: 'campus', lives: 3, slots: [a.slot], guests: 1 });
  const { matchId } = await h.next('match_started');
  s.clock.now += 90_000;
  h.send({ t: 'match_result', matchId, result: sampleResult({ slots: [0, 1] }) });
  const saved = await h.next('result_saved');
  assert.equal(saved.stored, false);
  assert.match(saved.note, /Practice match/);
  assert.deepEqual(saved.players.map((p) => p.points), [0, 0]);
  assert.equal(s.store.matches.size, 0);
  assert.equal(s.store.players.get('ana').points, 0);
});

test('aborting a match returns to the lobby without a result', async (t) => {
  const s = await startServer(t);
  const { h, matchId } = await startedMatch(s);
  h.send({ t: 'match_abort', matchId: 'wrong' });
  assert.equal((await h.next('error')).code, 'no_match');
  h.send({ t: 'match_abort', matchId });
  const roster = await h.next('roster');
  assert.equal(roster.phase, 'lobby');
  assert.deepEqual(roster.players.map((p) => p.ready), [false, false], 'everyone readies up again');
  assert.equal(s.store.matches.size, 0);
});

// ---- relay ----

test('inputs travel from a phone to the host with the sender\'s slot; only during a match', async (t) => {
  const s = await startServer(t);
  const h = await s.host();
  const a = await s.player(h, 'Ana', { fighter: 'finance_bro' });
  const b = await s.player(h, 'Max', { fighter: 'house_dj' });
  b.send({ t: 'input', m: BIT.jump, q: 1 });
  await b.settle();
  await h.settle();
  assert.equal(h.inbox.filter((m) => m.t === 'input').length, 0, 'no inputs in the lobby');
  h.send({ t: 'match_start', stage: 'campus', lives: 3, slots: [0, 1], guests: 0 });
  await h.next('match_started');
  b.send({ t: 'input', m: BIT.right | BIT.attack, q: 2, slot: 0 }); // a phone cannot pretend to be another slot
  assert.deepEqual(await h.next('input'), { t: 'input', slot: 1, m: BIT.right | BIT.attack, q: 2 });
  a.send({ t: 'input', m: 0, q: 1 });
  assert.equal((await h.next('input')).slot, 0);
});

test('the host sends status, phase and feedback to one phone or to all', async (t) => {
  const s = await startServer(t);
  const h = await s.host();
  const a = await s.player(h, 'Ana');
  const b = await s.player(h, 'Max');
  h.send({ t: 'to', slot: 1, msg: { t: 'feedback', kind: 'special', text: 'Blinded!', flash: '#ffffff' } });
  assert.equal((await b.next('feedback')).text, 'Blinded!');
  h.send({ t: 'to', slot: 'all', msg: { t: 'phase', name: 'match' } });
  assert.equal((await a.next('phase')).name, 'match');
  assert.equal((await b.next('phase')).name, 'match');
  assert.equal(a.inbox.filter((m) => m.t === 'feedback').length, 0, 'the feedback went to Max only');
});

test('the host can only relay the three known message types', async (t) => {
  const s = await startServer(t);
  const h = await s.host();
  const a = await s.player(h, 'Ana');
  for (const bad of [
    { t: 'to', slot: 0, msg: { t: 'joined', slot: 3 } },
    { t: 'to', slot: 0, msg: { t: 'signed_out' } },
    { t: 'to', slot: 0, msg: 'hello' },
    { t: 'to', slot: 7, msg: { t: 'phase' } },
    { t: 'to', slot: '0', msg: { t: 'phase' } },
    { t: 'to', msg: { t: 'phase' } },
    // the right type, but fields that do not belong there
    { t: 'to', slot: 0, msg: { t: 'phase', name: 'hacked' } },
    { t: 'to', slot: 0, msg: { t: 'phase' } },
    { t: 'to', slot: 0, msg: { t: 'feedback', kind: 'ko', vibrate: 'not-a-list' } },
    { t: 'to', slot: 0, msg: { t: 'feedback', kind: 'ko', vibrate: [999999] } },
    { t: 'to', slot: 0, msg: { t: 'feedback', kind: 'ko', flash: 'url(x)' } },
    { t: 'to', slot: 0, msg: { t: 'feedback', kind: 'ko', text: 'x'.repeat(161) } },
    { t: 'to', slot: 0, msg: { t: 'feedback', text: 'no kind' } },
    { t: 'to', slot: 0, msg: { t: 'feedback', kind: 'ko', extra: 'x'.repeat(301) } },
    { t: 'to', slot: 0, msg: { t: 'feedback', kind: 'ko', deep: { a: { b: { c: { d: 1 } } } } } },
    { t: 'to', slot: 0, msg: { t: 'status', pct: -5, lives: 3, state: 'alive', cd: 0, cdMax: 400 } },
    { t: 'to', slot: 0, msg: { t: 'status', pct: 10, lives: 9, state: 'alive', cd: 0, cdMax: 400 } },
    { t: 'to', slot: 0, msg: { t: 'status', pct: 10, lives: 3, state: 'winner', cd: 0, cdMax: 400 } },
    { t: 'to', slot: 0, msg: { t: 'status', pct: '10', lives: 3, state: 'alive', cd: 0, cdMax: 400 } },
  ]) {
    h.send(bad);
    assert.equal((await h.next('error')).code, 'bad_message');
  }
  await a.settle();
  assert.equal(a.inbox.length, 0);
});

test('fighter picks and votes are validated', async (t) => {
  const s = await startServer(t);
  const h = await s.host();
  const a = await s.player(h, 'Ana');
  for (const bad of [{ fighter: 'mario', ready: true }, { fighter: 5, ready: true }, { fighter: 'house_dj' }, { fighter: 'house_dj', ready: 'yes' }, {}]) {
    a.send({ t: 'pick', ...bad });
    assert.equal((await a.next('error')).code, 'bad_message');
  }
  a.send({ t: 'pick', fighter: null, ready: true }); // "ready" without a fighter changes nothing
  await a.settle();
  await h.settle();
  assert.equal(h.inbox.filter((m) => m.t === 'roster').length, 0);
  assert.equal(s.app.rooms.rooms.get(h.code).slots[0].ready, false, 'cannot be ready without a fighter');
  a.send({ t: 'pick', fighter: 'lisboa_og', ready: true });
  assert.deepEqual((await h.next('roster')).players[0], { slot: 0, gamertag: 'Ana', connected: true, fighter: 'lisboa_og', ready: true });

  a.send({ t: 'vote', kind: 'stage', value: 'beach' });
  assert.deepEqual(await h.next('vote'), { t: 'vote', slot: 0, kind: 'stage', value: 'beach' });
  for (const bad of [{ kind: 'stage', value: 'moon' }, { kind: 'hazard', value: 'wave' }, { kind: 'winner', value: 'me' }, { kind: 'stage' }]) {
    a.send({ t: 'vote', ...bad });
    assert.equal((await a.next('error')).code, 'bad_message', JSON.stringify(bad));
  }
});

// ---- malformed, oversized and unknown messages ----

test('malformed messages are dropped and the connection keeps working', async (t) => {
  const s = await startServer(t);
  const { h, a } = await startedMatch(s);
  const junk = ['', 'not json', '{', '[]', 'null', '42', '"text"', '{"no":"type"}', '{"t":5}', '{"t":["input"]}', '{"t":"input"}', '{"t":"input","m":999,"q":1}', '{"t":"input","m":"1","q":1}', '{"t":"input","m":1.5,"q":1}', '{"t":"input","m":1,"q":-1}', '{"t":"input","m":1}', '{"t":"__proto__"}', '{"t":"constructor"}', '{"t":"toString"}'];
  for (const raw of junk) {
    a.send(raw);
    assert.equal((await a.next('error')).code, 'bad_message', raw);
  }
  a.ws.send(Buffer.from([1, 2, 3, 4])); // binary
  assert.equal((await a.next('error')).code, 'bad_message');
  await h.settle();
  assert.equal(h.inbox.filter((m) => m.t === 'input').length, 0, 'none of it reached the host');
  a.send({ t: 'input', m: 1, q: 1 });
  assert.equal((await h.next('input')).m, 1, 'a valid message still goes through');
});

test('unknown message types are dropped', async (t) => {
  const s = await startServer(t);
  const { h, a } = await startedMatch(s);
  for (const type of ['hack', 'admin', 'result_saved', 'roster', 'x'.repeat(100)]) {
    a.send({ t: type });
    assert.equal((await a.next('error')).code, 'bad_message');
    h.send({ t: type });
    assert.equal((await h.next('error')).code, 'bad_message');
  }
});

test('oversized messages are dropped: 512 bytes for phones, 4 KB for the host', async (t) => {
  const s = await startServer(t);
  const { h, a } = await startedMatch(s);
  a.send(JSON.stringify({ t: 'input', m: 1, q: 1, pad: 'x'.repeat(600) }));
  assert.equal((await a.next('error')).code, 'bad_message');
  await h.settle();
  assert.equal(h.inbox.filter((m) => m.t === 'input').length, 0);
  // The host may send more than a phone ...
  const bigButFine = { t: 'phase', name: 'results', place: 1, note: 'n'.repeat(150), achievements: [...Array(8)].map(() => ({ name: 'a'.repeat(40), text: 'b'.repeat(80) })) };
  assert.ok(JSON.stringify(bigButFine).length > 1000);
  h.send({ t: 'to', slot: 0, msg: bigButFine });
  assert.equal((await a.next('phase')).name, 'results');
  // ... but anything over the hard limit closes the socket (the ws library refuses it).
  h.send(JSON.stringify({ t: 'to', slot: 0, msg: { t: 'phase', name: 'lobby', pad: 'x'.repeat(40_000) } }));
  assert.equal(await h.closed, 1009);
  assert.equal(s.app.server.listening, true, 'the server is still up');
});

test('a phone that floods the server is throttled and finally disconnected, without hurting others', async (t) => {
  const s = await startServer(t);
  const { h, a, b } = await startedMatch(s);
  for (let i = 0; i < 1200; i++) a.ws.send(`{"t":"input","m":1,"q":${i + 1}}`);
  const code = await Promise.race([a.closed, sleep(3000).then(() => 'still open')]);
  assert.equal(code, 1008);
  const passed = h.inbox.filter((m) => m.t === 'input').length;
  assert.ok(passed <= LIMITS.phoneMessagesPerSecond * 2 + 20, `${passed} inputs got through the bucket`);
  h.inbox.length = 0;
  b.send({ t: 'input', m: 2, q: 1 });
  assert.equal((await h.next('input')).slot, 1, 'the other player is unaffected');
});

test('ping is answered with pong (used to measure the connection)', async (t) => {
  const s = await startServer(t);
  const c = await s.open();
  c.send({ t: 'ping', n: 7 });
  assert.deepEqual(await c.next('pong'), { t: 'pong', n: 7 });
  c.send({ t: 'ping', n: 'x' });
  assert.deepEqual(await c.next('pong'), { t: 'pong', n: 0 });
});

test('a WebSocket from another website (wrong Origin) or on another path is refused', async (t) => {
  const s = await startServer(t);
  await assert.rejects(s.open({ Origin: 'https://evil.example' }), /403/);
  await assert.rejects(s.open({ Origin: 'not a url' }), /403/);
  const ok = await s.open({ Origin: `http://127.0.0.1:${s.port}` });
  assert.equal(ok.ws.readyState, 1);
  const { default: WebSocket } = await import('ws');
  await assert.rejects(new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${s.port}/other`);
    ws.once('open', resolve);
    ws.once('error', reject);
    ws.once('unexpected-response', (req, res) => reject(new Error(String(res.statusCode))));
  }), /403/);
});

test('creating rooms is rate limited per address', async (t) => {
  const s = await startServer(t);
  for (let i = 0; i < LIMITS.roomsPerMinutePerAddress; i++) await s.host();
  const extra = await s.open();
  extra.send({ t: 'host_create' });
  assert.equal((await extra.next('error')).code, 'busy');
  assert.equal(s.app.rooms.rooms.size, LIMITS.roomsPerMinutePerAddress);
});
