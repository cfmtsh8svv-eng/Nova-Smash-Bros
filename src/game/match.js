// The match: creates the state, advances it one frame at a time and reports the result.
//
// This is the heart of the game and it is pure logic: no screen, no network,
// no clock. step(state, inputs) takes what every player presses in this frame
// and returns a list of events (hits, KOs, sounds to play, phone messages).
// The host page draws the state and forwards the events; the tests run the
// very same code without a browser.
import { CONFIG, FPS, makeSettings } from './config.js';
import { getFighter } from './fighters.js';
import { getStage } from './stages.js';
import { neutralInput, withPresses } from './input.js';
import { clearFighterEffects, feedback, knockOut } from './combat.js';
import { controlFighter, moveFighter, pushApart } from './physics.js';
import { startAttack, updateAttack, updateProjectiles } from './attacks.js';
import { startSpecial, updateSpecial } from './specials.js';
import { nextItemDelay, updateItems } from './items.js';
import { newHazardState, updateHazards, wifiDelayFor } from './hazards.js';

export const FINAL_KO_TEXT = 'FINAL KO!';
const HELD_KEYS = ['left', 'right', 'up', 'down', 'attack', 'jump', 'special'];
const heldOnly = (inp) => Object.fromEntries(HELD_KEYS.map((k) => [k, Boolean(inp[k])]));

function createFighter(player, spawn, lives, index, players) {
  const def = getFighter(player.fighterId);
  if (!def) throw new Error(`Unknown fighter: ${player.fighterId}`);
  const P = CONFIG.physics;
  return {
    slot: player.slot,
    name: String(player.name),
    fighterId: def.id,
    weight: def.weight,
    runSpeed: P.runBase + P.runPerSpeed * def.speed,
    // If an earlier player already picked this fighter, this one wears the player colour.
    altColor: players.slice(0, index).some((p) => p.fighterId === def.id),
    x: spawn.x, y: spawn.y, vx: 0, vy: 0,
    facing: spawn.x < 640 ? 1 : -1, aimUp: false,
    onGround: true, groundId: 0, jumpsLeft: 1, coyote: 0, dropTimer: 0, gravityScale: 1, dragVx: 0,
    jumpBuffer: 0, attackBuffer: 0, specialBuffer: 0,
    percent: 0, finalPercent: 0, lives, state: 'alive', respawnTimer: 0, invincible: 0,
    hitstun: 0, stun: 0, tipsy: 0, slip: 0, speedBoost: 0,
    attack: null, special: null, pull: null, held: null,
    cooldown: 0, cooldownMax: def.special.cooldown,
    lastHitBy: null, lastHitKind: null, lastHitTimer: 0, koFrame: -1,
    prevRaw: neutralInput(), lastInput: neutralInput(), lagQueue: [],
    squash: 0, stretch: 0, runPhase: 0,
    stats: { damageDealt: 0, damageTaken: 0, kos: 0, falls: 0, specialKos: 0 },
  };
}

// players: [{ slot: 0..3, name, fighterId }], two to four of them.
export function createMatch({ stageId, players, settings, seed = 1 }) {
  const stage = getStage(stageId);
  if (!stage) throw new Error(`Unknown stage: ${stageId}`);
  if (!Array.isArray(players) || players.length < 2 || players.length > 4) throw new Error('A match needs 2 to 4 players');
  const slots = new Set(players.map((p) => p.slot));
  if (slots.size !== players.length || players.some((p) => !Number.isInteger(p.slot) || p.slot < 0 || p.slot > 3)) {
    throw new Error('Every player needs a different slot from 0 to 3');
  }
  const s = makeSettings(settings);
  const state = {
    stage, settings: s, seed: seed | 0, frame: 0, fightFrames: 0, nextId: 0,
    phase: 'countdown', countdown: CONFIG.match.countdownFrames, finalTimer: 0,
    fighters: players.map((p, i) => createFighter(p, stage.spawns[i], s.lives, i, players)),
    projectiles: [], items: [], events: [],
    placements: [], // slots, best first; filled from the back as players are eliminated
    winner: null, byTimeCap: false, lastKo: null, hazardVotes: {},
  };
  state.itemTimer = nextItemDelay(state);
  state.hazard = newHazardState(state);
  return state;
}

const tick = (f, key) => {
  if (f[key] > 0) f[key] -= 1;
};

function respawn(state, f) {
  clearFighterEffects(f);
  f.state = 'alive';
  f.x = state.stage.respawn.x;
  f.y = state.stage.respawn.y;
  f.vx = 0;
  f.vy = 0;
  f.percent = 0;
  f.onGround = false;
  f.groundId = -1;
  f.jumpsLeft = 1;
  f.invincible = CONFIG.match.invincibleFrames;
  f.lagQueue = [];
  state.events.push({ type: 'respawn', slot: f.slot, x: f.x, y: f.y });
}

// Bad Wi-Fi: inputs go through a queue and come out 200 ms later.
function throughLag(state, f, inp) {
  const delay = wifiDelayFor(state, f);
  if (delay <= 0) {
    if (f.lagQueue.length) f.lagQueue = [];
    return inp;
  }
  f.lagQueue.push(inp);
  if (f.lagQueue.length > delay) return f.lagQueue.shift();
  // Nothing has come through yet: keep holding what was held, without new presses.
  return { ...heldOnly(f.lastInput), attackP: false, jumpP: false, specialP: false, downP: false, leftP: false, rightP: false };
}

function swapSides(inp) {
  return { ...inp, left: inp.right, right: inp.left, leftP: inp.rightP, rightP: inp.leftP };
}

