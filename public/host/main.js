// The host page (the big screen): title -> lobby -> match -> results -> lobby.
// It talks to the server over one WebSocket, owns the lobby settings and starts
// and ends matches. The match itself runs in game.js.
import { PLAYER_COLORS } from '/game/config.js';
import { FIGHTERS, getFighter } from '/game/fighters.js';
import { HAZARDS, STAGES, STAGE_IDS, tallyVote } from '/game/stages.js';
import { createAudio } from '/shared/audio.js';
import { createLink, storage } from '/shared/net.js';
import { paintSprite, paintStage } from '/shared/art/sprites.js';
import { duplicateColour } from '/shared/art/characters.js';
import { createGame } from './game.js';
import { createIntro } from './intro.js';
import { BLOCKS, BUTTON_AT, FOURTH_X, GROUND, STATS_AT } from './ceremony.js';

const $ = (id) => document.getElementById(id);
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text; // always as text, never as HTML
  return node;
};

const audio = createAudio();
const lobby = {
  room: null, // { code, hostKey }
  roster: [], // players as the server reports them
  closed: false,
  stage: 'vote', // 'vote' (the default, D-135) or a stage id
  lives: 3,
  items: true,
  hazards: true,
  seen: new Set(), // gamertags already shown, to play the entrance only once
};
let screen = 'title';
let match = null; // { id, players, stageId } while a match is running or its results are shown
let wantRoom = false;
let creatingRoom = false;
let roomRetry = null;
let startTimer = null;
let voting = null; // the map vote while it runs: { slots, players, votes: Map slot -> stage, endsAt, winner }
let intro = null; // the intro before the match while it runs: { skipped: Set of slots, ticker }
const introScreen = createIntro($);

const game = createGame({
  canvas: $('stage'),
  audio,
  sendTo: (slot, msg) => link.send({ t: 'to', slot, msg }),
  onEnd: showResults,
});

// ---- small helpers ----

function show(name) {
  screen = name;
  for (const id of ['title', 'lobby', 'vote', 'loading', 'intro', 'pause', 'results']) $(id).hidden = id !== name;
  // During the match and its end sequence the stage is not dimmed by the page (the end sequence dims it itself).
  $('frame').classList.toggle('playing', name === 'match' || name === 'results');
  if (name === 'title' || name === 'lobby') audio.setMusic('lobby');
}

let toastTimer = null;
function toast(text) {
  $('toast').textContent = text;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4500);
}

const phase = (msg, slot = 'all') => link.send({ t: 'to', slot, msg: { t: 'phase', ...msg } });

function lobbyPhase() {
  phase({ name: 'lobby' });
}

// ---- the server connection ----

let weak = false;
const link = createLink({
  // The connection still looks open, but the server stopped answering: say so right away,
  // because the phones' buttons do not arrive in the meantime.
  onLag(late) {
    if (!link.connected) return;
    weak = late;
    if (late) $('offline').textContent = 'Weak connection: the server is not answering…';
    $('offline').hidden = !late || screen === 'title';
  },
  onOpen() {
    $('offline').hidden = true;
    if (lobby.room) link.send({ t: 'host_resume', code: lobby.room.code, hostKey: lobby.room.hostKey });
    else if (wantRoom) creatingRoom = link.send({ t: 'host_create' });
  },
  onState(connected, code) {
    $('offline').textContent = code === 4002 ? 'This room was opened in another tab. This tab is no longer used.' : 'Connection lost, reconnecting…';
    $('offline').hidden = connected || (screen === 'title' && code !== 4002);
    weak = false;
    if (code === 4002) {
      // The other tab has the room now: nothing may keep running here.
      stopIntro();
      game.stop();
      match = null;
      pendingStart = null;
      lobby.room = null;
      show('title');
    }
  },
  onMessage(msg) {
    const handler = MESSAGES[msg.t];
    if (handler) handler(msg);
  },
});

