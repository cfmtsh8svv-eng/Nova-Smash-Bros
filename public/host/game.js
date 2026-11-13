// Runs one match on the host page: feeds the inputs into the rules, turns what
// happens into pictures, sounds and phone messages, and reports the result.
import { CONFIG, PLAYER_COLORS, SCREEN } from '/game/config.js';
import { createMatch, phoneStatus } from '/game/match.js';
import { createLoop } from '/game/loop.js';
import { alpha } from '/game/clock.js';
import { InputBuffer } from '/game/input.js';
import { voteHazard } from '/game/hazards.js';
import { botInput, createBot } from '/game/bot.js';
import { damageColor } from '/game/view.js';
import { loadAllPoses, loadStage } from '/shared/art/sprites.js';
import { duplicateColour } from '/shared/art/characters.js';
import { createRenderer } from './render.js';
import { createFx } from './fx.js';
import { createCeremony } from './ceremony.js';

const STALE_MS = 600; // a phone that sent nothing for this long (six missed heartbeats) is treated as "let go of everything"
const ITEM_SOUND = { bifana: 'munch', rooster: 'crow', project: 'project', cork: 'block', megaphone: 'blast' };
const CEREMONY_SOUND = { slam: 'go', rise: 'land', pop: 'click', crown: 'ready', firework: 'firework' };
// A match that ends by the time cap (demo mode) has no final KO: "TIME!" stands this long
// before the end sequence, the moment the final-KO slow motion gives otherwise (D-196).
export const TIME_UP_TEXT = 'TIME!';
const TIME_UP_MS = 1800;
const HAZARD_SOUND = { train: 'train', wave: 'wave', gulls: 'gulls', crowd: 'crowd', drinks: 'drinks', wifi: 'wifi', rain: 'rain', sun: 'sun', fireworks: 'fireworksLaunch' };

