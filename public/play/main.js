// The phone page: register or log in, pick a fighter, then be the controller.
// Which screen is shown is decided by the "phase" messages of the host
// (lobby, match, results); this page only reacts to them.
import { PLAYER_COLORS } from '/game/config.js';
import { FIGHTERS } from '/game/fighters.js';
import { encodeInput } from '/game/input.js';
import { damageColor, hearts } from '/game/view.js';
import { createLink, storage } from '/shared/net.js';
import { paintSprite } from '/shared/art/sprites.js';
import { createControls } from './controls.js';
import { createFeedback } from './feedback.js';

const $ = (id) => document.getElementById(id);
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text; // always as text, never as HTML
  return node;
};
const SCREENS = ['auth', 'notice', 'select', 'pad', 'results'];
const HEARTBEAT_MS = 250;

const me = {
  room: null, token: storage.get('localStorage', 'nb_token'), gamertag: storage.get('localStorage', 'nb_tag'),
  slot: -1, joined: false, joining: false, lives: 3,
  fighter: 0, ready: false, stageVote: null,
  status: null, phase: null, koTitle: '', koText: '',
  cd: { left: 0, max: 1, at: 0 },
};
let authMode = 'register';
let seq = 0;
const feedback = createFeedback($('flash'));

function show(name) {
  for (const id of SCREENS) $(id).hidden = id !== name;
  if (name !== 'pad') {
    controls.releaseAll();
    hideHazard(); // a countdown from the last match must not be there in the next one
  }
  if (name === 'pad') keepAwake();
}

function notice(text, button, action) {
  $('noticeText').textContent = text;
  $('noticeButton').hidden = !button;
  if (button) {
    $('noticeButton').textContent = button;
    $('noticeButton').onclick = action;
  }
  show('notice');
}

// ---- the server connection ----

const link = createLink({
  onOpen() {
    $('offline').hidden = true;
    me.joined = false;
    me.joining = false;
    if (!me.replaced) tryJoin(); // a tab that was replaced by a newer one stays out until asked
  },
  onState(connected) {
    if (!connected) {
      me.joined = false;
      $('offline').textContent = 'Connection lost, reconnecting…';
      $('offline').hidden = !me.token || $('auth').hidden === false;
      controls.setEnabled(false); // nothing is sent while offline; fingers that are down are remembered
    }
  },
  onMessage(msg) {
    const handler = MESSAGES[msg.t];
    if (handler) handler(msg);
  },
});

function tryJoin() {
  if (!me.token || !me.room || me.joined || me.joining || !link.connected) return false;
  me.joining = true;
  return link.send({ t: 'join', room: me.room, token: me.token });
}

function forgetLogin() {
  me.token = null;
  storage.set('localStorage', 'nb_token', null);
}

