// The phone page: register or log in, pick a fighter, then be the controller.
// Which screen is shown is decided by the "phase" messages of the host
// (lobby, match, results); this page only reacts to them.
import { PLAYER_COLORS } from '/game/config.js';
import { FIGHTERS } from '/game/fighters.js';
import { HAZARDS, STAGES } from '/game/stages.js';
import { encodeInput } from '/game/input.js';
import { damageColor, hearts } from '/game/view.js';
import { createLink, storage } from '/shared/net.js';
import { paintSprite, paintStage } from '/shared/art/sprites.js';
import { createControls } from './controls.js';
import { createFeedback } from './feedback.js';

const $ = (id) => document.getElementById(id);
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text; // always as text, never as HTML
  return node;
};
const SCREENS = ['auth', 'notice', 'select', 'mapvote', 'pad', 'results'];
const HEARTBEAT_MS = 100; // the host lets go of a phone's buttons after 600 ms of silence

const me = {
  room: null, token: storage.get('localStorage', 'nb_token'), gamertag: storage.get('localStorage', 'nb_tag'),
  slot: -1, joined: false, joining: false, lives: 3,
  fighter: 0, ready: false,
  mapVote: { stage: null, card: 0, endsAt: 0, winner: null }, // the map vote (GAME_SPEC §10a)
  status: null, phase: null, koTitle: '', koText: '',
  cd: { left: 0, max: 1, at: 0 },
};
let authMode = 'register';
let joinRetry = null;
let seq = 0;
const feedback = createFeedback($('flash'));

function show(name) {
  for (const id of SCREENS) $(id).hidden = id !== name;
  if (name !== 'pad') {
    controls.releaseAll();
    hideHazard(); // a countdown from the last match must not be there in the next one
  }
  if (name === 'pad') keepAwake();
  showBanner();
}

// The one line at the top that says what is wrong with the connection: the nearest problem first.
const banner = { offline: false, weak: false, busy: false, hostGone: false };
function showBanner() {
  const text = banner.offline ? 'Connection lost, reconnecting…'
    : banner.weak ? 'Weak connection: the server is not answering…'
      : banner.busy ? 'The server is busy. Trying again…'
        : banner.hostGone ? 'The big screen lost its connection…' : '';
  if (text) $('offline').textContent = text;
  $('offline').hidden = !text || !me.token || !$('auth').hidden;
}

// The room code is kept in the address, so a reload (or a phone that threw the page away
// while it was locked) finds its way back, also when the code was typed in by hand.
function rememberRoom(code) {
  try {
    history.replaceState(null, '', code ? `/play?room=${code}` : '/play');
  } catch { /* not allowed here: a reload then asks for the code again */ }
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
    Object.assign(banner, { offline: false, weak: false, busy: false, hostGone: false });
    showBanner();
    me.joined = false;
    me.joining = false;
    if (!me.replaced && !me.left) tryJoin(); // a tab that was replaced, or a player who left, stays out until asked
  },
  onState(connected) {
    if (!connected) {
      me.joined = false;
      banner.offline = true;
      showBanner();
      controls.setEnabled(false); // nothing is sent while offline; fingers that are down are remembered
    }
  },
  onLag(late) {
    banner.weak = late;
    showBanner();
  },
  onMessage(msg) {
    const handler = MESSAGES[msg.t];
    if (handler) handler(msg);
  },
});

