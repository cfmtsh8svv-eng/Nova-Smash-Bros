// Bots in the room (GAME_SPEC §5a, D-156 to D-165): the host's `bots` message, the bench,
// the start rules with bots, the slots bots get, and results with bots in them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, sampleResult } from '../helpers/server.js';
import { checkResult } from '../../server/results.js';

const bots = (roster) => roster.players.filter((p) => p.bot).map((p) => [p.slot, p.name, p.fighter]);
const humans = (roster) => roster.players.filter((p) => !p.bot).map((p) => p.gamertag);
const setBots = async (h, fighters) => {
  h.send({ t: 'bots', fighters });
  return h.next('roster');
};

test('the host adds bots: names in order, the free slots, always ready', async (t) => {
  const s = await startServer(t);
  const h = await s.host();
  await s.player(h, 'Ana', { fighter: 'finance_bro' });
  let roster = await setBots(h, ['house_dj']);
  assert.deepEqual(bots(roster), [[1, 'Freshman', 'house_dj']]);
  roster = await setBots(h, ['house_dj', 'surfer_girl', 'lisboa_og']);
  assert.deepEqual(bots(roster), [[1, 'Freshman', 'house_dj'], [2, 'Intern', 'surfer_girl'], [3, 'Erasmus', 'lisboa_og']]);
  assert.ok(roster.players.filter((p) => p.bot).every((p) => p.ready));
  // Cycling a fighter keeps the names.
  roster = await setBots(h, ['house_dj', 'bairro_chad', 'lisboa_og']);
  assert.deepEqual(bots(roster)[1], [2, 'Intern', 'bairro_chad']);
  // Remove bot removes the one added last.
  roster = await setBots(h, ['house_dj', 'bairro_chad']);
  assert.deepEqual(bots(roster).map((b) => b[1]), ['Freshman', 'Intern']);
});

test('a bad bots message is a strike; too many for the humans or the wrong phase is refused', async (t) => {
  const s = await startServer(t);
  const h = await s.host();
  const a = await s.player(h, 'Ana', { fighter: 'finance_bro' });
  await s.player(h, 'Max', { fighter: 'house_dj' });
  for (const msg of [
    { t: 'bots' }, { t: 'bots', fighters: 'house_dj' }, { t: 'bots', fighters: ['moon_man'] }, { t: 'bots', fighters: [1] },
    { t: 'bots', fighters: ['house_dj', 'house_dj', 'house_dj', 'house_dj'] }, { t: 'bots', fighters: [], extra: 1 },
  ]) {
    h.send(msg);
    assert.equal((await h.next('error')).code, 'bad_message', JSON.stringify(msg));
  }
  // Two humans: at most two bots.
  h.send({ t: 'bots', fighters: ['house_dj', 'surfer_girl', 'lisboa_og'] });
  const err = await h.next('error');
  assert.equal(err.code, 'bad_bots');
  assert.match(err.msg, /no free place/);
  // A phone cannot send it.
  a.send({ t: 'bots', fighters: [] });
  assert.equal((await a.next('error')).code, 'not_host');
  // Not during a vote.
  h.send({ t: 'vote_start', slots: [0, 1] });
  await h.next('vote_started');
  h.send({ t: 'bots', fighters: ['house_dj'] });
  assert.match((await h.next('error')).msg, /only be changed in the lobby/);
  assert.equal(s.app.rooms.rooms.get(h.code).bots.length, 0);
});

test('a human who joins takes the last bot\'s place; when a human leaves, it comes back', async (t) => {
  const s = await startServer(t);
  const h = await s.host();
  await s.player(h, 'Ana', { fighter: 'finance_bro' });
  await setBots(h, ['house_dj', 'surfer_girl', 'lisboa_og']);
  const max = await s.player(h, 'Max');
  let roster = s.app.rooms.roster(s.app.rooms.rooms.get(h.code));
  assert.deepEqual(humans(roster), ['Ana', 'Max']);
  assert.deepEqual(bots(roster), [[2, 'Freshman', 'house_dj'], [3, 'Intern', 'surfer_girl']]);
  assert.equal(roster.bench, 1);
  const zoe = await s.player(h, 'Zoe');
  roster = s.app.rooms.roster(s.app.rooms.rooms.get(h.code));
  assert.deepEqual(bots(roster), [[3, 'Freshman', 'house_dj']]);
  assert.equal(roster.bench, 2);
  // Zoe leaves: Intern (benched last) comes back; Max leaves: Erasmus too.
  zoe.send({ t: 'leave' });
  roster = await h.next('roster', { match: (r) => !r.players.some((p) => p.gamertag === 'Zoe') });
  assert.deepEqual(bots(roster).map((b) => b[1]), ['Freshman', 'Intern']);
  max.send({ t: 'leave' });
  roster = await h.next('roster', { match: (r) => !r.players.some((p) => p.gamertag === 'Max') });
  assert.deepEqual(bots(roster), [[1, 'Freshman', 'house_dj'], [2, 'Intern', 'surfer_girl'], [3, 'Erasmus', 'lisboa_og']]);
  assert.equal(roster.bench, 0);
});