export function createGame({ canvas, audio, sendTo, onEnd }) {
  const renderer = createRenderer(canvas);
  const fx = createFx();
  const view = { camera: { x: 640, y: 360, zoom: 1 }, fx, time: 0, countAt: 0 };
  let cameraGoal = { x: 640, y: 360, zoom: 1 };
  let loop = null;
  let state = null;
  let previewStage = 'campus';
  let phones = new Map(); // slot -> { buffer, lastSeen }, humans only
  let bots = new Map(); // slot -> the bot's brain (src/game/bot.js), kept for the whole match
  let lastStatus = new Map();
  let lastTime = null;
  let lastPlaces = null; // where the fighters were one step ago (only kept during the slow motion)
  let held = false; // set up, but waiting for the intro to end
  let ceremony = null; // the end sequence after the match (ceremony.js)
  let ceremonyAt = 0;
  let timeUp = null; // the timer of the "TIME!" moment

  // ---- inputs ----

  // Called once per step (never while paused or during the intro, so the bots pause too).
  function getInputs(current) {
    const now = performance.now();
    const inputs = {};
    for (const [slot, phone] of phones) {
      if (now - phone.lastSeen > STALE_MS) phone.buffer.letGo();
      inputs[slot] = phone.buffer.consume();
    }
    for (const [slot, bot] of bots) inputs[slot] = botInput(bot, current);
    return inputs;
  }

  // Only the phones of the match's humans steer fighters. A phone that joined during the
  // match may have the slot number of a bot: its buttons are ignored here.
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
    ledgeGrab(e) { audio.play('ledge'); fx.burst(e.x, e.y, { count: 5, color: '#e9e2d0', speed: 2, size: 4, life: 12, gravity: 0.2 }); },
    ledgeClimb(e) { audio.play('climb'); fx.burst(e.x, e.y, { count: 6, color: '#ffffff', speed: 2.5, size: 4, life: 14, gravity: 0 }); },
    bounce(e) { audio.play('land'); fx.burst(e.x, e.y, { count: 8, color: '#e9e2d0', speed: 3.5, size: 5, life: 16 }); },
    attack(e) { audio.play(e.kind === 'stomp' ? 'stompDive' : e.kind === 'megaphone' ? 'blast' : 'swing'); },
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
    itemPickup(e) { audio.play(ITEM_SOUND[e.item] || 'item'); fx.burst(e.x, e.y - 20, { count: 12, color: ['#f6c343', '#22a36b', '#ffffff'], speed: 4, size: 5, life: 22, gravity: -0.05 }); },
    itemBreak(e) { audio.play('itemBreak'); fx.burst(e.x, e.y - 60, { count: 10, color: '#8fb4d9', speed: 5, size: 5 }); },
    itemDrop(e) { fx.burst(e.x, e.y - 10, { count: 6, color: '#ffffff', speed: 3, size: 4, life: 14 }); },
    itemPass(e) { audio.play('project'); fx.burst(e.x, e.y - 60, { count: 10, color: ['#f6c343', '#ff7a3d'], speed: 4, size: 5, life: 18 }); },
    block(e) {
      audio.play('block');
      fx.burst(e.x, e.y, { count: 14, color: ['#c98a3a', '#a86b2c', '#f4e3b8'], speed: 6, size: 6, life: 22 });
      fx.ring(e.x, e.y, 60, '#c98a3a', 14);
    },
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
      } else if (e.fx === 'project') {
        audio.play('boom');
        fx.ring(e.x, e.y, 120, '#ff7a3d', 22);
        fx.burst(e.x, e.y, { count: 34, color: ['#f6c343', '#ff7a3d', '#eef3f8', '#16122a'], speed: 10, size: 7, life: 34, gravity: 0.15 });
        fx.addShake(14);
        fx.addFlash(0.25, '#ff7a3d');
      } else if (e.fx === 'firework') {
        audio.play('firework');
        const colours = ['#e63946', '#f6c343', '#22a36b', '#2f7fe0', '#e85d9c', '#ffffff'];
        fx.burst(e.x, e.y, { count: 40, color: colours, speed: 9, size: 6, life: 40, gravity: 0.08 });
        fx.ring(e.x, e.y, 110, colours[Math.floor(Math.random() * colours.length)], 22);
        fx.addShake(8);
      } else if (e.fx === 'shatter') {
        audio.play('shatter');
        fx.burst(e.x, e.y, { count: 12, color: ['#eef3f8', '#2f5fb0'], speed: 5, size: 4, life: 16 });
      } else if (e.fx === 'stomp') {
        // Smaller than the Bass Drop and pale: a dust ring along the ground, not an orange blast.
        fx.ring(e.x, e.y - 4, e.radius, e.power === 'sardine' ? '#8fb4d9' : '#eef3f8', 16);
        fx.ring(e.x, e.y - 4, e.radius * 0.55, '#e9e2d0', 20);
        for (const dir of [-1, 1]) fx.burst(e.x + dir * 20, e.y - 4, { count: 8, color: ['#e9e2d0', '#c9bfa8'], speed: 5, size: 5, life: 18, up: 1 });
        fx.addShake(6);
        audio.play('stomp');
      } else if (e.fx === 'spaghetti_lasso') {
        const target = e.target === null ? null : state.fighters.find((f) => f.slot === e.target);
        const end = target ? { x: target.x, y: target.y - 48 } : e.dir === 'up' ? { x: e.x, y: e.y - e.range } : { x: e.x + e.facing * e.range, y: e.y };
        fx.line(e.x, e.y, end.x, end.y, '#f6c343', 16);
      }
    },
    hazardWarn(e) { audio.play('warn'); toAllPhones({ t: 'feedback', kind: 'hazardWarn', name: e.name }); },
    hazardCount(e) { view.countAt = view.time; audio.play('warnCount'); toAllPhones({ t: 'feedback', kind: 'hazardCount', name: e.name, n: e.n }); },
    hazardStart(e) { audio.play(HAZARD_SOUND[e.hazard]); toAllPhones({ t: 'feedback', kind: 'hazardStart', name: e.name }); },
    // A late train: after the 3, 2, 1 nothing happens, so the phones' countdown just goes away (D-144).
    hazardLate() { toAllPhones({ t: 'feedback', kind: 'hazardEnd' }); },
    hazardEnd() { toAllPhones({ t: 'feedback', kind: 'hazardEnd' }); },
    feedback(e) { toPhone(e.slot, { t: 'feedback', kind: e.kind, text: e.text || '', title: e.title || '', flash: e.flash, vibrate: e.vibrate }); },
    finalKo(e) {
      audio.play('finalKo');
      audio.setMusic(null);
      fx.addFlash(0.9);
      fx.addShake(22);
      fx.banners = []; // the big moment stands alone, without the ordinary KO text behind it
      fx.banner(e.text, { size: 140, color: '#f6c343', y: 300, life: 150 });
      // Zoom in on the hit, but never so far to the side that the edge of the stage shows.
      const zoom = 1.6;
      const halfW = SCREEN.w / 2 / zoom;
      const halfH = SCREEN.h / 2 / zoom;
      cameraGoal = { x: Math.max(halfW, Math.min(SCREEN.w - halfW, e.x)), y: Math.max(halfH, Math.min(SCREEN.h - halfH, e.y)), zoom };
    },
    // The end sequence with the podium takes over the canvas (D-155); the results screen
    // (main.js) shows the stat cards over it.
    matchEnd(e) {
      if (e.result.byTimeCap && !e.timeShown) {
        // Time is up: the fighters freeze where they are and TIME! stands alone, like FINAL KO!.
        audio.play('finalKo');
        audio.setMusic(null);
        fx.banners = [];
        fx.addFlash(0.7);
        fx.addShake(12);
        fx.banner(TIME_UP_TEXT, { size: 140, color: '#f6c343', y: 300, life: 150 });
        const finished = state;
        timeUp = setTimeout(() => {
          timeUp = null;
          if (state === finished) HANDLERS.matchEnd({ ...e, timeShown: true });
        }, TIME_UP_MS);
        return;
      }
      const result = e.result;
      const finished = state;
      fx.clear();
      cameraGoal = { x: 640, y: 360, zoom: 1 };
      view.camera = { x: 640, y: 360, zoom: 1 };
      ceremony = createCeremony({
        players: result.players.map((p) => {
          const f = finished.fighters.find((x) => x.slot === p.slot);
          return { slot: p.slot, name: p.name, bot: Boolean(p.bot), fighterId: p.fighterId, altColor: Boolean(f && f.altColor), place: p.place, crown: view.crowns.has(p.slot), x: f ? f.x : 640, y: f ? f.y : 600 };
        }),
        onCue: (name) => audio.play(CEREMONY_SOUND[name]),
      });
      ceremonyAt = performance.now();
      loop.paused = true; // the rules are done; nothing more to step
      onEnd(result, finished);
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
      // Remembered only once it has really gone out, so nothing is missed while offline.
      if (sendTo(slot, { t: 'status', ...s })) lastStatus.set(slot, key);
    }
  }

  // ---- the frame loop (always running; without a match it shows the stage only) ----

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = lastTime === null ? 16.7 : now - lastTime;
    lastTime = now;
    const frames = Math.max(0, Math.min(dt, 100)) / (1000 / 60);
    if (loop && !loop.paused) {
      const before = state && state.phase === 'finalKo' ? state.fighters.map((f) => ({ x: f.x, y: f.y })) : null;
      if (loop.tick(dt) > 0) lastPlaces = before;
      if (state) sendStatus();
    }
    if (!loop || !loop.paused) {
      fx.update(frames);
      view.time += frames;
      const k = 1 - 0.86 ** frames;
      for (const key of ['x', 'y', 'zoom']) view.camera[key] += (cameraGoal[key] - view.camera[key]) * k;
    }
    drawSmooth();
  }
  requestAnimationFrame(frame);

  // In the final-KO slow motion the rules take a step only every fourth picture. To keep the
  // flight smooth, the fighters are drawn between their last two places. Only the picture
  // changes: the places are put back before the rules look at them again.
  function drawSmooth() {
    if (ceremony) return renderer.drawCeremony(state.stage.id, ceremony, (performance.now() - ceremonyAt) / 1000);
    const smooth = loop && state && state.phase === 'finalKo' && lastPlaces && lastPlaces.length === state.fighters.length;
    if (!smooth) {
      if (!state || state.phase !== 'finalKo') lastPlaces = null;
      // During the intro only the stage is drawn behind it, without fighters or HUD.
      if (held) return renderer.draw(state.stage.id, null, view);
      return renderer.draw(state ? state.stage.id : previewStage, state, view);
    }
    const t = alpha(loop.clock);
    const real = state.fighters.map((f) => ({ x: f.x, y: f.y }));
    state.fighters.forEach((f, i) => {
      const from = lastPlaces[i];
      if (Math.hypot(f.x - from.x, f.y - from.y) > 120) return; // a jump in place (a respawn), not a flight
      f.x = from.x + (f.x - from.x) * t;
      f.y = from.y + (f.y - from.y) * t;
    });
    try {
      return renderer.draw(state.stage.id, state, view);
    } finally {
      state.fighters.forEach((f, i) => { f.x = real[i].x; f.y = real[i].y; });
    }
  }

  // ---- control from the lobby ----

  // players: [{ slot, name, fighterId }], one per phone; bots: [{ slot, name, fighter, level }] (from the server).
  // With `hold` the match is set up and drawn but does not run until go() (the intro, D-153).
  async function start({ stageId, players, bots: botList = [], settings }, { hold = false } = {}) {
    stop();
    previewStage = stageId;
    const fromBots = botList.map((b) => ({ slot: b.slot, name: b.name, fighterId: b.fighter, bot: true }));
    const ordered = [...players, ...fromBots].sort((a, b) => a.slot - b.slot);
    const seed = (Math.random() * 2 ** 31) | 0;
    const next = createMatch({ stageId, players: ordered, settings, seed });
    // Draw every pose of every fighter before the first frame, so nothing pops in mid-fight.
    await Promise.all([
      loadStage(stageId).catch(() => {}),
      ...next.fighters.map((f) => loadAllPoses(f.fighterId, f.altColor ? duplicateColour(f.fighterId, PLAYER_COLORS[f.slot]) : null).catch(() => {})),
    ]);
    phones = new Map();
    for (const p of players) phones.set(p.slot, { buffer: new InputBuffer(), lastSeen: performance.now() });
    // Each bot plays at its own level (D-175) and gets its own random numbers from the match
    // seed and its slot (the match replays exactly).
    bots = new Map(botList.map((b) => [b.slot, createBot({ slot: b.slot, level: b.level, seed })]));
    lastStatus = new Map();
    fx.clear();
    view.camera = { x: 640, y: 360, zoom: 1 };
    cameraGoal = { x: 640, y: 360, zoom: 1 };
    view.crowns = new Set(players.filter((p) => p.crown).map((p) => p.slot)); // cosmetic only (D-154); never on a bot
    state = next;
    loop = createLoop({ state, getInputs, onEvent });
    loop.paused = hold;
    held = hold;
    audio.setMusic(stageId);
    lastTime = null;
  }

  // The intro is over: the countdown starts. Whatever a phone pressed during the intro is forgotten.
  function go() {
    if (!loop || !held) return;
    held = false;
    for (const phone of phones.values()) {
      phone.buffer.reset();
      phone.lastSeen = performance.now();
    }
    loop.paused = false;
    lastTime = null;
  }

  function stop() {
    clearTimeout(timeUp);
    timeUp = null;
    held = false;
    ceremony = null;
    loop = null;
    state = null;
    bots = new Map();
    fx.clear();
    cameraGoal = { x: 640, y: 360, zoom: 1 };
  }

  return {
    start, go, stop, onInput, setConnected,
    // After a reconnect: send every phone its status again, whether it changed or not.
    resync() { lastStatus = new Map(); },
    setPreview(stageId) { previewStage = stageId; loadStage(stageId).catch(() => {}); },
    vote(slot, hazardId) { return state && phones.has(slot) ? voteHazard(state, slot, hazardId) : false; },
    takesInput(slot) { return phones.has(slot); },
    // The level each bot of the match plays at, by slot (a copy; for the browser test).
    botLevels() { return Object.fromEntries([...bots].map(([slot, bot]) => [slot, bot.level])); },
    setPaused(value) { if (loop && state && state.phase !== 'ended' && !held) loop.paused = value; return Boolean(loop && loop.paused); },
    get running() { return Boolean(loop); },
    get paused() { return Boolean(loop && loop.paused); },
    get state() { return state; },
    hazardsOfStage() { return state ? state.stage.hazards : []; },
    burnoutPercent: CONFIG.match.burnoutPercent,
  };
}