function tryJoin() {
  if (!me.token || !me.room || me.joined || me.joining) return false;
  if (!link.connected) {
    link.wake(); // joins as soon as the connection is there (see onOpen)
    return false;
  }
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
    me.left = false;
    clearTimeout(joinRetry);
    me.slot = msg.slot;
    me.gamertag = msg.gamertag;
    me.status = null;
    storage.set('localStorage', 'nb_tag', msg.gamertag);
    const color = PLAYER_COLORS[msg.slot];
    for (const id of ['selectTag', 'voteTag', 'padTag']) {
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
    banner.busy = false;
    banner.hostGone = !msg.hostConnected;
    showBanner();
    rememberRoom(me.room);
    // The server now replays the current screen. A player who is back in the middle of their
    // match keeps the pad (and a thumb that never left it); everyone else sees the fighter select.
    if (msg.phase === 'match' && !$('pad').hidden) return;
    showSelect();
    if (msg.phase === 'match') notice('A match is running. You are in the next one.');
  },

  phase(msg) {
    me.phase = msg;
    if (msg.name === 'lobby') {
      if (!$('results').hidden || !$('pad').hidden) me.ready = false; // a new round: ready up again
      me.status = null; // nothing of the last match (damage, "You're out!") carries over
      me.hazards = null; // the hazard vote starts fresh too
      showSelect();
    } else if (msg.name === 'vote') {
      if (Array.isArray(msg.slots) && msg.slots.includes(me.slot)) showMapVote(msg);
      else notice('The players are voting for the stage. You are in the next match.');
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
    $('padItem').textContent = itemLabel(msg);
    // The Group Project ticks on the phone of whoever holds it.
    if (msg.held === 'project' && Number.isInteger(msg.fuse) && msg.fuse !== me.lastFuse) feedback.sound('hazardCount');
    me.lastFuse = msg.held === 'project' ? msg.fuse : null;
    $('padItem').classList.toggle('hot', msg.held === 'project');
    me.cd = { left: Number(msg.cd) || 0, max: Math.max(1, Number(msg.cdMax) || 1), at: performance.now() };
    updateOverlay(Boolean(me.phase && me.phase.paused));
  },

  feedback(msg) {
    // Hazard announcements are for players in the match (their pad is showing).
    if (String(msg.kind).startsWith('hazard') && $('pad').hidden) return undefined;
    if (msg.kind === 'hazardWarn') return showHazard(msg.name, '');
    if (msg.kind === 'hazardCount') {
      feedback.sound('hazardCount');
      return showHazard(msg.name, String(msg.n));
    }
    if (msg.kind === 'hazardStart' || msg.kind === 'hazardEnd') return hideHazard();
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
    banner.hostGone = !msg.connected;
    showBanner();
  },

  closed(msg) {
    me.joined = false;
    me.room = null;
    rememberRoom(null);
    banner.hostGone = false;
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
    me.left = true; // stays out, also when the connection is renewed, until "Join again"
    notice('You left the room.', 'Join again', () => { me.left = false; notice('Joining…'); tryJoin(); });
  },

  error(msg) {
    me.joining = false;
    if (msg.code === 'room_not_found') {
      me.room = null;
      rememberRoom(null);
      showAuth(me.token ? 'login' : authMode);
      setError('room', msg.msg);
    } else if (msg.code === 'bad_token' || msg.code === 'signed_out') {
      forgetLogin();
      showAuth('login');
      setError('form', msg.msg);
    } else if (['room_full', 'room_closed', 'unavailable'].includes(msg.code)) {
      notice(String(msg.msg), 'Try again', () => { notice('Joining…'); tryJoin(); });
    } else if (msg.code === 'busy' && !me.joined) {
      // The server is turning joins away for the moment: say so and try again shortly.
      banner.busy = true;
      showBanner();
      clearTimeout(joinRetry);
      joinRetry = setTimeout(tryJoin, 2500 + Math.random() * 2500);
    } else if (msg.code === 'busy') {
      // In the room already: a burst of messages after a network hiccup was turned away.
      // The buttons are sent again by the heartbeat, so there is nothing to tell the player.
    } else if (msg.code !== 'bad_message' && msg.msg) {
      showMessage(String(msg.msg)); // shown on whatever screen the player is on
    }
  },
};

// The label in the phone header: the held item (the Group Project with its seconds left),
// otherwise a running effect.
const HELD_LABEL = { sardine: 'SARDINE', book: 'BOOK', megaphone: 'MEGAPHONE', cork: 'CORK', azulejo: 'AZULEJO' };
function itemLabel(msg) {
  if (msg.held === 'project') return `PROJECT ${Number.isInteger(msg.fuse) ? `${msg.fuse}s` : ''}`.trim();
  if (HELD_LABEL[msg.held]) return HELD_LABEL[msg.held];
  if (msg.buff === 'lucky') return 'LUCKY';
  if (msg.buff === 'bifana') return 'BIFANA';
  return msg.tipsy ? 'TIPSY' : '';
}

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
  banner.busy = false;
  banner.hostGone = false;
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
    if (!res.ok) {
      // A name that is "taken" may be the player's own from last time.
      const hint = res.status === 409 ? ' If it is yours, tap "I have an account".' : '';
      return setError(data.field || 'form', (data.error || 'That did not work. Try again.') + hint);
    }
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

// The card that is in the middle of a carousel right now.
const centredFighter = () => centredCard($('carousel'), me.fighter);
function centredCard(carousel, current) {
  const mid = carousel.scrollLeft + carousel.clientWidth / 2;
  let best = current;
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
  keepAwake(); // waiting in the lobby: a phone that locks itself would drop out of the room
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
    });
    return button;
  }));
}
const buildHazardVote = (hazards) => voteButtons($('hazardVote'), hazards, 'hazard', null);

