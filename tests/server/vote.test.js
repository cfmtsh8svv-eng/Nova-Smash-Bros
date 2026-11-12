// The map vote (GAME_SPEC §10a, D-135, D-136): the room's vote phase, who may vote,
// and that the match after a vote starts on a stage with the most votes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../helpers/server.js';
import { relayProblem } from '../../server/rooms.js';

// A host with two ready players (Ana on slot 0, Max on slot 1).
async function lobbyOfTwo(s) {
  const h = await s.host();
  const a = await s.player(h, 'Ana', { fighter: 'finance_bro' });
  const b = await s.player(h, 'Max', { fighter: 'house_dj' });
  return { h, a, b };
}

async function startVote(h, slots = [0, 1]) {
  h.send({ t: 'vote_start', slots });
  await h.next('vote_started');
  await h.next('roster', { match: (r) => r.phase === 'vote' });
}

test('a stage vote is accepted only during the vote phase', async (t) => {
  const s = await startServer(t);
  const { h, a } = await lobbyOfTwo(s);
  // In the lobby: refused, and the host hears nothing.
  a.send({ t: 'vote', kind: 'stage', value: 'beach' });
  assert.equal((await a.next('error')).code, 'bad_message');
  await startVote(h);
  a.send({ t: 'vote', kind: 'stage', value: 'beach' });
  assert.deepEqual(await h.next('vote'), { t: 'vote', slot: 0, kind: 'stage', value: 'beach' });
  // After the match has started: refused again.
  h.send({ t: 'match_start', stage: 'beach', lives: 3, slots: [0, 1] });
  await h.next('match_started');
  h.drain();
  a.send({ t: 'vote', kind: 'stage', value: 'campus' });
  assert.equal((await a.next('error')).code, 'bad_message');
  await h.settle();
  assert.equal(h.inbox.filter((m) => m.t === 'vote').length, 0);
});

test('an unknown stage is refused in the vote', async (t) => {
  const s = await startServer(t);
  const { h, a } = await lobbyOfTwo(s);
  await startVote(h);
  for (const value of ['moon', '', null, 3, 'CAMPUS', '__proto__']) {
    a.send({ t: 'vote', kind: 'stage', value });
    assert.equal((await a.next('error')).code, 'bad_message', String(value));
  }
  await h.settle();
  assert.equal(h.inbox.filter((m) => m.t === 'vote').length, 0);
  assert.equal(s.app.rooms.rooms.get(h.code).vote.votes.size, 0);
});

test('a second vote replaces the first', async (t) => {
  const s = await startServer(t);
  const { h, a, b } = await lobbyOfTwo(s);
  await startVote(h);
  a.send({ t: 'vote', kind: 'stage', value: 'beach' });
  await h.next('vote');
  a.send({ t: 'vote', kind: 'stage', value: 'bairro' });
  assert.deepEqual(await h.next('vote'), { t: 'vote', slot: 0, kind: 'stage', value: 'bairro' });
  b.send({ t: 'vote', kind: 'stage', value: 'bairro' });
  await h.next('vote');
  assert.deepEqual([...s.app.rooms.rooms.get(h.code).vote.votes], [[0, 'bairro'], [1, 'bairro']]);
  // The beach has no vote left, so a match there is refused; Bairro Alto is accepted.
  h.send({ t: 'match_start', stage: 'beach', lives: 3, slots: [0, 1] });
  const err = await h.next('error');
  assert.equal(err.code, 'bad_start');
  assert.match(err.msg, /most votes/);
  h.send({ t: 'match_start', stage: 'bairro', lives: 3, slots: [0, 1] });
  assert.ok((await h.next('match_started')).matchId);
  assert.equal(s.app.rooms.rooms.get(h.code).vote, null);
});

test('a tie or no votes at all: any of the tied stages may be started', async (t) => {
  const s = await startServer(t);
  const { h, a, b } = await lobbyOfTwo(s);
  await startVote(h);
  a.send({ t: 'vote', kind: 'stage', value: 'beach' });
  b.send({ t: 'vote', kind: 'stage', value: 'campus' });
  await h.next('vote');
  await h.next('vote');
  h.send({ t: 'match_start', stage: 'bairro', lives: 3, slots: [0, 1] });
  assert.equal((await h.next('error')).code, 'bad_start', 'not among the tied');
  h.send({ t: 'match_start', stage: 'campus', lives: 3, slots: [0, 1] });
  assert.ok((await h.next('match_started')).matchId);

  const s2 = await startServer(t);
  const two = await lobbyOfTwo(s2);
  await startVote(two.h);
  two.h.send({ t: 'match_start', stage: 'bairro', lives: 2, slots: [0, 1] });
  assert.ok((await two.h.next('match_started')).matchId, 'nobody voted: every stage is tied');
});

test('the vote starts like a match: at least 2 ready players, only the host, only from the lobby', async (t) => {
  const s = await startServer(t);
  const h = await s.host();
  const a = await s.player(h, 'Ana', { fighter: 'finance_bro' });
  const b = await s.player(h, 'Max'); // still choosing
  h.send({ t: 'vote_start', slots: [0] });
  assert.match((await h.next('error')).msg, /At least 2 players/);
  h.send({ t: 'vote_start', slots: [0, 1] });
  assert.match((await h.next('error')).msg, /Max has not picked a fighter/);
  for (const slots of ['all', [0, 0], [0, 9], null, [0, 1, 2, 3, 0]]) {
    h.send({ t: 'vote_start', slots });
    assert.equal((await h.next('error')).code, 'bad_message', JSON.stringify(slots));
  }
  a.send({ t: 'vote_start', slots: [0, 1] });
  assert.equal((await a.next('error')).code, 'not_host');
  b.send({ t: 'pick', fighter: 'house_dj', ready: true });
  await h.next('roster');
  await startVote(h);
  h.send({ t: 'vote_start', slots: [0, 1] });
  assert.match((await h.next('error')).msg, /already running/);
  assert.equal(s.app.rooms.rooms.get(h.code).phase, 'vote');
});