const MESSAGES = {
  room(msg) {
    lobby.room = { code: msg.code, hostKey: msg.hostKey };
    storage.set('sessionStorage', 'nb_room', JSON.stringify(lobby.room));
    $('roomCode').textContent = msg.code;
    $('qr').src = `/api/qr?room=${msg.code}&secure=${location.protocol === 'https:' ? 1 : 0}`;
    $('joinUrl').textContent = `${location.host}/play`;
    const local = /^(localhost|127\.|\[)/.test(location.host);
    $('netNote').hidden = !local;
    $('netNote').textContent = local ? 'Phones cannot reach "localhost". Open this page through the computer\'s network address or the public URL.' : '';
    creatingRoom = false;
    clearTimeout(roomRetry);
    if (msg.resumed) game.resync(); // phones may have missed a KO or a new damage value meanwhile
    if (msg.resumed && msg.phase === 'vote') {
      // Back during the map vote: carry on if this page still runs it, otherwise end it.
      if (voting) votePhase();
      else {
        link.send({ t: 'vote_cancel' });
        show('lobby');
        lobbyPhase();
      }
    } else if (msg.resumed && msg.phase === 'match') {
      if (pendingStart) {
        // The connection dropped just after "Start": the server did start the match. Carry on.
        beginMatch(msg.matchId);
      } else if (match && match.id === msg.matchId && match.result && !match.saved) {
        // The match ended while we were offline: send the result now.
        submitResult();
      } else if (match && match.id === msg.matchId) {
        // still playing, loading or in the intro: phones get the right screen again
        if (intro) introPhase();
        else matchPhase(game.paused);
      } else {
        // The server still has a match that this page no longer has (the page was reloaded,
        // or the match was left while offline): it is ended on the server too.
        link.send({ t: 'match_abort', matchId: msg.matchId });
        toast('A match that was no longer running on this screen was ended.');
        show('lobby');
        lobbyPhase();
      }
    } else {
      if (pendingStart) {
        // "Start" never reached the server. Back to the lobby, where it can be pressed again.
        pendingStart = null;
        toast('The connection dropped before the match could start. Press Start again.');
      }
      if (match && match.result && !match.saved && screen === 'results') {
        $('resultNote').textContent = 'The connection was lost when the match ended, so this result could not be saved.';
      } else if (screen !== 'results' && !game.running && !voting) {
        show('lobby');
        lobbyPhase();
      }
    }
    refreshBoard();
  },

  roster(msg) {
    const before = new Map(lobby.roster.map((p) => [p.slot, p]));
    lobby.roster = msg.players;
    lobby.closed = msg.closed;
    for (const p of msg.players) {
      const old = before.get(p.slot);
      if (!lobby.seen.has(p.gamertag)) {
        lobby.seen.add(p.gamertag);
        p.fresh = true;
        audio.play('join');
      } else if (old && !old.ready && p.ready) {
        audio.play('ready');
      }
      if (old && old.connected !== p.connected) game.setConnected(p.slot);
    }
    if (intro) {
      // A player who lost the connection no longer holds up the intro.
      renderPips();
      checkIntroDone();
    }
    if (voting && !voting.winner) {
      // A player who left or lost the connection during the vote no longer counts (D-136).
      for (const slot of [...voting.votes.keys()]) if (!counts(slot)) voting.votes.delete(slot);
      renderVote();
      checkVoteDone();
    }
    renderLobby();
  },

  input(msg) { game.onInput(msg.slot, msg.m, msg.q); },

  vote(msg) {
    if (msg.kind === 'stage') {
      if (!voting || voting.winner || !voting.slots.includes(msg.slot) || !STAGE_IDS.includes(msg.value)) return;
      voting.votes.set(msg.slot, msg.value); // a second vote replaces the first
      audio.play('click');
      renderVote();
      checkVoteDone();
    } else if (msg.kind === 'hazard') {
      game.vote(msg.slot, msg.value);
    }
  },

  skip(msg) {
    if (!intro || !match || !match.players.some((p) => p.slot === msg.slot) || intro.skipped.has(msg.slot)) return;
    intro.skipped.add(msg.slot);
    audio.play('click');
    renderPips();
    introPhase();
    checkIntroDone();
  },

  vote_started() { beginVote(); },

  match_started(msg) { beginMatch(msg.matchId); },

  result_saved(msg) {
    if (!match || msg.matchId !== match.id) return;
    match.saved = msg;
    renderResultExtras(msg);
  },

  error(msg) {
    if (msg.code === 'room_gone') {
      // The server restarted or the room timed out: get a new one.
      lobby.room = null;
      lobby.roster = [];
      storage.set('sessionStorage', 'nb_room', null);
      stopIntro();
      game.stop();
      match = null;
      link.send({ t: 'host_create' });
      $('roomCode').textContent = '----';
      $('qr').removeAttribute('src');
      toast('The room had expired. A new one is being opened: players need to scan again.');
      return;
    }
    if (!lobby.room && wantRoom) {
      // Opening a room was refused (too many at the moment): say so and try again shortly.
      creatingRoom = false;
      clearTimeout(roomRetry);
      roomRetry = setTimeout(() => { if (!lobby.room && wantRoom && !creatingRoom) creatingRoom = link.send({ t: 'host_create' }); }, 5000);
      toast(`${msg.msg} Trying again in a few seconds.`);
      return;
    }
    if (voting && msg.code === 'bad_start') {
      endVote(); // the vote could not start (or its match could not): everyone goes back to the lobby
      if (!pendingStart) toast(msg.msg);
    }
    if (pendingStart) {
      // Whatever the reason, the start did not happen: back to the lobby, where Start works again.
      pendingStart = null;
      clearTimeout(startTimer);
      show('lobby');
      lobbyPhase();
      if (msg.code !== 'bad_start') toast('The match could not be started. Press Start again.');
    }
    if (msg.code === 'bad_result') {
      $('resultNote').textContent = `${msg.msg} The match does not count for the leaderboard.`;
      if (match) link.send({ t: 'match_abort', matchId: match.id });
      return;
    }
    if (msg.code === 'bad_start') {
      pendingStart = null;
      show('lobby');
    }
    if (msg.code !== 'bad_message' && msg.code !== 'no_match') toast(msg.msg);
  },
};

// ---- lobby ----

// Who would play if the match started now: every phone with a fighter that tapped Ready.
function lineup() {
  return lobby.roster.filter((p) => p.fighter && p.ready).map((p) => ({ slot: p.slot, name: p.gamertag, fighterId: p.fighter, crown: Boolean(p.crown) }));
}

function renderSlot(index) {
  const player = lobby.roster.find((p) => p.slot === index);
  const card = el('div', `slot p${index + 1}`);
  card.style.setProperty('--p', PLAYER_COLORS[index]);
  const picture = el('canvas');
  card.append(picture);
  const info = el('div');
  card.append(info);

  if (player) {
    info.append(el('span', 'tag', `P${index + 1} · ${player.gamertag}`));
    const fighter = player.fighter ? getFighter(player.fighter) : null;
    // Until a fighter is picked, only a grey silhouette is shown.
    // A player who won their last match wears the crown on the sprite, with no text (D-154).
    paintSprite(picture, player.fighter || FIGHTERS[index % FIGHTERS.length].id, { silhouette: !fighter, mainColour: fighter && isDuplicate(player) ? duplicateColour(fighter.id, PLAYER_COLORS[index]) : null, headroom: CROWN_ROOM, crown: Boolean(player.crown) }).catch(() => {});
    info.append(el('div', 'fighter', fighter ? fighter.name : 'Choosing…'));
    if (!player.connected) info.append(el('div', 'state away', 'Reconnecting…'));
    else if (player.ready) info.append(el('div', 'state ready', 'Ready!'));
    else info.append(el('div', 'state', fighter ? 'Not ready yet' : 'Picking a fighter'));
    // The host can take a player out of the room (somebody who should not be here).
    const remove = el('button', 'remove', '×');
    remove.title = `Remove ${player.gamertag} from the room`;
    remove.setAttribute('aria-label', remove.title);
    remove.addEventListener('click', () => {
      if (remove.dataset.sure) link.send({ t: 'kick', slot: index });
      else {
        remove.dataset.sure = '1';
        remove.textContent = 'Remove?';
        setTimeout(() => renderLobby(), 3000);
      }
    });
    card.append(remove);
    if (player.fresh) {
      card.classList.add('joined');
      player.fresh = false;
    }
  } else {
    card.classList.add('empty');
    info.append(el('span', 'tag', `P${index + 1}`));
    info.append(el('div', 'state', lobby.closed ? 'Room closed' : 'Scan to join'));
  }
  return card;
}

const CROWN_ROOM = 16; // sprite pixels above every lobby sprite, so a crown fits

// The later player with the same fighter wears the player colour (lower slots come first).
function isDuplicate(player) {
  return lobby.roster.some((p) => p.slot < player.slot && p.fighter === player.fighter);
}
function renderLobby() {
  const slots = $('slots');
  slots.replaceChildren(...[0, 1, 2, 3].map(renderSlot));

  const all = lineup();
  const waiting = lobby.roster.length - all.length;
  $('startMatch').disabled = all.length < 2;
  $('startHint').textContent = all.length < 2
    ? (lobby.roster.length ? 'At least 2 players need to pick a fighter and tap Ready.' : 'Waiting for players…')
    : `${all.length} players are ready.${waiting > 0 ? ` ${waiting} still choosing will sit this one out.` : ''}`;

  for (const button of $('stageButtons').children) button.setAttribute('aria-pressed', String(lobby.stage === button.dataset.value));
  $('startMatch').textContent = lobby.stage === 'vote' ? 'Start the vote' : 'Start match';
  for (const button of $('lifeButtons').children) button.setAttribute('aria-pressed', String(Number(button.dataset.value) === lobby.lives));
  const toggle = (id, on, yes, no) => { $(id).setAttribute('aria-pressed', String(on)); $(id).textContent = on ? yes : no; };
  toggle('toggleItems', lobby.items, 'Items on', 'Items off');
  toggle('toggleHazards', lobby.hazards, 'Hazards on', 'Hazards off');
  toggle('toggleRoom', lobby.closed, 'Room closed', 'Room open');
}

function buildLobbyControls() {
  for (const stage of [{ id: 'vote', name: 'Vote (default)', time: 'phones choose' }, ...STAGES]) {
    const button = el('button', '', stage.name);
    button.dataset.value = stage.id;
    button.append(el('small', '', stage.time));
    button.addEventListener('click', () => {
      lobby.stage = stage.id;
      audio.play('click');
      game.setPreview(stage.id === 'vote' ? 'campus' : stage.id);
      renderLobby();
    });
    $('stageButtons').append(button);
  }
  for (const lives of [1, 2, 3]) {
    const button = el('button', '', `${lives} ${lives === 1 ? 'life' : 'lives'}`);
    button.dataset.value = String(lives);
    button.addEventListener('click', () => { lobby.lives = lives; audio.play('click'); renderLobby(); });
    $('lifeButtons').append(button);
  }
  $('toggleItems').addEventListener('click', () => { lobby.items = !lobby.items; audio.play('click'); renderLobby(); });
  $('toggleHazards').addEventListener('click', () => { lobby.hazards = !lobby.hazards; audio.play('click'); renderLobby(); });
  $('toggleRoom').addEventListener('click', () => { audio.play('click'); link.send({ t: 'room_set', closed: !lobby.closed }); });
  $('volMusic').addEventListener('input', (e) => audio.setVolume('music', e.target.value / 100));
  $('volEffects').addEventListener('input', (e) => { audio.setVolume('effects', e.target.value / 100); });
  $('volEffects').addEventListener('change', () => audio.play('hit'));
  $('startMatch').addEventListener('click', requestStart);
  $('cancelVote').addEventListener('click', () => { audio.play('click'); endVote(); });
  $('backToLobby').addEventListener('click', backToLobby);
  $('resume').addEventListener('click', () => setPaused(false));
  $('quitMatch').addEventListener('click', quitMatch);
}

async function refreshBoard() {
  try {
    const res = await fetch('/api/leaderboard');
    if (res.ok) {
      const board = await res.json();
      fillBoard($('board'), board.players.slice(0, 8), board.stale);
    }
  } catch { /* the lobby works without it */ }
}

function fillBoard(list, players, stale = false) {
  // When the sheet could not be read, the list is what the server remembers: say so.
  list.classList.toggle('stale', Boolean(stale));
  if (!players || !players.length) {
    list.replaceChildren(el('li', 'none', 'No matches yet. Be the first!'));
    return;
  }
  list.replaceChildren(...players.map((p) => {
    const row = el('li');
    row.append(el('span', '', `${p.rank}.`), el('span', '', p.gamertag), el('b', '', `${p.points} pts`));
    return row;
  }));
}

// ---- match ----

let pendingStart = null;

function requestStart() {
  const all = lineup();
  if (all.length < 2 || pendingStart || voting) return;
  audio.unlock();
  // With "Vote" (the default) the phones choose the stage first; with a fixed stage the match starts at once.
  if (lobby.stage === 'vote') requestVote(all);
  else startMatchOn(lobby.stage, all);
}

function startMatchOn(stageId, all) {
  pendingStart = { stageId, players: all, settings: { lives: lobby.lives, items: lobby.items, hazards: lobby.hazards } };
  const sent = link.send({ t: 'match_start', stage: stageId, lives: lobby.lives, slots: all.map((p) => p.slot) });
  if (!sent) {
    pendingStart = null;
    toast('No connection to the server right now. Try again in a moment.');
    return;
  }
  show('loading');
  // Never stay on "Get ready…": if the server says nothing for a while, go back to the lobby.
  clearTimeout(startTimer);
  startTimer = setTimeout(() => {
    if (!pendingStart) return;
    pendingStart = null;
    show('lobby');
    link.send({ t: 'vote_cancel' }); // in case it came after a vote: the server goes back to the lobby too
    if (voting) {
      clearInterval(voting.ticker);
      voting = null;
    }
    lobbyPhase();
    toast('The server did not answer. Press Start again.');
  }, 8000);
}

// ---- map vote (GAME_SPEC §10a) ----

const VOTE_MS = 10_000; // the vote ends after 10 s, or sooner when everyone has voted
const WINNER_MS = 1500; // the winning stage is shown this long before the match starts
const plural = (n) => `${n} vote${n === 1 ? '' : 's'}`;
// A player of the vote counts while they are in the room and connected.
const counts = (slot) => lobby.roster.some((p) => p.slot === slot && p.connected);

function requestVote(all) {
  voting = { slots: all.map((p) => p.slot), players: all, votes: new Map(), endsAt: 0, winner: null, timer: null, ticker: null };
  if (!link.send({ t: 'vote_start', slots: voting.slots })) {
    voting = null;
    toast('No connection to the server right now. Try again in a moment.');
    return;
  }
  // If the server says nothing for a while, the vote never began: back to the lobby.
  voting.timer = setTimeout(() => {
    if (!voting || voting.endsAt) return;
    voting = null;
    toast('The server did not answer. Press Start again.');
  }, 8000);
}

function beginVote() {
  if (!voting || voting.endsAt) return;
  clearTimeout(voting.timer);
  voting.endsAt = performance.now() + VOTE_MS;
  buildVoteCards();
  renderVote();
  show('vote');
  audio.play('go');
  votePhase();
  voting.ticker = setInterval(tickVote, 200);
}

const secondsLeft = () => (voting ? Math.max(0, Math.ceil((voting.endsAt - performance.now()) / 1000)) : 0);

// What the phones of the vote show: the stages, the time left and, at the end, the winner.
// Everyone else (somebody who joined during the vote) sees that they are in the next match.
function votePhase() {
  if (!voting) return;
  phase({ name: 'vote', stages: STAGE_IDS, slots: voting.slots, endsIn: voting.winner ? 0 : secondsLeft(), winner: voting.winner });
}

function buildVoteCards() {
  $('voteCards').replaceChildren(...STAGES.map((stage) => {
    const card = el('div', 'voteCard');
    card.dataset.stage = stage.id;
    const preview = el('canvas');
    preview.setAttribute('aria-label', `${stage.name}, small picture`);
    paintStage(preview, stage.id).catch(() => {});
    const hazards = stage.hazards.map((id) => HAZARDS[id].short).join(', ');
    card.append(preview, el('h2', '', stage.name), el('p', 'small', `${stage.time === 'night' ? 'Night' : 'Day'} · ${hazards}`), el('b', 'count', plural(0)), el('div', 'faces'));
    return card;
  }));
}

function renderVote() {
  if (!voting) return;
  for (const card of $('voteCards').children) {
    const id = card.dataset.stage;
    const voters = voting.players.filter((p) => voting.votes.get(p.slot) === id);
    card.querySelector('.count').textContent = plural(voters.length);
    card.querySelector('.faces').replaceChildren(...voters.map((p) => {
      const face = el('canvas');
      face.title = p.name;
      const duplicate = voting.players.some((o) => o.slot < p.slot && o.fighterId === p.fighterId);
      paintSprite(face, p.fighterId, { mainColour: duplicate ? duplicateColour(p.fighterId, PLAYER_COLORS[p.slot]) : null }).catch(() => {});
      return face;
    }));
    card.classList.toggle('winner', voting.winner === id);
    card.classList.toggle('lost', Boolean(voting.winner) && voting.winner !== id);
  }
  $('voteTimer').hidden = Boolean(voting.winner);
  $('voteTimer').textContent = String(secondsLeft());
  $('voteNote').textContent = voting.winner ? `${STAGES.find((s) => s.id === voting.winner).name} wins!` : 'Vote on your phone. It ends when everyone has voted.';
}

function tickVote() {
  if (!voting || voting.winner) return;
  const before = $('voteTimer').textContent;
  $('voteTimer').textContent = String(secondsLeft());
  if ($('voteTimer').textContent !== before) votePhase(); // the phones' countdown stays in step
  if (performance.now() >= voting.endsAt) finishVote();
}

// Ends as soon as every player who still counts has voted (D-136).
function checkVoteDone() {
  if (voting && voting.endsAt && !voting.winner && voting.slots.filter(counts).every((slot) => voting.votes.has(slot))) finishVote();
}

function finishVote() {
  clearInterval(voting.ticker);
  // A tie (or no vote at all) is decided at random between the tied stages.
  voting.winner = tallyVote(STAGE_IDS, [...voting.votes.values()], Math.random);
  renderVote();
  votePhase();
  audio.play('ready');
  const { winner, slots } = voting;
  voting.timer = setTimeout(() => {
    if (!voting || voting.winner !== winner) return;
    // The players of the vote who are still in the room fight; anyone who joined meanwhile waits.
    const players = lineup().filter((p) => slots.includes(p.slot));
    if (players.length < 2) {
      endVote();
      toast('Not enough players are left for a match.');
      return;
    }
    startMatchOn(winner, players);
  }, WINNER_MS);
}

// The vote stops without a match (or its match could not start): back to the lobby for everyone.
function endVote() {
  if (!voting) return;
  clearTimeout(voting.timer);
  clearInterval(voting.ticker);
  voting = null;
  link.send({ t: 'vote_cancel' });
  show('lobby');
  lobbyPhase();
  renderLobby();
}

function matchPhase(paused = false) {
  const stage = STAGES.find((s) => s.id === match.stageId);
  phase({
    name: 'match', stage: stage.id, stageName: stage.name, paused, lives: match.settings.lives,
    slots: match.players.map((p) => p.slot),
    // With hazards switched off there is nothing to vote for.
    hazards: match.settings.hazards ? stage.hazards.map((id) => ({ id, name: HAZARDS[id].short })) : [],
  });
}

async function beginMatch(matchId) {
  if (!pendingStart) return;
  match = { id: matchId, ...pendingStart };
  pendingStart = null;
  clearTimeout(startTimer);
  if (voting) {
    clearTimeout(voting.timer);
    clearInterval(voting.ticker);
    voting = null;
  }
  const started = match;
  await game.start(match, { hold: true });
  if (match !== started) return; // the match was ended while it was loading
  startIntro();
}

// ---- the intro before every match (GAME_SPEC §10b, D-153) ----

function startIntro() {
  intro = { skipped: new Set(), ticker: setInterval(() => { if (introScreen.over) endIntro(); }, 200) };
  introScreen.open(match.stageId, pips());
  show('intro');
  introPhase();
}

// The players of the match, as the pips in the bottom right show them.
const pips = () => match.players.map((p) => ({ slot: p.slot, connected: counts(p.slot), skipped: intro.skipped.has(p.slot) }));
const renderPips = () => introScreen.renderPips(pips());

function introPhase() {
  phase({ name: 'intro', stage: match.stageId, slots: match.players.map((p) => p.slot), endsIn: introScreen.secondsLeft, skipped: [...intro.skipped] });
}

// Over early once every connected player of the match has pressed Skip.
function checkIntroDone() {
  const live = match.players.filter((p) => counts(p.slot));
  if (live.length && live.every((p) => intro.skipped.has(p.slot))) endIntro();
}

function stopIntro() {
  if (!intro) return;
  clearInterval(intro.ticker);
  introScreen.close();
  intro = null;
}

function endIntro() {
  if (!intro) return;
  stopIntro();
  game.go();
  show('match');
  matchPhase();
}

function setPaused(value) {
  if (screen !== 'match' && screen !== 'pause') return;
  const paused = game.setPaused(value);
  show(paused ? 'pause' : 'match');
  if (match) matchPhase(paused);
}

function quitMatch() {
  if (!match) return;
  link.send({ t: 'match_abort', matchId: match.id });
  stopIntro();
  game.stop();
  match = null;
  show('lobby');
  lobbyPhase();
}

window.addEventListener('keydown', (event) => {
  if (event.code === 'Escape' || event.code === 'KeyP') {
    if (screen === 'match') setPaused(true);
    else if (screen === 'pause') setPaused(false);
  }
});
// A hidden tab stops drawing, so the match pauses instead of running blind.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && screen === 'match') setPaused(true);
});

