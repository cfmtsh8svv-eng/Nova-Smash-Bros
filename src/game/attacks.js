// The normal attack (identical numbers for every fighter) and everything that flies:
// the thrown book, the padel ball and the mini tram.
import { CONFIG } from './config.js';
import { getFighter } from './fighters.js';
import { applyHit, canBeHit, centreOf, feedback, hurtbox, opponentsOf, rectsOverlap } from './combat.js';

// The area an attack covers. Ranges are measured from the middle of the body:
// sideways `range` px in the facing direction, or `range` px straight up.
export function reachBox(f, dir, facing, range, thickness) {
  const c = centreOf(f);
  if (dir === 'up') return { x: c.x - thickness / 2, y: c.y - range, w: thickness, h: range };
  return { x: facing > 0 ? c.x : c.x - range, y: c.y - thickness / 2, w: range, h: thickness };
}

export function startAttack(state, f) {
  const attack = { t: 0, dir: f.aimUp ? 'up' : 'side', facing: f.facing, kind: 'normal', hit: [] };
  if (f.held && f.held.type === 'sardine') {
    attack.kind = 'sardine';
    f.held.uses -= 1;
    // The fifth swing uses it up at once, so it cannot come back if that swing is interrupted.
    if (f.held.uses <= 0) {
      f.held = null;
      state.events.push({ type: 'itemBreak', slot: f.slot, item: 'sardine', x: f.x, y: f.y });
    }
  } else if (f.held && f.held.type === 'book') {
    attack.kind = 'book';
  }
  f.attack = attack;
  f.attackBuffer = 0;
  state.events.push({ type: 'attack', slot: f.slot, kind: attack.kind, dir: attack.dir, facing: attack.facing, x: f.x, y: f.y });
}

export function updateAttack(state, f) {
  const attack = f.attack;
  if (!attack) return;
  const A = CONFIG.attack;
  attack.t += 1;
  if (attack.kind === 'book') {
    if (attack.t === A.startup) throwBook(state, f, attack);
  } else if (attack.t >= A.startup && attack.t < A.startup + A.active) {
    const box = reachBox(f, attack.dir, attack.facing, A.range, A.thickness);
    const power = attack.kind === 'sardine' ? CONFIG.items.sardine : A;
    for (const o of opponentsOf(state, f)) {
      if (attack.hit.includes(o.slot) || !canBeHit(o) || !rectsOverlap(box, hurtbox(o))) continue;
      attack.hit.push(o.slot);
      const up = attack.dir === 'up';
      const landed = applyHit(state, o, {
        by: f.slot, kind: attack.kind === 'sardine' ? 'item' : 'normal', source: attack.kind,
        damage: power.damage, baseKb: power.baseKb, kbGrowth: power.kbGrowth,
        angleDeg: up ? CONFIG.match.upAngleDeg : A.angleDeg, dirX: up ? Math.sign(o.x - f.x) || attack.facing : attack.facing,
      });
      if (landed) feedback(state, o.slot, 'hit', '', '#ffffff');
    }
  }
  if (attack.t >= A.total) f.attack = null;
}

function throwBook(state, f, attack) {
  const B = CONFIG.items.book;
  const c = centreOf(f);
  const up = attack.dir === 'up';
  spawnProjectile(state, {
    kind: 'book', owner: f.slot, w: B.size, h: B.size, life: B.life, gravity: 0, rolls: false,
    x: c.x + (up ? 0 : attack.facing * 30), y: c.y - (up ? 40 : 10),
    vx: up ? 0 : B.speed * attack.facing, vy: up ? -B.speed : 0, dirX: attack.facing,
  });
  f.held = null;
}

export function spawnProjectile(state, p) {
  state.nextId += 1;
  const projectile = { id: state.nextId, hit: [], grounded: false, age: 0, ...p };
  state.projectiles.push(projectile);
  state.events.push({ type: 'projectile', id: projectile.id, kind: p.kind, slot: p.owner, x: p.x, y: p.y });
  return projectile;
}

// What a projectile does when it touches a fighter.
function projectileHit(state, p) {
  if (p.kind === 'book') {
    const B = CONFIG.items.book;
    return { kind: 'item', damage: B.damage, baseKb: B.baseKb, kbGrowth: B.kbGrowth, angleDeg: B.angleDeg, once: true };
  }
  const owner = state.fighters.find((f) => f.slot === p.owner);
  const S = getFighter(owner.fighterId).special;
  return { kind: 'special', damage: S.damage, baseKb: S.baseKb, kbGrowth: S.kbGrowth, angleDeg: S.angleDeg, once: p.kind === 'ball', special: S };
}

export function updateProjectiles(state) {
  const B = CONFIG.blast;
  for (const p of state.projectiles) {
    p.age += 1;
    p.life -= 1;
    const prevBottom = p.y + p.h / 2;
    p.vy += p.gravity;
    p.x += p.vx;
    p.y += p.vy;
    if (p.rolls) {
      // The mini tram lands on any platform and then rolls along it.
      p.grounded = false;
      for (const pl of state.stage.platforms) {
        const bottom = p.y + p.h / 2;
        if (p.vy >= 0 && prevBottom <= pl.y + 0.01 && bottom >= pl.y && p.x >= pl.x && p.x <= pl.x + pl.w) {
          p.y = pl.y - p.h / 2;
          p.vy = 0;
          p.grounded = true;
          p.vx = p.rollSpeed * p.dirX;
        }
      }
    }
    const box = { x: p.x - p.w / 2, y: p.y - p.h / 2, w: p.w, h: p.h };
    const info = projectileHit(state, p);
    for (const o of state.fighters) {
      if (p.life <= 0) break;
      if (o.slot === p.owner || p.hit.includes(o.slot) || !canBeHit(o) || !rectsOverlap(box, hurtbox(o))) continue;
      p.hit.push(o.slot);
      const dirX = Math.sign(p.vx) || Math.sign(o.x - p.x) || p.dirX;
      const landed = applyHit(state, o, { by: p.owner, kind: info.kind, source: p.kind, damage: info.damage, baseKb: info.baseKb, kbGrowth: info.kbGrowth, angleDeg: info.angleDeg, dirX });
      if (landed) {
        if (info.special) feedback(state, o.slot, 'special', info.special.phone, info.special.flash, { special: info.special.id });
        else feedback(state, o.slot, 'hit', '', '#ffffff');
        if (info.once) p.life = 0;
      }
    }
    if (p.x < B.left || p.x > B.right || p.y < B.top || p.y > B.bottom) p.life = 0;
  }
  state.projectiles = state.projectiles.filter((p) => p.life > 0);
}