test('removing a bot while one waits on the bench empties the bench', async (t) => {
  const s = await startServer(t);
  const h = await s.host();
  await s.player(h, 'Ana', { fighter: 'finance_bro' });
  await setBots(h, ['house_dj', 'surfer_girl', 'lisboa_og']);
  const max = await s.player(h, 'Max');
  const roster = await setBots(h, ['house_dj']);
  assert.equal(roster.bench, 0);
  max.send({ t: 'leave' });
  const after = await h.next('roster', { match: (r) => !r.players.some((p) => p.gamertag === 'Max') });
  assert.deepEqual(bots(after).map((b) => b[1]), ['Freshman']);
});

test('joining during a match never touches its bots; the bench is settled back in the lobby', async (t) => {
  const s = await startServer(t);
  const h = await s.host();
  await s.player(h, 'Ana', { fighter: 'finance_bro' });
  await setBots(h, ['house_dj', 'surfer_girl', 'lisboa_og']);
  h.send({ t: 'match_start', stage: 'campus', lives: 1, slots: [0] });
  const started = await h.next('match_started');
  assert.deepEqual(started.bots.map((b) => b.slot), [1, 2, 3]);
  const max = await s.player(h, 'Max');
  assert.equal(max.slot, 1, 'the phone gets a slot that a bot uses in this match');
  const room = s.app.rooms.rooms.get(h.code);
  assert.equal(room.botsActive, 3);
  assert.deepEqual(bots(s.app.rooms.roster(room)).map((b) => b[0]), [1, 2, 3]);
  // The server passes the newcomer's input on with its slot; the host ignores slots it has no phone for.
  max.send({ t: 'input', m: 1, q: 1 });
  assert.deepEqual(await h.next('input'), { t: 'input', slot: 1, m: 1, q: 1 });
  h.send({ t: 'match_abort', matchId: started.matchId });
  const roster = await h.next('roster', { match: (r) => r.phase === 'lobby' });
  assert.deepEqual(bots(roster), [[2, 'Freshman', 'house_dj'], [3, 'Intern', 'surfer_girl']]);
  assert.equal(roster.bench, 1);
});

test('start rules: one human and a bot start; one human alone does not; an un-Ready human blocks', async (t) => {
  const s = await startServer(t);
  const h = await s.host();
  const a = await s.player(h, 'Ana', { fighter: 'finance_bro' });
  h.send({ t: 'match_start', stage: 'campus', lives: 1, slots: [a.slot] });
  assert.match((await h.next('error')).msg, /At least 2 fighters/);
  h.send({ t: 'vote_start', slots: [a.slot] });
  assert.match((await h.next('error')).msg, /At least 2 fighters/);
  await setBots(h, ['house_dj']);
  const max = await s.player(h, 'Max'); // not ready
  h.send({ t: 'match_start', stage: 'campus', lives: 1, slots: [a.slot] });
  assert.match((await h.next('error')).msg, /Max is not ready yet/);
  max.send({ t: 'leave' });
  await h.next('roster', { match: (r) => !r.players.some((p) => p.gamertag === 'Max') });
  h.send({ t: 'vote_start', slots: [a.slot] });
  await h.next('vote_started');
  h.send({ t: 'match_start', stage: 'beach', lives: 1, slots: [a.slot] });
  const started = await h.next('match_started');
  assert.deepEqual(started.bots, [{ slot: 1, name: 'Freshman', fighter: 'house_dj' }]);
  assert.deepEqual(s.app.rooms.rooms.get(h.code).match.bots, started.bots);
});

test('bots get the slots the humans of the match do not use, in ascending order', async (t) => {
  const s = await startServer(t);
  const h = await s.host();
  await s.player(h, 'Ana', { fighter: 'finance_bro' });
  const max = await s.player(h, 'Max', { fighter: 'house_dj' });
  await s.player(h, 'Zoe', { fighter: 'surfer_girl' });
  max.send({ t: 'leave' });
  await h.next('roster', { match: (r) => !r.players.some((p) => p.gamertag === 'Max') });
  const roster = await setBots(h, ['lisboa_og', 'bairro_chad']);
  assert.deepEqual(bots(roster).map((b) => b[0]), [1, 3]);
  h.send({ t: 'match_start', stage: 'bairro', lives: 2, slots: [0, 2] });
  const started = await h.next('match_started');
  assert.deepEqual(started.bots, [{ slot: 1, name: 'Freshman', fighter: 'lisboa_og' }, { slot: 3, name: 'Intern', fighter: 'bairro_chad' }]);
});

