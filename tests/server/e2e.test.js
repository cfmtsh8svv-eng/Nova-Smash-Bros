// End to end: the real server on a random port, one host and four controllers
// over real WebSockets, a whole match with the real game logic, and the result
// arriving in the store and on the leaderboard.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../helpers/server.js';
import { botInput } from '../helpers/bot.js';
import { createMatch, step, buildResult, phoneStatus } from '../../src/game/match.js';
import { InputBuffer, encodeInput } from '../../src/game/input.js';
import { matchPoints } from '../../src/game/scoring.js';

const FRAME_MS = 1000 / 60;

test('four phones register, join, pick, play a full match to a winner; the result reaches the store and the leaderboard', async (t) => {
  const s = await startServer(t);

  // --- lobby: host opens a room, four players register over HTTP and join over WebSocket
  const host = await s.host();
  const names = ['Ana', 'Max', 'Lea', 'Tom'];
  const fighters = ['finance_bro', 'surfer_girl', 'house_dj', 'lisboa_og'];
  const phones = [];
  for (let i = 0; i < 4; i++) {
    const res = await s.api('/api/register', { gamertag: names[i], pin: `${1000 + i}`, pin2: `${1000 + i}` });
    assert.equal(res.status, 201);
    // Log in again the way a returning player would, and use that session.
    const login = await s.api('/api/login', { gamertag: names[i], pin: `${1000 + i}` });
    assert.equal(login.status, 200);
    const phone = await s.open();
    phone.send({ t: 'join', room: host.code, token: login.data.token });
    const joined = await phone.next('joined');
    assert.equal(joined.slot, i);
    phone.send({ t: 'pick', fighter: fighters[i], ready: true });
    phones.push(Object.assign(phone, { slot: i, seq: 0, lastMask: -1, feedback: [], statuses: 0 }));
  }
  const roster = await host.next('roster', { match: (r) => r.players.length === 4 && r.players.every((p) => p.ready) });
  assert.deepEqual(roster.players.map((p) => p.fighter), fighters);

  // --- start: only the host can, and it gets a match id
  host.send({ t: 'match_start', stage: 'beach', lives: 2, slots: [0, 1, 2, 3], guests: 0 });
  const { matchId } = await host.next('match_started');
  host.send({ t: 'to', slot: 'all', msg: { t: 'phase', name: 'match', stage: 'beach' } });
  for (const phone of phones) assert.equal((await phone.next('phase')).name, 'match');

  // --- the match: the host runs the real simulation, fed by inputs that travel phone -> server -> host
  const state = createMatch({
    stageId: 'beach', seed: 4, settings: { lives: 2 },
    players: roster.players.map((p) => ({ slot: p.slot, name: p.gamertag, fighterId: p.fighter })),
  });
  const buffers = new Map(phones.map((p) => [p.slot, new InputBuffer()]));
  let received = 0;
  let sent = 0;
  let wake = null;
  host.ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.t !== 'input') return;
    assert.ok(buffers.get(msg.slot).receive(msg.m, msg.q), 'the host accepts the relayed input');
    received += 1;
    if (wake && received >= sent) wake();
  });
  for (const phone of phones) {
    phone.ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.t === 'feedback') phone.feedback.push(msg);
      if (msg.t === 'status') phone.statuses += 1;
    });
  }

  const kos = [];
  let guard = 0;
  while (state.phase !== 'ended') {
    assert.ok(guard++ < 60 * 60 * 8, 'the match ends within 8 minutes of game time');
    s.clock.now += FRAME_MS;
    // Each phone sends its buttons whenever they change.
    for (const phone of phones) {
      const mask = encodeInput(botInput(state, phone.slot));
      if (mask !== phone.lastMask) {
        phone.lastMask = mask;
        phone.seq += 1;
        sent += 1;
        phone.send({ t: 'input', m: mask, q: phone.seq });
      }
    }
    if (received < sent) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`inputs lost: sent ${sent}, received ${received}`)), 3000);
        wake = () => {
          clearTimeout(timer);
          wake = null;
          resolve();
        };
      });
    }
    const inputs = {};
    for (const [slot, buffer] of buffers) inputs[slot] = buffer.consume();
    for (const e of step(state, inputs)) {
      if (e.type === 'ko') kos.push(e);
      // Phone feedback goes back the other way: host -> server -> that one phone.
      if (e.type === 'feedback' && e.text) host.send({ t: 'to', slot: e.slot, msg: { t: 'feedback', kind: e.kind, text: e.text, flash: e.flash, vibrate: e.vibrate } });
    }
    if (state.frame % 30 === 0) {
      for (const phone of phones) host.send({ t: 'to', slot: phone.slot, msg: { t: 'status', ...phoneStatus(state, phone.slot) } });
    }
  }

  const result = buildResult(state);
  assert.ok([0, 1, 2, 3].includes(result.winner));
  assert.equal(kos.length, result.players.reduce((n, p) => n + p.falls, 0));
  assert.ok(kos.length >= 6, 'three players lost both lives');
  assert.deepEqual(result.players.map((p) => p.place).sort(), [1, 2, 3, 4]);

  // --- result: submitted by the host, checked and stored by the server
  host.send({ t: 'match_result', matchId, result });
  const saved = await host.next('result_saved', { timeout: 5000 });
  assert.equal(saved.stored, true);
  assert.equal(saved.note, '');
  for (const line of saved.players) {
    const mine = result.players.find((p) => p.slot === line.slot);
    assert.equal(line.gamertag, names[line.slot]);
    assert.equal(line.points, matchPoints(mine.place, mine.damageDealt));
  }
  const winnerName = names[result.winner];
  assert.ok(saved.players.find((p) => p.gamertag === winnerName).achievements.some((a) => a.id === 'first_win'));

  // --- the store has the match and every player's totals
  assert.equal(s.store.matches.size, 1);
  const row = s.store.matches.get(matchId);
  assert.deepEqual([row.stage, row.lives, row.winner, row.mode], ['beach', 2, winnerName, 'stock']);
  assert.equal(JSON.parse(row.players_json).length, 4);
  for (const p of result.players) {
    const player = s.store.players.get(names[p.slot].toLowerCase());
    assert.deepEqual(
      [player.matches, player.wins, player.points, player.kos, player.falls, player.damage_dealt, player.damage_taken],
      [1, p.place === 1 ? 1 : 0, matchPoints(p.place, p.damageDealt), p.kos, p.falls, p.damageDealt, p.damageTaken],
    );
  }

  // --- and the leaderboard shows all four, ranked by points
  const board = await s.api('/api/leaderboard');
  assert.equal(board.data.players.length, 4);
  const points = board.data.players.map((p) => p.points);
  assert.deepEqual(points, [...points].sort((a, b) => b - a));
  assert.equal(board.data.players[0].points, Math.max(...saved.players.map((p) => p.points)));
  assert.deepEqual(saved.leaderboard, board.data.players);

  // --- every phone got its own feedback and status during the match
  await Promise.all(phones.map((p) => p.settle()));
  for (const phone of phones) {
    assert.ok(phone.statuses > 0, `${names[phone.slot]} received status updates`);
    const lost = result.players.find((p) => p.slot === phone.slot).falls;
    assert.equal(phone.feedback.filter((f) => f.kind === 'ko' || f.kind === 'out').length, lost, `${names[phone.slot]} was told about each of their KOs`);
    assert.equal(phone.feedback.filter((f) => f.kind === 'finalKo').length, 1);
  }

  // --- the room is back in the lobby and the same result cannot be sent twice
  host.send({ t: 'match_result', matchId, result });
  assert.equal((await host.next('error')).code, 'no_match');
  assert.equal(s.app.rooms.rooms.get(host.code).phase, 'lobby');
  assert.equal(s.store.matches.size, 1);
});
