// The stomp (GAME_SPEC §6, D-137): Attack in the air without Up.
// The fighter stops moving sideways and drops straight down; on landing a ring-shaped
// shockwave hits every opponent in the radius. Then a short recovery, which is its cost.
// It is a normal attack, so it has no cooldown.
import { CONFIG } from './config.js';
import { applyHit, canBeHit, centreOf, distance, feedback, HIT, opponentsOf } from './combat.js';

// Runs once per frame for a fighter in a stomp, before the fighter moves.
export function updateStomp(state, f) {
  const attack = f.attack;
  if (!attack || attack.kind !== 'stomp') return;
  const S = CONFIG.stomp;
  attack.t += 1;
  if (attack.phase === 'recover') {
    if (attack.t >= attack.endAt) f.attack = null;
    return;
  }
  if (f.onGround && attack.t > 1) {
    shockwave(state, f, attack);
    attack.phase = 'recover';
    attack.endAt = attack.t + S.recovery;
    return;
  }
  if (attack.t > S.maxAir) {
    // Fell past the stage (or stayed in the air too long): no shockwave, gravity takes over.
    f.attack = null;
    return;
  }
  f.vx = 0;
  f.vy = S.diveSpeed;
  f.gravityScale = 0;
}

function shockwave(state, f, attack) {
  const S = CONFIG.stomp;
  // A Sardine powers the stomp: its damage and knockback, at the stomp's angle.
  const power = attack.power === 'sardine' ? CONFIG.items.sardine : S;
  state.events.push({ type: 'fx', fx: 'stomp', x: f.x, y: f.y, radius: S.radius, slot: f.slot, power: attack.power || null });
  const me = centreOf(f);
  for (const o of opponentsOf(state, f)) {
    if (!canBeHit(o) || distance(me, centreOf(o)) > S.radius) continue;
    const result = applyHit(state, o, {
      by: f.slot, kind: attack.power === 'sardine' ? 'item' : 'normal', source: 'stomp',
      damage: power.damage, baseKb: power.baseKb, kbGrowth: power.kbGrowth, angleDeg: S.angleDeg,
      dirX: Math.sign(o.x - f.x) || attack.facing,
    });
    if (result === HIT) feedback(state, o.slot, 'hit', '', '#ffffff');
  }
}
