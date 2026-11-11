// The host page (the big screen): title -> lobby -> match -> results -> lobby.
// It talks to the server over one WebSocket, owns the lobby settings and starts
// and ends matches. The match itself runs in game.js.
import { PLAYER_COLORS } from '/game/config.js';
import { FIGHTERS, getFighter } from '/game/fighters.js';
import { HAZARDS, STAGES, STAGE_IDS, tallyVote } from '/game/stages.js';
import { createAudio } from '/shared/audio.js';
import { createLink, storage } from '/shared/net.js';
import { paintSprite } from '/shared/art/sprites.js';
import { KEYMAPS } from './keyboard.js';
import { createGame } from './game.js';

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
  stage: 'campus', // a stage id, or 'vote'
  lives: 3,
  items: true,
  hazards: true,
  guests: [], // keyboard players: [{ keys: 0 | 1, fighter: index into FIGHTERS }]
  stageVotes: new Map(), // slot -> stage id
  seen: new Set(), // gamertags already shown, to play the entrance only once
};
let screen = 'title';
let match = null; // { id, players, stageId } while a match is running or its results are shown
let wantRoom = false;
let creatingRoom = false;

const game = createGame({
  canvas: $('stage'),
  audio,
  sendTo: (slot, msg) => link.send({ t: 'to', slot, msg }),
  onEnd: showResults,
});

// ---- small helpers ----

function show(name) {
  screen = name;
  for (const id of ['title', 'lobby', 'loading', 'pause', 'results']) $(id).hidden = id !== name;
  $('frame').classList.toggle('playing', name === 'match');
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
  phase({ name: 'lobby', vote: lobby.stage === 'vote', stages: STAGES.map((s) => ({ id: s.id, name: s.name })) });
}

// ---- the server connection ----

