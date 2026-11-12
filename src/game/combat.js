// Combat: hit boxes, damage, knockback and knock-outs.
import { CONFIG } from './config.js';
import { pick } from './rng.js';
import { neutralInput } from './input.js';

export const LAUNCH_TEXTS = ['LAUNCHED!', 'SEE YA!', 'DROPPED OUT!', 'OUT OF OFFICE!'];
export const BURNOUT_TEXTS = ['BURNOUT!', 'NEEDS A GAP YEAR!'];

// Vibration patterns in milliseconds (on, off, on, ...). An elimination is the longest.
export const VIBRATE = {
  hit: [35],
  special: [60, 40, 140],
  hazard: [80, 40, 80],
  ko: [200, 80, 200, 80, 400],
  out: [300, 100, 300, 100, 900],
  finalKo: [120, 60, 120, 60, 700],
  good: [25],
};

export const hurtbox = (f) => ({ x: f.x - CONFIG.body.w / 2, y: f.y - CONFIG.body.h, w: CONFIG.body.w, h: CONFIG.body.h });
export const centreOf = (f) => ({ x: f.x, y: f.y - CONFIG.body.h / 2 });
export const rectsOverlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Only a fighter who is in play and not freshly respawned can be hit.
export const canBeHit = (f) => f.state === 'alive' && f.invincible <= 0;
export const opponentsOf = (state, f) => state.fighters.filter((o) => o.slot !== f.slot);

// The knockback formula from the spec.
export function launchSpeed(baseKb, kbGrowth, percent, weight) {
  return (baseKb + (kbGrowth * percent) / 100) * (100 / weight);
}

// A message for one player's phone: vibration, colour flash, sound and a line of text.
export function feedback(state, slot, kind, text, flash, extra = {}) {
  state.events.push({ type: 'feedback', slot, kind, text, flash, vibrate: VIBRATE[extra.pattern || kind] || VIBRATE.hit, ...extra });
}

// Apply one hit to `target`.
//   hit.by      slot of the attacker, or null for a hazard
//   hit.kind    'normal' | 'special' | 'item' | 'hazard'
//   hit.damage  percent added
//   hit.baseKb / hit.kbGrowth / hit.angleDeg / hit.dirX   launch (left out = no launch)
// Returns MISS (0), HIT (the target is still in play) or HIT_KO (the hit was the 200 % burnout).
// Callers add their own effect (stun, tipsy, phone message) only after a plain HIT:
// a fighter who was just knocked out must not carry a status effect, and their
// phone should show the KO, not the special's message.
export const MISS = 0;
export const HIT = 1;
export const HIT_KO = 2;

export function applyHit(state, target, hit) {
  if (state.phase !== 'fight' || !canBeHit(target)) return MISS;
  const M = CONFIG.match;
  target.hang = null; // no invincibility on a ledge: any hit knocks the fighter off (D-138)
  target.percent += hit.damage;
  target.stats.damageTaken += hit.damage;
  if (hit.by !== null && hit.by !== undefined) {
    const attacker = state.fighters.find((f) => f.slot === hit.by);
    if (attacker) attacker.stats.damageDealt += hit.damage;
    target.lastHitBy = hit.by;
    target.lastHitKind = hit.kind;
    target.lastHitTimer = M.koCreditFrames;
  }
  const launches = typeof hit.baseKb === 'number';
  let speed = 0;
  if (target.percent >= M.burnoutPercent) {
    state.events.push({ type: 'hit', slot: target.slot, by: hit.by ?? null, kind: hit.kind, source: hit.source, damage: hit.damage, percent: target.percent, x: target.x, y: target.y - CONFIG.body.h / 2, speed: 99, strong: true });
    knockOut(state, target, 'burnout');
    return HIT_KO;
  }
  if (launches) {
    speed = launchSpeed(hit.baseKb, hit.kbGrowth, target.percent, target.weight);
    const angle = ((hit.angleDeg ?? CONFIG.attack.angleDeg) * Math.PI) / 180;
    target.vx = Math.cos(angle) * speed * (hit.dirX || 0);
    target.vy = -Math.sin(angle) * speed;
    target.hitstun = Math.round(speed * M.hitstunFactor);
    target.onGround = false;
    target.attack = null;
    target.special = null;
    target.pull = null;
    target.stun = 0;
  }
  state.events.push({
    type: 'hit', slot: target.slot, by: hit.by ?? null, kind: hit.kind, source: hit.source, damage: hit.damage,
    percent: target.percent, x: target.x, y: target.y - CONFIG.body.h / 2, speed, strong: speed >= M.strongHitSpeed,
  });
  return HIT;
}