// Advance the match by exactly one frame. inputs[slot] is that player's input.
export function step(state, inputs = {}) {
  state.events = [];
  if (state.phase === 'ended') return state.events;
  state.frame += 1;

  if (state.phase === 'countdown') {
    const before = Math.ceil(state.countdown / FPS);
    state.countdown -= 1;
    const after = Math.ceil(state.countdown / FPS);
    if (state.frame === 1) state.events.push({ type: 'countdown', n: before });
    else if (after !== before && after > 0) state.events.push({ type: 'countdown', n: after });
    if (state.countdown <= 0) {
      state.phase = 'fight';
      state.events.push({ type: 'go' });
    }
    return state.events;
  }

  const fighting = state.phase === 'fight';
  if (fighting) state.fightFrames += 1;

  for (const f of state.fighters) {
    if (f.state === 'out') continue;
    if (f.state === 'dead') {
      if (fighting && f.koFrame !== state.frame) {
        f.respawnTimer -= 1;
        if (f.respawnTimer <= 0) respawn(state, f);
      }
      continue;
    }
    for (const key of ['invincible', 'hitstun', 'stun', 'tipsy', 'slip', 'speedBoost', 'cooldown', 'lastHitTimer', 'dropTimer', 'coyote', 'squash', 'stretch']) tick(f, key);

    const raw = inputs[f.slot] || neutralInput();
    let inp = withPresses(raw, f.prevRaw);
    f.prevRaw = heldOnly(raw);
    inp = throughLag(state, f, inp);
    if (f.tipsy > 0) inp = swapSides(inp);
    f.lastInput = inp;

    controlFighter(state, f, inp);
    const free = f.hitstun <= 0 && f.stun <= 0 && !f.pull && !f.attack && !f.special;
    if (free && f.specialBuffer > 0 && f.cooldown <= 0) startSpecial(state, f);
    else if (free && f.attackBuffer > 0) startAttack(state, f);
    updateSpecial(state, f);
    moveFighter(state, f, inp);
  }

  for (const f of state.fighters) if (f.state === 'alive') updateAttack(state, f);
  updateProjectiles(state);
  pushApart(state);

  if (fighting) {
    updateItems(state);
    updateHazards(state);
    checkBlastZones(state);
    checkEnd(state);
  } else if (state.phase === 'finalKo') {
    state.finalTimer -= 1;
    if (state.finalTimer <= 0) {
      state.phase = 'ended';
      state.events.push({ type: 'matchEnd', result: buildResult(state) });
    }
  }
  return state.events;
}

function checkBlastZones(state) {
  const B = CONFIG.blast;
  const out = state.fighters.filter((f) => f.state === 'alive' && (f.x < B.left || f.x > B.right || f.y - CONFIG.body.h / 2 < B.top || f.y - CONFIG.body.h > B.bottom));
  // If several leave in the same frame, the one with more damage goes first (and so places lower).
  out.sort((a, b) => b.percent - a.percent || b.slot - a.slot);
  for (const f of out) knockOut(state, f, 'launched');
}

function checkEnd(state) {
  const left = state.fighters.filter((f) => f.state !== 'out');
  if (left.length <= 1) {
    if (left.length === 1) state.placements.unshift(left[0].slot);
    state.winner = state.placements[0];
    state.phase = 'finalKo';
    state.finalTimer = Math.round(CONFIG.match.finalKoRealSeconds * FPS * CONFIG.match.finalKoTimeScale);
    const ko = state.lastKo || { slot: null, x: 640, y: 360 };
    const winnerName = state.fighters.find((f) => f.slot === state.winner).name;
    const winnerText = `${winnerName} graduates with honours!`;
    state.events.push({ type: 'finalKo', slot: ko.slot, winner: state.winner, x: ko.x, y: ko.y, text: FINAL_KO_TEXT, winnerText });
    // The big moment: every phone vibrates.
    for (const f of state.fighters) feedback(state, f.slot, 'finalKo', winnerText, '#ffffff', { title: FINAL_KO_TEXT });
    return;
  }
  // Optional time cap. It is off in the normal game (timeCapS = 0).
  if (state.settings.timeCapS > 0 && state.fightFrames >= state.settings.timeCapS * FPS) {
    const rest = [...left].sort((a, b) => b.lives - a.lives || a.percent - b.percent || b.stats.damageDealt - a.stats.damageDealt || a.slot - b.slot);
    state.placements = [...rest.map((f) => f.slot), ...state.placements];
    state.winner = state.placements[0];
    state.byTimeCap = true;
    state.phase = 'ended';
    state.events.push({ type: 'matchEnd', result: buildResult(state) });
  }
}

// The numbers of a finished match, as shown on the results screen and sent to the server.
export function buildResult(state) {
  return {
    stage: state.stage.id,
    lives: state.settings.lives,
    durationS: Math.round(state.fightFrames / FPS),
    winner: state.winner,
    byTimeCap: state.byTimeCap,
    players: state.fighters.map((f) => ({
      slot: f.slot,
      name: f.name,
      fighterId: f.fighterId,
      place: state.placements.indexOf(f.slot) + 1,
      damageDealt: Math.round(f.stats.damageDealt),
      damageTaken: Math.round(f.stats.damageTaken),
      kos: f.stats.kos,
      falls: f.stats.falls,
      specialKos: f.stats.specialKos,
      endLives: f.lives,
      endPercent: Math.round(f.state === 'alive' ? f.percent : f.finalPercent),
    })),
  };
}

// What one player's phone shows in its header: damage, lives and the special's cooldown.
export function phoneStatus(state, slot) {
  const f = state.fighters.find((x) => x.slot === slot);
  if (!f) return null;
  return {
    pct: Math.floor(f.percent),
    lives: f.lives,
    state: f.state,
    cd: f.cooldown,
    cdMax: f.cooldownMax,
    held: f.held ? f.held.type : null,
    tipsy: f.tipsy > 0,
  };
}