const link = createLink({
  onOpen() {
    $('offline').hidden = true;
    if (lobby.room) link.send({ t: 'host_resume', code: lobby.room.code, hostKey: lobby.room.hostKey });
    else if (wantRoom) creatingRoom = link.send({ t: 'host_create' });
  },
  onState(connected, code) {
    $('offline').textContent = code === 4002 ? 'This room was opened in another tab. This tab is no longer used.' : 'Connection lost, reconnecting…';
    $('offline').hidden = connected || (screen === 'title' && code !== 4002);
    if (code === 4002) {
      // The other tab has the room now: nothing may keep running here.
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
    if (msg.resumed && msg.phase === 'match') {
      if (pendingStart) {
        // The connection dropped just after "Start": the server did start the match. Carry on.
        beginMatch(msg.matchId);
      } else if (match && match.id === msg.matchId && match.result && !match.saved) {
        // The match ended while we were offline: send the result now.
        submitResult();
      } else if (match && match.id === msg.matchId) {
        matchPhase(game.paused); // still playing (or loading): phones get the right screen again
      } else {
        // The page was reloaded in the middle of a match: that match is gone.
        link.send({ t: 'match_abort', matchId: msg.matchId });
        toast('The page was reloaded, so the running match was ended.');
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
      } else if (screen !== 'results' && !game.running) {
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
    for (const slot of lobby.stageVotes.keys()) if (!msg.players.some((p) => p.slot === slot)) lobby.stageVotes.delete(slot);
    // Keyboard players only fit into the slots that are left (decided in the lobby, not mid-match).
    while (!match && lobby.guests.length && lobby.guests.length + msg.players.length > 4) lobby.guests.pop();
    renderLobby();
  },

  input(msg) { game.onInput(msg.slot, msg.m, msg.q); },

  vote(msg) {
    if (msg.kind === 'stage') {
      lobby.stageVotes.set(msg.slot, msg.value);
      renderLobby();
    } else if (msg.kind === 'hazard') {
      game.vote(msg.slot, msg.value);
    }
  },

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
      game.stop();
      match = null;
      link.send({ t: 'host_create' });
      toast('The room had expired. A new one was opened: players need to scan again.');
      return;
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

function freeSlots() {
  const taken = new Set(lobby.roster.map((p) => p.slot));
  return [0, 1, 2, 3].filter((s) => !taken.has(s));
}

// Who would play if the match started now.
function lineup() {
  const phones = lobby.roster.filter((p) => p.fighter && p.ready).map((p) => ({ slot: p.slot, name: p.gamertag, fighterId: p.fighter }));
  const free = freeSlots();
  const keys = lobby.guests.slice(0, free.length).map((g, i) => ({ slot: free[i], name: KEYMAPS[g.keys].name, fighterId: FIGHTERS[g.fighter].id, keys: g.keys }));
  return { phones, keys, all: [...phones, ...keys] };
}

function renderSlot(index) {
  const player = lobby.roster.find((p) => p.slot === index);
  const free = freeSlots();
  const guestIndex = free.indexOf(index);
  const guest = !player && guestIndex >= 0 ? lobby.guests[guestIndex] : null;
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
    paintSprite(picture, player.fighter || FIGHTERS[index % FIGHTERS.length].id, { silhouette: !fighter, mainColour: fighter && isDuplicate(player) ? PLAYER_COLORS[index] : null }).catch(() => {});
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
  } else if (guest) {
    const fighter = FIGHTERS[guest.fighter];
    info.append(el('span', 'tag', `P${index + 1} · ${KEYMAPS[guest.keys].name}`));
    paintSprite(picture, fighter.id, { mainColour: guestIsDuplicate(index, fighter.id) ? PLAYER_COLORS[index] : null }).catch(() => {});
    info.append(el('div', 'fighter', fighter.name));
    const pickers = el('div', 'pickers');
    for (const [label, step] of [['◀', -1], ['▶', 1]]) {
      const button = el('button', '', label);
      button.setAttribute('aria-label', step < 0 ? 'Previous fighter' : 'Next fighter');
      button.addEventListener('click', () => {
        guest.fighter = (guest.fighter + step + FIGHTERS.length) % FIGHTERS.length;
        audio.play('click');
        renderLobby();
      });
      pickers.append(button);
    }
    info.append(pickers);
    info.append(el('div', 'state', KEYMAPS[guest.keys].hint));
  } else {
    card.classList.add('empty');
    info.append(el('span', 'tag', `P${index + 1}`));
    info.append(el('div', 'state', lobby.closed ? 'Room closed' : 'Scan to join'));
  }
  return card;
}

// The later player with the same fighter wears the player colour (lower slots come first).
function isDuplicate(player) {
  return lobby.roster.some((p) => p.slot < player.slot && p.fighter === player.fighter);
}
function guestIsDuplicate(slot, fighterId) {
  const { all } = lineup();
  return all.some((p) => p.slot < slot && p.fighterId === fighterId) || lobby.roster.some((p) => p.slot < slot && p.fighter === fighterId);
}

function renderLobby() {
  const slots = $('slots');
  slots.replaceChildren(...[0, 1, 2, 3].map(renderSlot));

  const { phones, all } = lineup();
  const waiting = lobby.roster.length - phones.length;
  $('startMatch').disabled = all.length < 2;
  $('startHint').textContent = all.length < 2
    ? (lobby.roster.length ? 'At least 2 players need to pick a fighter and tap Ready.' : 'Waiting for players…')
    : `${all.length} players are ready.${waiting > 0 ? ` ${waiting} still choosing will sit this one out.` : ''}`;
  $('guestCount').textContent = String(lobby.guests.length);
  $('guestLess').disabled = lobby.guests.length === 0;
  $('guestMore').disabled = lobby.guests.length >= Math.min(2, freeSlots().length);

  const counts = new Map(STAGE_IDS.map((id) => [id, 0]));
  for (const id of lobby.stageVotes.values()) counts.set(id, counts.get(id) + 1);
  for (const button of $('stageButtons').children) {
    const id = button.dataset.value;
    button.setAttribute('aria-pressed', String(lobby.stage === id));
    const small = button.querySelector('small');
    if (small && id !== 'vote') small.textContent = lobby.stage === 'vote' ? `${counts.get(id)} vote${counts.get(id) === 1 ? '' : 's'}` : STAGES.find((s) => s.id === id).time;
  }
  for (const button of $('lifeButtons').children) button.setAttribute('aria-pressed', String(Number(button.dataset.value) === lobby.lives));
  const toggle = (id, on, yes, no) => { $(id).setAttribute('aria-pressed', String(on)); $(id).textContent = on ? yes : no; };
  toggle('toggleItems', lobby.items, 'Items on', 'Items off');
  toggle('toggleHazards', lobby.hazards, 'Hazards on', 'Hazards off');
  toggle('toggleRoom', lobby.closed, 'Room closed', 'Room open');
}

function buildLobbyControls() {
  for (const stage of [...STAGES, { id: 'vote', name: 'Vote', time: 'players choose' }]) {
    const button = el('button', '', stage.name);
    button.dataset.value = stage.id;
    button.append(el('small', '', stage.time));
    button.addEventListener('click', () => {
      lobby.stage = stage.id;
      audio.play('click');
      game.setPreview(stage.id === 'vote' ? 'campus' : stage.id);
      lobbyPhase();
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
  $('guestMore').addEventListener('click', () => {
    if (lobby.guests.length >= Math.min(2, freeSlots().length)) return;
    const keys = lobby.guests.some((g) => g.keys === 0) ? 1 : 0;
    lobby.guests.push({ keys, fighter: Math.floor(Math.random() * FIGHTERS.length) });
    audio.play('join');
    renderLobby();
  });
  $('guestLess').addEventListener('click', () => { lobby.guests.pop(); audio.play('click'); renderLobby(); });
  $('volMusic').addEventListener('input', (e) => audio.setVolume('music', e.target.value / 100));
  $('volEffects').addEventListener('input', (e) => { audio.setVolume('effects', e.target.value / 100); });
  $('volEffects').addEventListener('change', () => audio.play('hit'));
  $('startMatch').addEventListener('click', requestStart);
  $('backToLobby').addEventListener('click', backToLobby);
  $('resume').addEventListener('click', () => setPaused(false));
  $('quitMatch').addEventListener('click', quitMatch);
}

async function refreshBoard() {
  try {
    const res = await fetch('/api/leaderboard');
    if (res.ok) fillBoard($('board'), (await res.json()).players.slice(0, 8));
  } catch { /* the lobby works without it */ }
}

function fillBoard(list, players) {
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
  const { phones, keys, all } = lineup();
  if (all.length < 2 || pendingStart) return;
  // With "Vote" the phones decide; a tie (or no vote at all) is settled by chance.
  const stageId = lobby.stage === 'vote' ? tallyVote(STAGE_IDS, [...lobby.stageVotes.values()], Math.random) : lobby.stage;
  pendingStart = { stageId, players: all, settings: { lives: lobby.lives, items: lobby.items, hazards: lobby.hazards } };
  audio.unlock();
  const sent = link.send({ t: 'match_start', stage: stageId, lives: lobby.lives, slots: phones.map((p) => p.slot), guests: keys.length, guestSlots: keys.map((k) => k.slot) });
  if (!sent) {
    pendingStart = null;
    toast('No connection to the server right now. Try again in a moment.');
    return;
  }
  show('loading');
}

function matchPhase(paused = false) {
  const stage = STAGES.find((s) => s.id === match.stageId);
  phase({
    name: 'match', stage: stage.id, stageName: stage.name, paused, lives: match.settings.lives,
    slots: match.players.filter((p) => !Number.isInteger(p.keys)).map((p) => p.slot),
    // With hazards switched off there is nothing to vote for.
    hazards: match.settings.hazards ? stage.hazards.map((id) => ({ id, name: HAZARDS[id].short })) : [],
  });
}

async function beginMatch(matchId) {
  if (!pendingStart) return;
  match = { id: matchId, ...pendingStart };
  pendingStart = null;
  lobby.stageVotes.clear();
  matchPhase();
  await game.start(match);
  show('match');
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
  game.stop();
  match = null;
  show('lobby');
  lobbyPhase();
}

window.addEventListener('keydown', (event) => {
  // P pauses too, unless the second keyboard player is in this match: then P is their special.
  const pIsTaken = Boolean(match && match.players.some((p) => p.keys === 1));
  if (event.code === 'Escape' || (event.code === 'KeyP' && !pIsTaken)) {
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
  game.stop();
  show('results');
  audio.setMusic('lobby');
  const byPlace = [...result.players].sort((a, b) => a.place - b.place);
  const winner = byPlace[0];
  $('winnerLine').textContent = `${winner.name} graduates with honours!`;
  $('resultNote').textContent = 'Saving the result…';

  // Podium order on screen: 2nd, 1st, 3rd, and a fourth player flat on the ground beside it.
  const order = [byPlace[1], byPlace[0], byPlace[2], byPlace[3]].filter(Boolean);
  $('podium').replaceChildren(...order.map((p) => {
    const box = el('div', `place p${p.slot + 1} ${['first', 'second', 'third', 'fourth'][p.place - 1]}`);
    box.style.setProperty('--p', PLAYER_COLORS[p.slot]);
    box.dataset.slot = String(p.slot);
    const duplicate = result.players.some((o) => o.slot < p.slot && o.fighterId === p.fighterId);
    const picture = el('canvas');
    paintSprite(picture, p.fighterId, { mainColour: duplicate ? PLAYER_COLORS[p.slot] : null, pose: p.place === 4 ? 'ko' : p.place === 1 ? 'jump' : 'idle' }).catch(() => {});
    box.append(el('span', 'tag', `P${p.slot + 1} · ${p.name}`), picture);
    const step = el('div', 'step');
    step.append(el('div', 'n', ordinal(p.place)));
    step.append(el('div', '', `Dealt ${p.damageDealt} % · Taken ${p.damageTaken} %`));
    step.append(el('div', '', `KOs ${p.kos} · Falls ${p.falls}`));
    step.append(el('div', 'pts', ''));
    step.append(el('div', 'ach', ''));
    box.append(step);
    return box;
  }));
  fillBoard($('resultBoard'), null);

  submitResult();
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
      $('resultNote').textContent = 'The server has not confirmed the result yet. It is sent again when the connection is back.';
    }
  }, 6000);
}

function sendResultPhases(result, saved) {
  const winner = result.players.find((p) => p.place === 1);
  for (const p of result.players) {
    if (match.players.find((m) => m.slot === p.slot && Number.isInteger(m.keys))) continue;
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
    const box = $('podium').querySelector(`[data-slot="${line.slot}"]`);
    if (!box) continue;
    box.querySelector('.pts').textContent = line.guest ? 'Keyboard player: no points' : `+${line.points} points`;
    box.querySelector('.ach').textContent = line.achievements.length ? `New: ${line.achievements.map((a) => a.name).join(', ')}` : '';
  }
  fillBoard($('resultBoard'), saved.leaderboard);
  fillBoard($('board'), (saved.leaderboard || []).slice(0, 8));
  if (match && match.result) sendResultPhases(match.result, saved);
}

function backToLobby() {
  if (match && !match.saved) link.send({ t: 'match_abort', matchId: match.id }); // only matters if the result never got through
  match = null;
  show('lobby');
  lobbyPhase();
  renderLobby();
  refreshBoard();
}

// ---- start ----

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
  else toast('Connecting to the server…');
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
  get state() { return game.state; },
  get roster() { return lobby.roster; },
};