const MESSAGES = {
  joined(msg) {
    me.joined = true;
    me.joining = false;
    me.replaced = false;
    me.slot = msg.slot;
    me.gamertag = msg.gamertag;
    me.status = null;
    storage.set('localStorage', 'nb_tag', msg.gamertag);
    const color = PLAYER_COLORS[msg.slot];
    for (const id of ['selectTag', 'padTag']) {
      $(id).textContent = `P${msg.slot + 1} · ${msg.gamertag}`;
      $(id).style.setProperty('--p', color);
      $(id).classList.toggle('p4', msg.slot === 3);
    }
    $('pad').style.setProperty('--p', color);
    if (msg.fighter) {
      const index = FIGHTERS.findIndex((f) => f.id === msg.fighter);
      if (index >= 0) me.fighter = index;
    }
    me.ready = Boolean(msg.ready && msg.fighter);
    $('offline').hidden = msg.hostConnected;
    if (!msg.hostConnected) $('offline').textContent = 'The big screen lost its connection…';
    // The server now replays the current screen. Until it does, show the fighter select.
    showSelect();
    if (msg.phase === 'match') notice('A match is running. You are in the next one.');
  },

  phase(msg) {
    me.phase = msg;
    if (msg.name === 'lobby') {
      if (!$('results').hidden || !$('pad').hidden) {
        me.ready = false; // a new round: ready up again ...
        me.stageVote = null; // ... and vote again (the host counts from zero)
      }
      me.status = null; // nothing of the last match (damage, "You're out!") carries over
      $('stageVote').hidden = !msg.vote;
      if (msg.vote && Array.isArray(msg.stages)) buildStageVote(msg.stages);
      showSelect();
    } else if (msg.name === 'match') {
      if (Array.isArray(msg.slots) && msg.slots.includes(me.slot)) {
        me.lives = [1, 2, 3].includes(msg.lives) ? msg.lives : 3;
        // Only rebuilt when the list changes, so a vote stays highlighted through a pause.
        const hazards = JSON.stringify(Array.isArray(msg.hazards) ? msg.hazards : []);
        if (hazards !== me.hazards) {
          me.hazards = hazards;
          buildHazardVote(JSON.parse(hazards));
        }
        if ($('pad').hidden) hideHazard();
        show('pad');
        updateOverlay(Boolean(msg.paused));
      } else {
        notice('A match is running. You are in the next one.');
      }
    } else if (msg.name === 'results') {
      showResults(msg);
    }
  },

  // The server's word on this player's own slot (sent when a match ends or is cancelled).
  slot(msg) {
    me.ready = Boolean(msg.ready);
    if (!$('select').hidden) showSelect();
  },

  status(msg) {
    me.status = msg;
    $('padPct').textContent = `${Number(msg.pct) || 0}%`;
    $('padPct').style.color = damageColor(msg.pct);
    $('padHearts').textContent = hearts(Number(msg.lives) || 0, me.lives);
    $('padItem').textContent = msg.held === 'sardine' ? 'SARDINE' : msg.held === 'book' ? 'BOOK' : msg.tipsy ? 'TIPSY' : '';
    me.cd = { left: Number(msg.cd) || 0, max: Math.max(1, Number(msg.cdMax) || 1), at: performance.now() };
    updateOverlay(Boolean(me.phase && me.phase.paused));
  },

  feedback(msg) {
    if (msg.kind === 'hazardWarn') return showHazard(msg.name, '');
    if (msg.kind === 'hazardCount') {
      feedback.sound('hazardCount');
      return showHazard(msg.name, String(msg.n));
    }
    if (msg.kind === 'hazardStart' || msg.kind === 'hazardEnd') return hideHazard();
    if (msg.kind === 'hazardCancel') {
      feedback.sound('hazardCancel');
      showHazard(String(msg.text || ''), '');
      return setTimeout(hideHazard, 2200);
    }
    feedback.fire(msg);
    if (msg.kind === 'ko' || msg.kind === 'out') {
      me.koTitle = String(msg.title || 'KO!');
      // The line repeats the title ("LAUNCHED! 2 lives left."): on the overlay the title is shown once.
      const line = String(msg.text || '');
      me.koText = line.startsWith(me.koTitle) ? line.slice(me.koTitle.length).trim() : line;
    }
    // A KO is shown big on the overlay; everything else as a line at the bottom.
    else if (msg.text) showMessage(String(msg.text));
    return undefined;
  },

  host(msg) {
    $('offline').textContent = 'The big screen lost its connection…';
    $('offline').hidden = Boolean(msg.connected);
  },

  closed(msg) {
    me.joined = false;
    me.room = null;
    $('offline').hidden = true;
    notice(String(msg.msg || 'The room was closed.'), 'Enter another code', () => showAuth());
  },

  signed_out(msg) {
    me.joined = false;
    if (msg.code === 'replaced') {
      // The same player was opened in another tab: this one steps aside and stays there
      // (it does not rejoin by itself, or the two tabs would throw each other out for ever).
      me.replaced = true;
      return notice(String(msg.msg), 'Use this one instead', () => { me.replaced = false; notice('Joining…'); tryJoin(); });
    }
    forgetLogin();
    return notice(String(msg.msg || 'You were signed out.'), 'Log in again', () => showAuth('login'));
  },

  left() {
    me.joined = false;
    if (!me.token) return; // logged out: the login screen is already showing
    notice('You left the room.', 'Join again', () => { if (!tryJoin()) showAuth(); });
  },

  error(msg) {
    me.joining = false;
    if (msg.code === 'room_not_found') {
      me.room = null;
      showAuth(me.token ? 'login' : authMode);
      setError('room', msg.msg);
    } else if (msg.code === 'bad_token' || msg.code === 'signed_out') {
      forgetLogin();
      showAuth('login');
      setError('form', msg.msg);
    } else if (['room_full', 'room_closed', 'unavailable'].includes(msg.code)) {
      notice(String(msg.msg), 'Try again', () => { notice('Joining…'); tryJoin(); });
    } else if (msg.code !== 'bad_message' && msg.msg) {
      showMessage(String(msg.msg)); // shown on whatever screen the player is on
    }
  },
};