// A result on the campus with 1 life: the first slot of `order` wins, the others follow in that order.
function resultFor(order, fighters) {
  const r = sampleResult({ slots: order, lives: 1 });
  r.players.forEach((p) => { p.fighterId = fighters[p.slot] || 'finance_bro'; });
  return r;
}

test('a match of two humans and a bot is saved; places count the bot; the bot has no points, no account, no crown', async (t) => {
  const s = await startServer(t);
  const h = await s.host();
  await s.player(h, 'Ana', { fighter: 'finance_bro' });
  await s.player(h, 'Max', { fighter: 'finance_bro' });
  await setBots(h, ['house_dj']);
  h.send({ t: 'match_start', stage: 'campus', lives: 1, slots: [0, 1] });
  const { matchId, bots: matchBots } = await h.next('match_started');
  assert.deepEqual(matchBots, [{ slot: 2, name: 'Freshman', fighter: 'house_dj' }]);
  s.clock.now += 90_000;
  // The bot wins, Ana second, Max third.
  h.send({ t: 'match_result', matchId, result: resultFor([2, 0, 1], { 2: 'house_dj' }) });
  const saved = await h.next('result_saved');
  assert.equal(saved.stored, true);
  const bot = saved.players.find((p) => p.slot === 2);
  assert.deepEqual(bot, { slot: 2, bot: true, name: 'Freshman', place: 1, points: 0, achievements: [] });
  assert.deepEqual(saved.players.filter((p) => !p.bot).map((p) => [p.gamertag, p.place, p.points]), [['Ana', 2, 64], ['Max', 3, 44]]);
  assert.deepEqual(saved.leaderboard.map((p) => p.gamertag).sort(), ['Ana', 'Max']);
  assert.equal(s.store.players.size, 2, 'no bot in the store');
  const row = [...s.store.matches.values()][0];
  assert.equal(row.winner, '(bot)');
  assert.deepEqual(JSON.parse(row.players_json).map((p) => [p.gamertag, p.place]), [['Ana', 2], ['Max', 3]]);
  assert.equal(s.app.data.players.get('ana').last_won, false);
  assert.equal(s.app.data.players.get('max').last_won, false);
  const roster = await h.next('roster', { match: (r) => r.phase === 'lobby' });
  assert.ok(roster.players.every((p) => !p.crown));
});

test('one human against bots is a practice match: nothing is stored', async (t) => {
  const s = await startServer(t);
  const h = await s.host();
  await s.player(h, 'Ana', { fighter: 'finance_bro' });
  await setBots(h, ['house_dj', 'lisboa_og']);
  h.send({ t: 'match_start', stage: 'campus', lives: 1, slots: [0] });
  const { matchId } = await h.next('match_started');
  s.clock.now += 90_000;
  h.send({ t: 'match_result', matchId, result: resultFor([0, 2, 1], { 1: 'house_dj', 2: 'lisboa_og' }) });
  const saved = await h.next('result_saved');
  assert.equal(saved.stored, false);
  assert.match(saved.note, /Practice match/);
  assert.equal(s.store.matches.size, 0);
  assert.equal(s.store.players.get('ana').matches, 0);
  assert.equal(s.app.data.players.get('ana').last_won, false, 'a practice win brings no crown');
});

test('a bot line is checked like any other, and its fighter must be the one it started with', () => {
  const now = 1_800_000_000_000;
  const match = { id: 'x', stage: 'campus', lives: 1, slots: [0], bots: [{ slot: 1, name: 'Freshman', fighter: 'house_dj' }], startedAt: now - 120_000 };
  const good = resultFor([1, 0], { 1: 'house_dj' });
  assert.equal(checkResult(match, good, now).ok, true);
  const otherFighter = resultFor([1, 0], { 1: 'surfer_girl' });
  assert.match(checkResult(match, otherFighter, now).reason, /bot played another fighter/);
  const missing = resultFor([0], {});
  assert.match(checkResult(match, missing, now).reason, /player list/);
  const tooMuch = resultFor([1, 0], { 1: 'house_dj' });
  tooMuch.players[0].kos = 5;
  assert.equal(checkResult(match, tooMuch, now).ok, false);
});

test('the results screen a phone gets may say that a bot won, and nothing else new', async () => {
  const { relayProblem } = await import('../../server/rooms.js');
  assert.equal(relayProblem({ t: 'phase', name: 'results', place: 2, of: 2, won: false, winner: 'Freshman', winnerBot: true }), false);
  assert.equal(relayProblem({ t: 'phase', name: 'results', winner: 'Freshman', winnerBot: 'yes' }), true);
  assert.equal(relayProblem({ t: 'phase', name: 'results', winner: 'Freshman', bot: true }), true);
});