// ---- results ----

const ordinal = (n) => ['1st', '2nd', '3rd', '4th'][n - 1] || `${n}th`;

function showResults(result) {
  if (!match) return;
  match.result = result;
  show('results'); // the end sequence keeps running on the canvas behind the cards
  audio.setMusic('lobby');
  $('resultNote').textContent = 'Saving the result…';
  $('backToLobby').hidden = true;

  // One card above each fighter on the podium; the 4th one's above the fighter lying on the ground.
  const cards = [...result.players].sort((a, b) => a.place - b.place).map((p) => {
    const card = el('div', `stat p${p.slot + 1} ${PLACE_CLASS[p.place - 1]}`);
    card.style.setProperty('--p', PLAYER_COLORS[p.slot]);
    card.dataset.slot = String(p.slot);
    const x = p.place === 4 ? FOURTH_X : BLOCKS[p.place].x;
    const top = p.place === 4 ? GROUND - 70 : GROUND - BLOCKS[p.place].h - 168;
    card.style.left = `${(x / 1280) * 100}%`;
    card.style.top = `${(top / 720) * 100}%`;
    const head = el('div', 'h');
    head.append(el('span', 'n', ordinal(p.place)), el('span', 'who', `P${p.slot + 1} · ${p.name}`));
    card.append(head, el('div', '', `${p.damageDealt} % dealt · ${p.damageTaken} % taken`), el('div', '', `KOs ${p.kos} · Falls ${p.falls}`), el('div', 'pts', ''), el('div', 'ach', ''));
    return card;
  });
  $('resultCards').replaceChildren(...cards);
  clearResultTimers();
  resultTimers = [
    ...cards.map((card, i) => setTimeout(() => card.classList.add('on'), STATS_AT * 1000 + i * 110)),
    setTimeout(() => { $('backToLobby').hidden = false; }, BUTTON_AT * 1000),
  ];

  submitResult();
}