// ---- register / log in ----

const FIELDS = { room: 'roomInput', gamertag: 'tagInput', pin: 'pinInput', pin2: 'pin2Input' };
const ERRORS = { room: 'roomError', gamertag: 'tagError', pin: 'pinError', pin2: 'pin2Error', form: 'formError' };

function setError(field, text) {
  $(ERRORS[field] || 'formError').textContent = text || '';
  if (FIELDS[field]) $(FIELDS[field]).classList.toggle('bad', Boolean(text));
}
function clearErrors() {
  for (const field of Object.keys(ERRORS)) setError(field, '');
}

function showAuth(mode = authMode) {
  authMode = mode;
  $('tabRegister').setAttribute('aria-selected', String(mode === 'register'));
  $('tabLogin').setAttribute('aria-selected', String(mode === 'login'));
  $('pin2Row').hidden = mode !== 'register';
  $('authSubmit').textContent = mode === 'register' ? 'Create player' : 'Log in';
  // The room code is only asked for when the QR link did not bring one.
  const needRoom = !me.room;
  $('roomInput').hidden = !needRoom;
  $('roomLabel').hidden = !needRoom;
  $('roomError').hidden = !needRoom;
  if (me.gamertag && !$('tagInput').value) $('tagInput').value = me.gamertag;
  // Somebody who is still logged in only has to give the room code.
  const loggedIn = Boolean(me.token);
  for (const id of ['tagInput', 'pinInput', 'tabRegister', 'tabLogin']) $(id).hidden = loggedIn;
  for (const label of document.querySelectorAll('label[for="tagInput"], label[for="pinInput"]')) label.hidden = loggedIn;
  if (loggedIn) {
    $('pin2Row').hidden = true;
    $('authSubmit').textContent = 'Join the room';
  }
  clearErrors();
  $('offline').hidden = true;
  show('auth');
}