// ---- map vote (GAME_SPEC §10a) ----

// Built once: a card per stage with a small picture of it, its name, day or night and its hazards.
function buildMapCarousel() {
  const carousel = $('mapCarousel');
  STAGES.forEach((stage, i) => {
    const card = el('article', 'card mapCard');
    card.dataset.index = String(i);
    card.dataset.stage = stage.id;
    const preview = el('canvas');
    preview.setAttribute('aria-label', `${stage.name}, small picture`);
    card.append(preview, el('h3', '', stage.name), el('p', 'time', stage.time === 'night' ? 'Night' : 'Day'));
    card.append(el('p', 'hazards', `Hazards: ${stage.hazards.map((id) => HAZARDS[id].short).join(', ')}`));
    carousel.append(card);
    $('mapDots').append(el('i'));
  });
  let settle = null;
  carousel.addEventListener('scroll', () => {
    clearTimeout(settle);
    settle = setTimeout(() => {
      me.mapVote.card = centredCard(carousel, me.mapVote.card);
      markMapCard();
    }, 60);
  }, { passive: true });
}

// The pictures are drawn the first time the vote screen shows (the stage art takes a moment).
let previewsDrawn = false;
function drawPreviews() {
  if (previewsDrawn) return;
  previewsDrawn = true;
  for (const card of $('mapCarousel').children) paintStage(card.querySelector('canvas'), card.dataset.stage, 480, 270).catch(() => {});
}

function markMapCard() {
  [...$('mapCarousel').children].forEach((card, i) => {
    card.classList.toggle('current', i === me.mapVote.card);
    card.classList.toggle('voted', card.dataset.stage === me.mapVote.stage);
    card.classList.toggle('winner', card.dataset.stage === me.mapVote.winner);
  });
  [...$('mapDots').children].forEach((dot, i) => dot.classList.toggle('on', i === me.mapVote.card));
  const current = STAGES[me.mapVote.card];
  const button = $('voteButton');
  button.disabled = Boolean(me.mapVote.winner);
  button.classList.toggle('on', me.mapVote.stage === current.id);
  button.textContent = me.mapVote.stage === current.id ? 'Voted!' : 'Vote!';
  const name = (id) => STAGES.find((s) => s.id === id).name;
  $('voteHint').textContent = me.mapVote.winner ? `${name(me.mapVote.winner)} wins! Get ready…`
    : me.mapVote.stage ? `You voted for ${name(me.mapVote.stage)}. You can change it until the vote ends.`
      : 'Swipe to a stage and vote';
}

