// The eight special attacks. Each one only reaches as far as its range says,
// and every opponent it hits gets a message on their own phone.
import { CONFIG } from './config.js';
import { getFighter } from './fighters.js';
import { applyHit, canBeHit, centreOf, distance, feedback, hurtbox, opponentsOf, rectsOverlap } from './combat.js';
import { reachBox, spawnProjectile } from './attacks.js';

export function startSpecial(state, f) {
  const S = getFighter(f.fighterId).special;
  f.special = { id: S.id, t: 0, dir: f.aimUp ? 'up' : 'side', facing: f.facing, hit: [], lock: true, phase: 'start' };
  f.cooldown = S.cooldown;
  f.cooldownMax = S.cooldown;
  f.specialBuffer = 0;
  state.events.push({ type: 'special', slot: f.slot, special: S.id, dir: f.special.dir, facing: f.facing, x: f.x, y: f.y });
}

const tell = (state, o, S) => feedback(state, o.slot, 'special', S.phone, S.flash, { special: S.id });
const inRadius = (state, f, radius) => opponentsOf(state, f).filter((o) => canBeHit(o) && distance(centreOf(f), centreOf(o)) <= radius);

// Runs once per frame for a fighter who is in a special, before the fighter moves.
export function updateSpecial(state, f) {
  const sp = f.special;
  if (!sp) return;
  const S = getFighter(f.fighterId).special;
  sp.t += 1;
  UPDATE[sp.id](state, f, sp, S);
}