const PLACE_CLASS = ['first', 'second', 'third', 'fourth'];
let resultTimers = [];
function clearResultTimers() {
  resultTimers.forEach(clearTimeout);
  resultTimers = [];
}

// Send the result to the server and each phone's own line to the phones. Called again
// after a reconnect if the match ended while the connection was down.
function submitResult() {
  const result = match.result;
  // The phones get their own line at once; points and achievements follow when the server has answered.
  sendResultPhases(result, null);
  const sent = link.send({ t: 'match_result', matchId: match.id, result });
  if (!sent) $('resultNote').textContent = 'No connection right now. The result is sent as soon as it is back.';
  // If the server does not answer, say so instead of waiting forever.
  setTimeout(() => {
    if (match && match.result === result && !match.saved && $('resultNote').textContent === 'Saving the result…') {
      $('resultNote').textContent = link.connected ? 'The server has not confirmed the result yet.' : 'No connection right now. The result is sent as soon as it is back.';
    }
  }, 6000);
}

function sendResultPhases(result, saved) {
  const winner = result.players.find((p) => p.place === 1);
  for (const p of result.players) {
    // Only to the phone of the player who played: somebody new may have taken that slot since.
    const now = lobby.roster.find((r) => r.slot === p.slot);
    if (!now || now.gamertag !== p.name) continue;
    const line = saved ? saved.players.find((l) => l.slot === p.slot) : null;
    phase({
      name: 'results', place: p.place, of: result.players.length, won: p.place === 1, winner: winner.name,
      stats: { dealt: p.damageDealt, taken: p.damageTaken, kos: p.kos, falls: p.falls },
      points: line ? line.points : null, total: line ? line.totalPoints ?? null : null,
      achievements: line ? line.achievements.map((a) => ({ name: a.name, text: a.text })) : [],
      note: saved ? saved.note : '',
    }, p.slot);
  }
}