function showMapVote(msg) {
  const fresh = $('mapvote').hidden;
  if (fresh && !msg.winner) me.mapVote.stage = null; // a new vote starts empty
  me.mapVote.winner = typeof msg.winner === 'string' ? msg.winner : null;
  me.mapVote.endsAt = performance.now() + (Number(msg.endsIn) || 0) * 1000;
  if (me.mapVote.winner) me.mapVote.card = Math.max(0, STAGES.findIndex((s) => s.id === me.mapVote.winner));
  show('mapvote');
  drawPreviews();
  const carousel = $('mapCarousel');
  const card = carousel.children[me.mapVote.card];
  if (card && (fresh || me.mapVote.winner)) carousel.scrollTo({ left: card.offsetLeft + card.offsetWidth / 2 - carousel.clientWidth / 2, behavior: fresh ? 'auto' : 'smooth' });
  carousel.style.overflowX = me.mapVote.winner ? 'hidden' : 'auto';
  if (me.mapVote.winner) {
    feedback.sound('ready');
    feedback.vibrate([40, 40, 120]);
  }
  markMapCard();
  tickVoteTimer();
}

function tickVoteTimer() {
  if ($('mapvote').hidden) return;
  const left = Math.max(0, Math.ceil((me.mapVote.endsAt - performance.now()) / 1000));
  $('voteTimer').textContent = me.mapVote.winner ? '' : `${left} s`;
}
setInterval(tickVoteTimer, 250);

function castVote() {
  if (me.mapVote.winner) return;
  me.mapVote.card = centredCard($('mapCarousel'), me.mapVote.card); // the card on screen, even right after a swipe
  const stage = STAGES[me.mapVote.card].id;
  me.mapVote.stage = stage; // tapping another stage later replaces this vote
  link.send({ t: 'vote', kind: 'stage', value: stage });
  feedback.sound('ready');
  feedback.vibrate([25]);
  markMapCard();
}

// ---- gamepad ----

const controls = createControls({
  root: $('controls'), stickZone: $('stickZone'), ring: $('stickRing'), knob: $('stickKnob'),
  onChange: sendInput,
});

function sendInput(state = controls.state) {
  if (!me.joined || $('pad').hidden) return;
  seq += 1;
  link.send({ t: 'input', m: encodeInput(state), q: seq });
}
// A heartbeat: the same state again, so the host notices quickly when a phone has gone quiet.
setInterval(() => sendInput(), HEARTBEAT_MS);

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

let hazardTimer = null;
function showHazard(name, count) {
  // If the news of the hazard's start or end gets lost (the big screen was offline for a
  // moment), the warning does not stay for ever: it goes when nothing follows it.
  clearTimeout(hazardTimer);
  hazardTimer = setTimeout(hideHazard, count ? 2000 : 3000);
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
  $('resultNote').textContent = msg.note ? String(msg.note) : 'Waiting for the host…';
  show('results');
  // New achievements are celebrated once, not every time the result is sent again.
  const earned = list.map((x) => String(x.name)).join('|');
  if (earned && earned !== me.celebrated) {
    me.celebrated = earned;
    feedback.fire({ kind: 'good', vibrate: [40, 40, 120], flash: '#22a36b' });
  }
}

// ---- start ----

buildCarousel();
buildMapCarousel();
$('voteButton').addEventListener('click', castVote);
requestAnimationFrame(drawCooldown);

$('authForm').addEventListener('submit', submitAuth);
$('tabRegister').addEventListener('click', () => showAuth('register'));
$('tabLogin').addEventListener('click', () => showAuth('login'));
$('ready').addEventListener('click', toggleReady);
// With the phone's rotation lock on, turning it does nothing: let the player carry on upright.
$('rotateSkip').addEventListener('click', () => $('pad').classList.add('upright'));
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