async function submitAuth(event) {
  event.preventDefault();
  clearErrors();
  const room = me.room || $('roomInput').value.trim().toUpperCase();
  if (!/^[A-Z]{4}$/.test(room)) return setError('room', 'The room code is 4 letters. It is on the big screen.');
  if (me.token) {
    me.room = room;
    notice('Joining…');
    return tryJoin();
  }
  const gamertag = $('tagInput').value.trim();
  const pin = $('pinInput').value;
  const pin2 = $('pin2Input').value;
  // The same checks as on the server, so the answer is instant. The server checks again.
  if (gamertag.length < 3) return setError('gamertag', 'Gamertag is too short: use 3 to 12 characters.');
  if (gamertag.length > 12) return setError('gamertag', 'Gamertag is too long: use 3 to 12 characters.');
  if (!/^[A-Za-z0-9_]+$/.test(gamertag)) return setError('gamertag', 'Use only letters, numbers and _ in a gamertag.');
  if (!/^[0-9]{4}$/.test(pin)) return setError('pin', 'The PIN must be exactly 4 digits.');
  if (authMode === 'register' && pin !== pin2) return setError('pin2', 'The two PINs do not match.');

  $('authSubmit').disabled = true;
  try {
    const res = await fetch(authMode === 'register' ? '/api/register' : '/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(authMode === 'register' ? { gamertag, pin, pin2 } : { gamertag, pin }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(data.field || 'form', data.error || 'That did not work. Try again.');
    me.token = data.token;
    me.gamertag = data.gamertag;
    me.room = room;
    storage.set('localStorage', 'nb_token', data.token);
    storage.set('localStorage', 'nb_tag', data.gamertag);
    $('pinInput').value = '';
    $('pin2Input').value = '';
    notice('Joining…');
    if (!tryJoin() && !link.connected) notice('Connecting…');
  } catch {
    setError('form', 'No connection to the server. Check your internet and try again.');
  } finally {
    $('authSubmit').disabled = false;
  }
  return undefined;
}

// ---- fighter select ----

const statSteps = { speed: (f) => f.speed, weight: (f) => Math.max(1, Math.min(5, Math.round((f.weight - 80) / 10) + 1)) };

function buildCarousel() {
  const carousel = $('carousel');
  FIGHTERS.forEach((f, i) => {
    const card = el('article', 'card');
    card.dataset.index = String(i);
    const picture = el('canvas');
    picture.setAttribute('aria-label', f.name);
    paintSprite(picture, f.id).catch(() => {});
    card.append(picture, el('h3', '', f.name));
    const attacks = el('dl');
    attacks.append(el('dt', '', 'Attack'), el('dd', '', f.normal), el('dt', '', 'Special'), el('dd', '', f.special.name));
    card.append(attacks, el('p', 'about', f.special.text));
    const bars = el('div', 'bars');
    for (const [label, key] of [['Speed', 'speed'], ['Weight', 'weight']]) {
      const steps = el('div', 'steps');
      steps.setAttribute('aria-label', `${label}: ${statSteps[key](f)} of 5`);
      for (let k = 1; k <= 5; k++) steps.append(el('i', k <= statSteps[key](f) ? 'on' : ''));
      bars.append(el('span', '', label), steps);
    }
    card.append(bars);
    carousel.append(card);
    $('dots').append(el('i'));
  });
  let settle = null;
  carousel.addEventListener('scroll', () => {
    clearTimeout(settle);
    settle = setTimeout(() => {
      const best = centredFighter();
      if (best !== me.fighter && !me.ready) {
        me.fighter = best;
        markCurrent();
        // Tell the host which fighter is picked, so the big screen shows it. Ready comes separately.
        if (me.joined) link.send({ t: 'pick', fighter: FIGHTERS[me.fighter].id, ready: false });
      }
    }, 60);
  }, { passive: true });
}

function markCurrent() {
  [...$('carousel').children].forEach((card, i) => card.classList.toggle('current', i === me.fighter));
  [...$('dots').children].forEach((dot, i) => dot.classList.toggle('on', i === me.fighter));
}

function scrollToFighter(smooth = false) {
  const carousel = $('carousel');
  const card = carousel.children[me.fighter];
  if (!card) return;
  carousel.scrollTo({ left: card.offsetLeft + card.offsetWidth / 2 - carousel.clientWidth / 2, behavior: smooth ? 'smooth' : 'auto' });
}

function showSelect() {
  show('select');
  markCurrent();
  scrollToFighter();
  $('ready').textContent = me.ready ? 'Ready! Tap to change' : 'Ready!';
  $('ready').classList.toggle('on', me.ready);
  $('carousel').style.overflowX = me.ready ? 'hidden' : 'auto';
  $('selectHint').textContent = me.ready ? `${FIGHTERS[me.fighter].name} is in. Waiting for the host to start…` : 'Swipe to choose your fighter';
}

// The card that is in the middle of the carousel right now.
function centredFighter() {
  const carousel = $('carousel');
  const mid = carousel.scrollLeft + carousel.clientWidth / 2;
  let best = me.fighter;
  let bestDistance = Infinity;
  for (const card of carousel.children) {
    const d = Math.abs(card.offsetLeft + card.offsetWidth / 2 - mid);
    if (d < bestDistance) { bestDistance = d; best = Number(card.dataset.index); }
  }
  return best;
}

function toggleReady() {
  // Ready right after a swipe takes the fighter that is on screen, not the one from before.
  if (!me.ready) me.fighter = centredFighter();
  me.ready = !me.ready;
  link.send({ t: 'pick', fighter: FIGHTERS[me.fighter].id, ready: me.ready });
  feedback.sound(me.ready ? 'ready' : 'tap');
  feedback.vibrate([25]);
  showSelect();
}

function voteButtons(container, options, kind, current) {
  container.replaceChildren(...options.map((option) => {
    const button = el('button', '', String(option.name));
    button.setAttribute('aria-pressed', String(option.id === current));
    button.addEventListener('click', () => {
      link.send({ t: 'vote', kind, value: option.id });
      feedback.sound('tap');
      for (const other of container.children) other.setAttribute('aria-pressed', String(other === button));
      if (kind === 'stage') me.stageVote = option.id;
    });
    return button;
  }));
}
const buildStageVote = (stages) => voteButtons($('stageVoteButtons'), stages, 'stage', me.stageVote);
const buildHazardVote = (hazards) => voteButtons($('hazardVote'), hazards, 'hazard', null);

// ---- gamepad ----

const controls = createControls({
  root: $('controls'), dpad: $('dpad'), stickZone: $('stickZone'), ring: $('stickRing'), knob: $('stickKnob'),
  onChange: sendInput,
});

function sendInput(state = controls.state) {
  if (!me.joined || $('pad').hidden) return;
  seq += 1;
  link.send({ t: 'input', m: encodeInput(state), q: seq });
}
// A heartbeat: the same state again, so the host notices quickly when a phone has gone quiet.
setInterval(() => sendInput(), HEARTBEAT_MS);

function setMode(mode) {
  controls.setMode(mode);
  $('modeToggle').textContent = mode === 'stick' ? 'D-PAD ⇄' : 'JOYSTICK ⇄';
  storage.set('localStorage', 'nb_mode', mode);
}

// What covers the pad: knocked out, eliminated (with the hazard vote), or paused.
function updateOverlay(paused) {
  const state = me.status ? me.status.state : 'alive';
  let title = '';
  let text = '';
  if (state === 'out') {
    title = "You're out!";
    const canVote = $('hazardVote').children.length > 0;
    text = `Grab a coffee and watch.${canVote ? ' Vote for the next hazard:' : ''}`;
  } else if (state === 'dead') {
    title = me.koTitle || 'KO!';
    text = me.koText || 'Back in a moment…';
  } else if (paused) {
    title = 'Paused';
    text = 'The host paused the match.';
  }
  $('overlay').hidden = !title;
  $('overlayTitle').textContent = title;
  $('overlayText').textContent = text;
  $('hazardVote').hidden = state !== 'out' || $('hazardVote').children.length === 0;
  controls.setEnabled(!title && me.joined);
}

function showHazard(name, count) {
  $('hazard').hidden = false;
  $('hazardName').textContent = String(name || '');
  const number = $('hazardCount');
  number.textContent = count;
  number.classList.remove('pop');
  if (count) {
    void number.offsetWidth; // restart the pop animation for each number
    number.classList.add('pop');
  }
}
const hideHazard = () => { $('hazard').hidden = true; };

let messageTimer = null;
function showMessage(text) {
  $('message').textContent = text;
  $('message').hidden = false;
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => { $('message').hidden = true; }, 2600);
}