function renderResultExtras(saved) {
  $('resultNote').textContent = saved.note || (saved.stored ? 'Result saved.' : '');
  for (const line of saved.players) {
    const box = $('resultCards').querySelector(`[data-slot="${line.slot}"]`);
    if (!box) continue;
    box.querySelector('.pts').textContent = line.unsaved ? 'Not saved: no points' : `+${line.points} points`;
    box.querySelector('.ach').textContent = line.achievements.length ? `New: ${line.achievements.map((a) => a.name).join(', ')}` : '';
  }
  fillBoard($('board'), (saved.leaderboard || []).slice(0, 8), saved.stale);
  if (match && match.result) sendResultPhases(match.result, saved);
}

function backToLobby() {
  if (match && !match.saved) link.send({ t: 'match_abort', matchId: match.id }); // only matters if the result never got through
  match = null;
  clearResultTimers();
  game.stop(); // the end sequence
  show('lobby');
  lobbyPhase();
  renderLobby();
  refreshBoard();
}

// ---- start ----

// A free host goes to sleep when nobody loads a page for a while. While a room is open,
// a tiny request every few minutes keeps it awake.
setInterval(() => { if (lobby.room) fetch('/healthz').catch(() => {}); }, 4 * 60 * 1000);

buildLobbyControls();
renderLobby();
game.setPreview('campus');