// Stun: the fighter cannot act, and whatever they were doing is cancelled.
export function stunFighter(f, frames) {
  f.stun = Math.max(f.stun, frames);
  f.attack = null;
  f.special = null;
}

// True if the straight line from a to b passes through the body of the solid main ground.
// Used so that the lasso and thrown things cannot reach through the floor.
export function blockedByGround(state, a, b) {
  for (const p of state.stage.platforms) {
    if (!p.solid) continue;
    const steps = 12;
    for (let i = 1; i < steps; i++) {
      const x = a.x + ((b.x - a.x) * i) / steps;
      const y = a.y + ((b.y - a.y) * i) / steps;
      if (x > p.x && x < p.x + p.w && y > p.y + 1 && y < p.y + p.h - 1) return true;
    }
  }
  return false;
}

// True if a fighter standing with the feet at (x, y) would be inside the solid ground.
export function insideGround(state, x, y) {
  const half = CONFIG.body.w / 2;
  return state.stage.platforms.some((p) => p.solid && x + half > p.x && x - half < p.x + p.w && y > p.y && y - CONFIG.body.h < p.y + p.h);
}

// Take a life. kind is 'launched' (left the screen) or 'burnout' (reached 200 %).
export function knockOut(state, f, kind) {
  if (f.state !== 'alive' || state.phase !== 'fight') return;
  // If everybody else is already out, this fighter has won. That also settles the rare
  // case of the last two being knocked out in the very same frame: one of them stays.
  if (f.lives <= 1 && !state.fighters.some((o) => o !== f && o.state !== 'out')) return;
  const M = CONFIG.match;
  f.lives -= 1;
  f.stats.falls += 1;
  let by = null;
  if (f.lastHitBy !== null && f.lastHitTimer > 0) {
    const attacker = state.fighters.find((o) => o.slot === f.lastHitBy);
    if (attacker && attacker.slot !== f.slot) {
      by = attacker.slot;
      attacker.stats.kos += 1;
      if (f.lastHitKind === 'special') attacker.stats.specialKos += 1;
      feedback(state, attacker.slot, 'good', 'Nice hit!', '#22a36b');
    }
  }
  const eliminated = f.lives <= 0;
  const text = pick(state, kind === 'burnout' ? BURNOUT_TEXTS : LAUNCH_TEXTS);
  const at = { x: Math.max(80, Math.min(1200, f.x)), y: Math.max(120, Math.min(640, f.y - CONFIG.body.h / 2)) };
  state.events.push({ type: 'ko', slot: f.slot, kind, by, text, livesLeft: f.lives, eliminated, x: at.x, y: at.y, rawX: f.x, rawY: f.y });
  if (eliminated) state.lastKo = { slot: f.slot, x: at.x, y: at.y, frame: state.frame };
  if (eliminated) {
    feedback(state, f.slot, 'out', "You're out! Grab a coffee and watch.", '#e63946', { title: text });
    state.placements.unshift(f.slot);
  } else {
    const left = f.lives === 1 ? 'Last life!' : `${f.lives} lives left.`;
    feedback(state, f.slot, 'ko', `${text} ${left}`, '#e63946', { title: text });
  }
  f.state = eliminated ? 'out' : 'dead';
  f.respawnTimer = eliminated ? 0 : M.respawnFrames;
  f.koFrame = state.frame;
  f.finalPercent = Math.min(f.percent, 999);
  clearFighterEffects(f);
  f.vx = 0;
  f.vy = 0;
  f.percent = 0;
}

export function clearFighterEffects(f) {
  f.hitstun = 0;
  f.stun = 0;
  f.tipsy = 0;
  f.slip = 0;
  f.speedBoost = 0;
  f.attack = null;
  f.special = null;
  f.pull = null;
  f.hang = null;
  f.ledgeUsed = false;
  f.held = null;
  f.lagQueue = [];
  f.lastInput = neutralInput();
  f.jumpBuffer = 0;
  f.attackBuffer = 0;
  f.specialBuffer = 0;
  f.coyote = 0;
  f.dropTimer = 0;
  f.dragVx = 0;
  f.lastHitBy = null;
  f.lastHitTimer = 0;
}
