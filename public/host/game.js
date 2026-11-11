// Runs one match on the host page: feeds the inputs into the rules, turns what
// happens into pictures, sounds and phone messages, and reports the result.
import { CONFIG, PLAYER_COLORS } from '/game/config.js';
import { createMatch, phoneStatus } from '/game/match.js';
import { createLoop } from '/game/loop.js';
import { InputBuffer } from '/game/input.js';
import { voteHazard } from '/game/hazards.js';
import { damageColor } from '/game/view.js';
import { loadAllPoses, loadStage } from '/shared/art/sprites.js';
import { createRenderer } from './render.js';
import { createFx } from './fx.js';
import { createKeyboard } from './keyboard.js';

const STALE_MS = 1500; // a phone that sent nothing for this long is treated as "let go of everything"
const HAZARD_SOUND = { train: 'train', wave: 'wave', gulls: 'gulls', crowd: 'crowd', drinks: 'drinks', wifi: 'wifi' };

export function createGame({ canvas, audio, sendTo, onEnd }) {
  const renderer = createRenderer(canvas);
  const fx = createFx();
  const keyboard = createKeyboard();
  const view = { camera: { x: 640, y: 360, zoom: 1 }, fx, time: 0, countAt: 0 };
  let cameraGoal = { x: 640, y: 360, zoom: 1 };
  let loop = null;
  let state = null;
  let previewStage = 'campus';
  let phones = new Map(); // slot -> { buffer, lastSeen }
  let guests = new Map(); // slot -> keyboard index
  let lastStatus = new Map();
  let lastTime = null;
  let endTimer = null;

  // ---- inputs ----

  function getInputs() {
    const now = performance.now();
    const inputs = {};
    for (const [slot, phone] of phones) {
      if (now - phone.lastSeen > STALE_MS) phone.buffer.reset();
      inputs[slot] = phone.buffer.consume();
    }
    for (const [slot, index] of guests) inputs[slot] = keyboard.read(index);
    return inputs;
  }

  function onInput(slot, mask, seq) {
    const phone = phones.get(slot);
    if (!phone) return;
    phone.lastSeen = performance.now();
    phone.buffer.receive(mask, seq);
  }

  // A phone dropped or came back: either way it starts from "nothing pressed".
  function setConnected(slot) {
    const phone = phones.get(slot);
    if (phone) phone.buffer.reset();
  }

  // ---- what happens -> picture, sound, phones ----

  const color = (slot) => PLAYER_COLORS[slot] || '#ffffff';
  const toPhone = (slot, msg) => { if (phones.has(slot)) sendTo(slot, msg); };
  const toAllPhones = (msg) => sendTo('all', msg);

  const HANDLERS = {
    countdown(e) { fx.banner(String(e.n), { size: 190, y: 330, life: 55 }); audio.play('count'); },
    go() { fx.banner('BRAWL!', { size: 150, color: '#ff7a3d', y: 330, life: 60 }); audio.play('go'); fx.addFlash(0.35); },
    jump(e) { audio.play(e.double ? 'doubleJump' : 'jump'); fx.burst(e.x, e.y, { count: e.double ? 8 : 5, color: '#ffffff', speed: 2.5, size: 5, life: 16, gravity: 0 }); },
    land(e) { if (e.speed > 6) { audio.play('land'); fx.burst(e.x, e.y, { count: 6, color: '#e9e2d0', speed: 2.5, size: 4, life: 14, gravity: 0 }); } },
    bounce(e) { audio.play('land'); fx.burst(e.x, e.y, { count: 8, color: '#e9e2d0', speed: 3.5, size: 5, life: 16 }); },
    attack() { audio.play('swing'); },
    projectile() { audio.play('swing'); },
    special(e) { audio.play(e.special); },
    hit(e) {
      audio.play(e.strong ? 'bigHit' : 'hit');
      fx.burst(e.x, e.y, { count: e.strong ? 18 : 9, color: ['#ffffff', '#f6c343', color(e.slot)], speed: e.strong ? 8 : 5, size: 6 });
      fx.number(e.x, e.y - 40, `${Math.floor(e.percent)}%`, damageColor(e.percent));
      fx.addShake(e.strong ? 11 : 3);
      if (e.strong) fx.addFlash(0.18);
    },
    ko(e) {
      audio.play('ko');
      fx.banner(e.text, { size: 76, color: color(e.slot), y: 230, life: 85 });
      fx.burst(e.x, e.y, { count: 46, color: ['#ffffff', '#f6c343', color(e.slot)], speed: 13, size: 9, life: 40, gravity: 0.1 });
      fx.ring(e.x, e.y, 260, color(e.slot), 30);
      fx.addShake(18);
      fx.addFlash(0.4, e.kind === 'burnout' ? '#ff7a3d' : '#ffffff');
    },
    respawn(e) { audio.play('respawn'); fx.ring(e.x, e.y + 40, 90, color(e.slot), 26); },
    itemSpawn(e) { audio.play('itemSpawn'); fx.burst(e.x, e.y - 16, { count: 8, color: '#ffffff', speed: 3, size: 4, life: 18, gravity: 0 }); },
    itemPickup(e) { audio.play('item'); fx.burst(e.x, e.y - 20, { count: 12, color: ['#f6c343', '#22a36b', '#ffffff'], speed: 4, size: 5, life: 22, gravity: -0.05 }); },
    itemBreak(e) { audio.play('itemBreak'); fx.burst(e.x, e.y - 60, { count: 10, color: '#8fb4d9', speed: 5, size: 5 }); },
    itemStolen(e) { audio.play('gulls'); fx.burst(e.x, e.y - 40, { count: 8, color: '#ffffff', speed: 4, size: 5, up: 4 }); },
    drink(e) { audio.play('drinks'); fx.burst(e.x, e.y - 20, { count: 12, color: ['#c79bff', '#3fd0e0'], speed: 4, size: 5, gravity: -0.05 }); },
    fx(e) {
      if (e.fx === 'cash_rain') {
        fx.ring(e.x, e.y, e.radius, '#3fbf6f');
        for (let i = 0; i < 26; i++) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.random() * e.radius;
          fx.burst(e.x + Math.cos(a) * r, e.y - 60 + Math.sin(a) * r * 0.5, { count: 1, color: i % 3 ? '#3fbf6f' : '#bff0cf', speed: 1.5, size: 11, life: 46, gravity: 0.12 });
        }
      } else if (e.fx === 'rounds_on_me') {
        fx.ring(e.x, e.y, e.radius, '#f0a81e');
        fx.burst(e.x, e.y, { count: 22, color: ['#f0a81e', '#ffffff'], speed: 9, size: 6, life: 30, up: 3 });
      } else if (e.fx === 'ring_light_flash') {
        fx.ring(e.x, e.y, e.radius, '#ffffff', 16);
        fx.addFlash(0.3);
      } else if (e.fx === 'bass_drop') {
        fx.ring(e.x, e.y - 10, e.radius, '#ff7a3d', 20);
        fx.ring(e.x, e.y - 10, e.radius * 0.6, '#f6c343', 26);
        fx.burst(e.x, e.y, { count: 20, color: '#e9e2d0', speed: 8, size: 6, life: 24 });
        fx.addShake(13);
      } else if (e.fx === 'spaghetti_lasso') {
        const target = e.target === null ? null : state.fighters.find((f) => f.slot === e.target);
        const end = target ? { x: target.x, y: target.y - 48 } : e.dir === 'up' ? { x: e.x, y: e.y - e.range } : { x: e.x + e.facing * e.range, y: e.y };
        fx.line(e.x, e.y, end.x, end.y, '#f6c343', 16);
      }
    },
    hazardWarn(e) { audio.play('warn'); toAllPhones({ t: 'feedback', kind: 'hazardWarn', name: e.name }); },
    hazardCount(e) { view.countAt = view.time; audio.play('warnCount'); toAllPhones({ t: 'feedback', kind: 'hazardCount', name: e.name, n: e.n }); },
    hazardStart(e) { audio.play(HAZARD_SOUND[e.hazard]); toAllPhones({ t: 'feedback', kind: 'hazardStart', name: e.name }); },
    hazardCancel(e) { audio.play('strike'); toAllPhones({ t: 'feedback', kind: 'hazardCancel', text: e.text }); },
    hazardEnd() { toAllPhones({ t: 'feedback', kind: 'hazardEnd' }); },
    feedback(e) { toPhone(e.slot, { t: 'feedback', kind: e.kind, text: e.text || '', title: e.title || '', flash: e.flash, vibrate: e.vibrate }); },
    finalKo(e) {
      audio.play('finalKo');
      audio.setMusic(null);
      fx.addFlash(0.9);
      fx.addShake(22);
      fx.banner(e.text, { size: 140, color: '#f6c343', y: 300, life: 150 });
      cameraGoal = { x: Math.max(360, Math.min(920, e.x)), y: Math.max(210, Math.min(510, e.y)), zoom: 1.75 };
      loop.winnerText = e.winnerText;
    },
    matchEnd(e) {
      cameraGoal = { x: 640, y: 360, zoom: 1 };
      fx.banner(loop.winnerText || 'Match over', { size: 54, color: '#ffffff', y: 320, life: 170 });
      const result = e.result;
      const finished = state;
      clearTimeout(endTimer);
      endTimer = setTimeout(() => onEnd(result, finished), 2600);
    },
  };

  function onEvent(event) {
    const handler = HANDLERS[event.type];
    if (handler) handler(event);
  }

  // Tell each phone its damage, lives and cooldown, but only when something changed.
  function sendStatus() {
    for (const slot of phones.keys()) {
      const s = phoneStatus(state, slot);
      if (!s) continue;
      s.cd = Math.ceil(s.cd / 20) * 20; // in coarse steps; the phone animates in between
      const key = JSON.stringify(s);
      if (lastStatus.get(slot) === key) continue;
      lastStatus.set(slot, key);
      sendTo(slot, { t: 'status', ...s });
    }
  }

  // ---- the frame loop (always running; without a match it shows the stage only) ----

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = lastTime === null ? 16.7 : now - lastTime;
    lastTime = now;
    const frames = Math.max(0, Math.min(dt, 100)) / (1000 / 60);
    if (loop && !loop.paused) {
      loop.tick(dt);
      if (state) sendStatus();
    }
    if (!loop || !loop.paused) {
      fx.update(frames);
      view.time += frames;
      const k = 1 - 0.86 ** frames;
      for (const key of ['x', 'y', 'zoom']) view.camera[key] += (cameraGoal[key] - view.camera[key]) * k;
    }
    renderer.draw(state ? state.stage.id : previewStage, state, view);
  }
  requestAnimationFrame(frame);

  // ---- control from the lobby ----

  // players: [{ slot, name, fighterId, keys? }] where keys is 0 or 1 for a keyboard player.
  async function start({ stageId, players, settings }) {
    stop();
    previewStage = stageId;
    const ordered = [...players].sort((a, b) => a.slot - b.slot);
    const seed = (Math.random() * 2 ** 31) | 0;
    const next = createMatch({ stageId, players: ordered, settings, seed });
    // Draw every pose of every fighter before the first frame, so nothing pops in mid-fight.
    await Promise.all([
      loadStage(stageId).catch(() => {}),
      ...next.fighters.map((f) => loadAllPoses(f.fighterId, f.altColor ? PLAYER_COLORS[f.slot] : null).catch(() => {})),
    ]);
    phones = new Map();
    guests = new Map();
    for (const p of ordered) {
      if (Number.isInteger(p.keys)) guests.set(p.slot, p.keys);
      else phones.set(p.slot, { buffer: new InputBuffer(), lastSeen: performance.now() });
    }
    lastStatus = new Map();
    fx.clear();
    view.camera = { x: 640, y: 360, zoom: 1 };
    cameraGoal = { x: 640, y: 360, zoom: 1 };
    state = next;
    loop = createLoop({ state, getInputs, onEvent });
    keyboard.setEnabled(guests.size > 0);
    audio.setMusic(stageId);
    lastTime = null;
  }

  function stop() {
    clearTimeout(endTimer);
    loop = null;
    state = null;
    keyboard.setEnabled(false);
    fx.clear();
    cameraGoal = { x: 640, y: 360, zoom: 1 };
  }

  return {
    start, stop, onInput, setConnected,
    setPreview(stageId) { previewStage = stageId; loadStage(stageId).catch(() => {}); },
    vote(slot, hazardId) { return state ? voteHazard(state, slot, hazardId) : false; },
    setPaused(value) { if (loop && state && state.phase !== 'ended') loop.paused = value; return Boolean(loop && loop.paused); },
    get running() { return Boolean(loop); },
    get paused() { return Boolean(loop && loop.paused); },
    get state() { return state; },
    hazardsOfStage() { return state ? state.stage.hazards : []; },
    burnoutPercent: CONFIG.match.burnoutPercent,
  };
}