// The yellow strip in the Special button fills up while the special recharges.
function drawCooldown() {
  requestAnimationFrame(drawCooldown);
  if ($('pad').hidden) return;
  const paused = Boolean(me.phase && me.phase.paused);
  if (paused) me.cd.at = performance.now(); // the strip stands still while the match is paused
  const left = Math.max(0, me.cd.left - ((performance.now() - me.cd.at) / 1000) * 60);
  $('cooldown').style.transform = `scaleX(${1 - Math.min(1, left / me.cd.max)})`;
  $('cooldown').parentElement.classList.toggle('ready', left <= 0);
  const rtt = link.rttMs;
  $('signal').className = `signal${rtt === null ? ' bad' : rtt > 300 ? ' bad' : rtt > 120 ? ' slow' : ''}`;
}

// Keep the screen on during a match. Not every browser can; that is fine.
let wakeLock = null;
async function keepAwake() {
  try {
    if ('wakeLock' in navigator && !wakeLock && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  } catch { /* refused: the phone may dim, the game still works */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !$('pad').hidden) keepAwake();
});

// ---- results ----

function showResults(msg) {
  const place = Number(msg.place) || 0;
  $('resultPlace').textContent = msg.won ? 'YOU WIN!' : `${['1st', '2nd', '3rd', '4th'][place - 1] || ''} place`;
  $('resultWinner').textContent = msg.won ? 'You graduate with honours!' : `${String(msg.winner || 'Somebody')} graduates with honours!`;
  const stats = msg.stats || {};
  const rows = [['Damage dealt', `${Number(stats.dealt) || 0} %`], ['Damage taken', `${Number(stats.taken) || 0} %`], ['KOs', Number(stats.kos) || 0], ['Falls', Number(stats.falls) || 0]];
  $('resultStats').replaceChildren(...rows.flatMap(([k, v]) => [el('dt', '', k), el('dd', '', String(v))]));
  $('resultPoints').textContent = msg.points === null || msg.points === undefined ? '' : `+${Number(msg.points)} points${msg.total === null || msg.total === undefined ? '' : ` · ${Number(msg.total)} in total`}`;
  const list = Array.isArray(msg.achievements) ? msg.achievements : [];
  $('resultAchievements').replaceChildren(...list.map((a) => {
    const item = el('li');
    item.append(el('b', '', `Achievement: ${String(a.name)}`), el('span', '', String(a.text || '')));
    return item;
  }));
  if (list.length && $('results').hidden === false) feedback.fire({ kind: 'good', vibrate: [40, 40, 120], flash: '#22a36b' });
  $('resultNote').textContent = msg.note ? String(msg.note) : 'Waiting for the host…';
  const first = $('results').hidden;
  show('results');
  if (first && list.length) feedback.fire({ kind: 'good', vibrate: [40, 40, 120], flash: '#22a36b' });
}