// Any first click or key unlocks the sound (a browser rule).
for (const type of ['pointerdown', 'keydown']) window.addEventListener(type, () => audio.unlock(), { once: false, passive: true });

$('openRoom').addEventListener('click', () => {
  audio.unlock();
  audio.play('go');
  wantRoom = true;
  if (lobby.room) show('lobby');
  else if (creatingRoom) return; // a second click while the first room is on its way
  else if (link.send({ t: 'host_create' })) creatingRoom = true;
  else {
    link.wake(); // the connection had been closed for doing nothing: open it; the room follows
    toast('Connecting to the server…');
  }
});

// A reload keeps the room: the code on the wall and the players stay valid.
try {
  const saved = JSON.parse(storage.get('sessionStorage', 'nb_room') || 'null');
  if (saved && typeof saved.code === 'string' && typeof saved.hostKey === 'string') {
    lobby.room = saved;
    wantRoom = true;
    if (link.connected) link.send({ t: 'host_resume', code: saved.code, hostKey: saved.hostKey });
  }
} catch { /* start fresh */ }
show('title');

// For the browser smoke test and for debugging in the console: a look at the running match.
// It hands out the live objects, so it gives no more power than the host page already has
// (the host page runs the match and is trusted with its result; see docs/WALKTHROUGH.md).
window.novaBrawl = {
  get screen() { return screen; },
  get intro() { return intro ? { skipped: [...intro.skipped], secondsLeft: introScreen.secondsLeft } : null; },
  get state() { return game.state; },
  get roster() { return lobby.roster; },
};