const UPDATE = {
  // Finance Bro: banknotes in a radius. Opponents slip and slide away.
  cash_rain(state, f, sp, S) {
    sp.lock = sp.t < S.at;
    if (sp.t === S.at) {
      state.events.push({ type: 'fx', fx: 'cash_rain', x: f.x, y: f.y - 48, radius: S.radius, slot: f.slot });
      for (const o of inRadius(state, f, S.radius)) {
        if (!applyHit(state, o, { by: f.slot, kind: 'special', source: S.id, damage: S.damage })) continue;
        o.slip = S.slipFrames;
        o.vx = (Math.sign(o.x - f.x) || f.facing) * S.push;
        tell(state, o, S);
      }
    }
    if (sp.t >= S.total) f.special = null;
  },

  // Maastricht Blondie: a padel ball that hits the first opponent in its way.
  padel_smash(state, f, sp, S) {
    sp.lock = sp.t < S.at;
    if (sp.t === S.at) {
      const c = centreOf(f);
      const up = sp.dir === 'up';
      spawnProjectile(state, {
        kind: 'ball', owner: f.slot, w: S.size, h: S.size, life: Math.round(S.range / S.speed), gravity: 0, rolls: false,
        x: c.x + (up ? 0 : sp.facing * 26), y: c.y - (up ? 40 : 8),
        vx: up ? 0 : S.speed * sp.facing, vy: up ? -S.speed : 0, dirX: sp.facing,
      });
    }
    if (sp.t >= S.total) f.special = null;
  },

  // Bairro Chad: everyone in a radius is tipsy (left and right swapped).
  rounds_on_me(state, f, sp, S) {
    sp.lock = sp.t < S.at;
    if (sp.t === S.at) {
      state.events.push({ type: 'fx', fx: 'rounds_on_me', x: f.x, y: f.y - 48, radius: S.radius, slot: f.slot });
      for (const o of inRadius(state, f, S.radius)) {
        if (!applyHit(state, o, { by: f.slot, kind: 'special', source: S.id, damage: S.damage })) continue;
        o.tipsy = Math.max(o.tipsy, S.tipsyFrames);
        tell(state, o, S);
      }
    }
    if (sp.t >= S.total) f.special = null;
  },

  // Surfer Girl: rides a wave forward (or up) and carries opponents along.
  wave_rider(state, f, sp, S) {
    const rideFrames = Math.round(S.range / S.speed);
    const up = sp.dir === 'up';
    const riding = sp.t > S.at && sp.t <= S.at + rideFrames;
    sp.lock = true;
    sp.phase = riding ? 'ride' : sp.t <= S.at ? 'start' : 'end';
    if (riding) {
      f.vx = up ? 0 : S.speed * sp.facing;
      f.vy = up ? -S.speed : 0;
      f.gravityScale = 0;
      if (up) f.onGround = false;
      const mine = hurtbox(f);
      const box = { x: mine.x - S.reach, y: mine.y - S.reach, w: mine.w + 2 * S.reach, h: mine.h + 2 * S.reach };
      for (const o of opponentsOf(state, f)) {
        if (!canBeHit(o) || !rectsOverlap(box, hurtbox(o))) continue;
        if (!sp.hit.includes(o.slot)) {
          if (!applyHit(state, o, { by: f.slot, kind: 'special', source: S.id, damage: S.damage })) continue;
          sp.hit.push(o.slot);
          tell(state, o, S);
        }
        if (o.state !== 'alive') continue;
        o.vx = f.vx; // carried along with the wave
        o.vy = up ? f.vy : Math.min(o.vy, 0);
        o.stun = Math.max(o.stun, S.endStun);
        if (up) o.onGround = false;
      }
    }
    if (sp.t === S.at + rideFrames + 1) {
      f.vx *= 0.4;
      f.vy *= 0.4;
    }
    if (sp.t >= S.total) f.special = null;
  },

  // Wannabe Influencer: only the nearest opponent in range is blinded.
  ring_light_flash(state, f, sp, S) {
    sp.lock = sp.t < S.at;
    if (sp.t === S.at) {
      state.events.push({ type: 'fx', fx: 'ring_light_flash', x: f.x, y: f.y - 70, radius: S.radius, slot: f.slot });
      const me = centreOf(f);
      const near = inRadius(state, f, S.radius).sort((a, b) => distance(me, centreOf(a)) - distance(me, centreOf(b)) || a.slot - b.slot)[0];
      if (near && applyHit(state, near, { by: f.slot, kind: 'special', source: S.id, damage: S.damage })) {
        near.stun = Math.max(near.stun, S.stunFrames);
        near.attack = null;
        near.special = null;
        tell(state, near, S);
      }
    }
    if (sp.t >= S.total) f.special = null;
  },

  // House DJ: hop, slam down, and the shockwave launches everyone nearby upward.
  bass_drop(state, f, sp, S) {
    sp.lock = true;
    if (sp.phase === 'recover') {
      if (sp.t >= sp.endAt) f.special = null;
      return;
    }
    if (sp.t === 1) {
      f.vy = -S.hop;
      f.vx *= 0.3;
      f.onGround = false;
      sp.phase = 'hop';
      return;
    }
    const landed = f.onGround && sp.t > 2;
    if (landed || sp.t >= S.maxAir) {
      state.events.push({ type: 'fx', fx: 'bass_drop', x: f.x, y: f.y, radius: S.radius, slot: f.slot });
      for (const o of inRadius(state, f, S.radius)) {
        const hit = applyHit(state, o, {
          by: f.slot, kind: 'special', source: S.id, damage: S.damage, baseKb: S.baseKb, kbGrowth: S.kbGrowth,
          angleDeg: 80, dirX: Math.sign(o.x - f.x) || sp.facing,
        });
        if (hit) tell(state, o, S);
      }
      sp.phase = 'recover';
      sp.endAt = sp.t + S.recovery;
      return;
    }
    if (sp.t >= S.slamAt) {
      sp.phase = 'slam';
      f.vx = 0;
      f.vy = S.slam;
      f.gravityScale = 0;
    }
  },

  // Lisboa OG: a mini Tram 28 that rolls along the ground and runs opponents over.
  ding_ding(state, f, sp, S) {
    sp.lock = sp.t < S.at;
    if (sp.t === S.at) {
      const up = sp.dir === 'up';
      spawnProjectile(state, {
        kind: 'tram', owner: f.slot, w: S.w, h: S.h, life: Math.round(S.range / S.speed), gravity: CONFIG.physics.gravity,
        rolls: true, rollSpeed: S.speed, dirX: sp.facing,
        x: f.x + (up ? 0 : sp.facing * 40), y: f.y - S.h / 2 - (up ? CONFIG.body.h : 1),
        vx: up ? 2 * sp.facing : S.speed * sp.facing, vy: up ? -S.toss : 0,
      });
    }
    if (sp.t >= S.total) f.special = null;
  },

  // Carcavelos Gang Member: the lasso pulls the first opponent it reaches to him.
  spaghetti_lasso(state, f, sp, S) {
    sp.lock = sp.t < S.total - 8;
    if (sp.t === S.at) {
      const box = reachBox(f, sp.dir, sp.facing, S.range, S.thickness);
      const me = centreOf(f);
      const first = opponentsOf(state, f)
        .filter((o) => canBeHit(o) && rectsOverlap(box, hurtbox(o)))
        .sort((a, b) => distance(me, centreOf(a)) - distance(me, centreOf(b)) || a.slot - b.slot)[0];
      state.events.push({ type: 'fx', fx: 'spaghetti_lasso', x: f.x, y: f.y - 48, dir: sp.dir, facing: sp.facing, range: S.range, slot: f.slot, target: first ? first.slot : null });
      if (first && applyHit(state, first, { by: f.slot, kind: 'special', source: S.id, damage: S.damage })) {
        first.stun = Math.max(first.stun, S.stunFrames);
        first.attack = null;
        first.special = null;
        const up = sp.dir === 'up';
        first.pull = { tx: up ? f.x : f.x + sp.facing * S.pullGap, ty: up ? f.y - CONFIG.body.h - 4 : f.y, t: S.pullFrames };
        sp.target = first.slot;
        tell(state, first, S);
      }
    }
    if (sp.t >= S.total) f.special = null;
  },
};