test('a player who joins during the vote sits it out; picks are frozen; the match takes only the voters', async (t) => {
  const s = await startServer(t);
  const { h, a } = await lobbyOfTwo(s);
  await startVote(h);
  const late = await s.player(h, 'Zoe');
  assert.equal(late.slot, 2);
  late.send({ t: 'vote', kind: 'stage', value: 'beach' });
  assert.equal((await late.next('error')).code, 'bad_message', 'not in the vote');
  late.send({ t: 'pick', fighter: 'surfer_girl', ready: true });
  assert.match((await late.next('error')).msg, /vote/);
  a.send({ t: 'pick', fighter: 'lisboa_og', ready: true });
  assert.match((await a.next('error')).msg, /vote/);
  h.send({ t: 'match_start', stage: 'campus', lives: 3, slots: [0, 1, 2] });
  assert.match((await h.next('error')).msg, /not in the vote/);
  h.send({ t: 'match_start', stage: 'campus', lives: 3, slots: [0, 1] });
  assert.ok((await h.next('match_started')).matchId);
});

test('a player who disconnects or leaves during the vote loses their vote', async (t) => {
  const s = await startServer(t);
  const h = await s.host();
  const a = await s.player(h, 'Ana', { fighter: 'finance_bro' });
  const b = await s.player(h, 'Max', { fighter: 'house_dj' });
  const c = await s.player(h, 'Zoe', { fighter: 'surfer_girl' });
  await startVote(h, [0, 1, 2]);
  a.send({ t: 'vote', kind: 'stage', value: 'campus' });
  b.send({ t: 'vote', kind: 'stage', value: 'beach' });
  c.send({ t: 'vote', kind: 'stage', value: 'beach' });
  for (let i = 0; i < 3; i++) await h.next('vote');
  await b.close();
  await h.next('roster', { match: (r) => r.players.some((p) => p.slot === 1 && !p.connected) });
  c.send({ t: 'leave' });
  await h.next('roster', { match: (r) => !r.players.some((p) => p.slot === 2) });
  const room = s.app.rooms.rooms.get(h.code);
  assert.deepEqual([...room.vote.votes], [[0, 'campus']]);
  assert.equal(room.phase, 'vote');
  h.send({ t: 'match_start', stage: 'beach', lives: 3, slots: [0, 1] });
  assert.match((await h.next('error')).msg, /most votes/, 'the beach lost the votes of the two who went');
  h.send({ t: 'match_start', stage: 'campus', lives: 3, slots: [0, 1] });
  assert.ok((await h.next('match_started')).matchId, 'Max still holds his slot: he is in the match');
});

test('vote_cancel goes back to the lobby; outside a vote it changes nothing', async (t) => {
  const s = await startServer(t);
  const { h, a } = await lobbyOfTwo(s);
  h.send({ t: 'vote_cancel' });
  await h.settle();
  assert.equal(s.app.rooms.rooms.get(h.code).phase, 'lobby');
  assert.equal(h.inbox.filter((m) => m.t === 'error').length, 0, 'a late cancel is no offence');
  await startVote(h);
  h.send({ t: 'vote_cancel' });
  await h.next('roster', { match: (r) => r.phase === 'lobby' });
  assert.equal(s.app.rooms.rooms.get(h.code).vote, null);
  a.send({ t: 'vote', kind: 'stage', value: 'beach' });
  assert.equal((await a.next('error')).code, 'bad_message');
  assert.equal(s.app.rooms.rooms.get(h.code).slots[0].ready, true, 'nobody has to ready up again');
});

test('a host page that comes back during the vote is told the room is in the vote', async (t) => {
  const s = await startServer(t);
  const { h } = await lobbyOfTwo(s);
  await startVote(h);
  const again = await s.open();
  await h.close();
  again.send({ t: 'host_resume', code: h.code, hostKey: h.hostKey });
  const room = await again.next('room');
  assert.equal(room.resumed, true);
  assert.equal(room.phase, 'vote');
});

test('the vote screen message the host sends to phones is checked field by field', () => {
  const good = [
    { t: 'phase', name: 'vote', stages: ['campus', 'beach', 'bairro'], slots: [0, 1], endsIn: 10 },
    { t: 'phase', name: 'vote', stages: ['campus', 'beach', 'bairro'], slots: [0, 1, 2, 3], endsIn: 0, winner: 'beach' },
    { t: 'phase', name: 'lobby' },
  ];
  for (const m of good) assert.equal(relayProblem(m), false, JSON.stringify(m));
  const bad = [
    { t: 'phase', name: 'vote', stages: ['moon'] },
    { t: 'phase', name: 'vote', stages: ['campus', 'campus', 'campus', 'campus'] },
    { t: 'phase', name: 'vote', slots: [7] },
    { t: 'phase', name: 'vote', endsIn: 400 },
    { t: 'phase', name: 'vote', endsIn: -1 },
    { t: 'phase', name: 'vote', winner: 'moon' },
    { t: 'phase', name: 'vote', extra: 1 },
    { t: 'phase', name: 'lobby', vote: true }, // the stage buttons on the fighter select are gone
    { t: 'phase', name: 'lobby', stages: [{ id: 'campus', name: 'Nova SBE Campus' }] },
  ];
  for (const m of bad) assert.equal(relayProblem(m), true, JSON.stringify(m));
});