// ---- start ----

buildCarousel();
setMode(storage.get('localStorage', 'nb_mode') === 'stick' ? 'stick' : 'dpad');
requestAnimationFrame(drawCooldown);

$('authForm').addEventListener('submit', submitAuth);
$('tabRegister').addEventListener('click', () => showAuth('register'));
$('tabLogin').addEventListener('click', () => showAuth('login'));
$('ready').addEventListener('click', toggleReady);
// With the phone's rotation lock on, turning it does nothing: let the player carry on upright.
$('rotateSkip').addEventListener('click', () => $('pad').classList.add('upright'));
$('modeToggle').addEventListener('click', () => setMode(controls.mode === 'stick' ? 'dpad' : 'stick'));
$('leave').addEventListener('click', () => { link.send({ t: 'leave' }); });
// "Log out" also makes the stored login useless everywhere, for a phone that is passed on.
$('logout').addEventListener('click', () => {
  link.send({ t: 'logout' });
  forgetLogin();
  me.joined = false;
  $('tagInput').value = '';
  showAuth('login');
});
window.addEventListener('resize', () => { if (!$('select').hidden) scrollToFighter(); });

const fromLink = new URLSearchParams(location.search).get('room');
if (fromLink && /^[A-Za-z]{4}$/.test(fromLink)) me.room = fromLink.toUpperCase();

if (me.token && me.room) {
  notice('Joining…'); // a returning player is logged in automatically
  tryJoin();
} else {
  showAuth(me.token ? 'login' : 'register');
}
