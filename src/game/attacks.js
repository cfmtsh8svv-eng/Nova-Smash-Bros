// The normal attack (identical numbers for every fighter), what held items make of it
// (Sardine, Book, Megaphone, Azulejo), and everything that flies: the thrown book, the
// tile and its shards, the padel ball and the mini tram.
import { CONFIG } from './config.js';
import { getFighter } from './fighters.js';
import { applyHit, canBeHit, centreOf, feedback, HIT, hurtbox, opponentsOf, rectsOverlap } from './combat.js';
import { passProject } from './items.js';

// The area an attack covers. Ranges are measured from the middle of the body:
// sideways `range` px in the facing direction, or `range` px straight up.
export function reachBox(f, dir, facing, range, thickness) {
  const c = centreOf(f);
  if (dir === 'up') return { x: c.x - thickness / 2, y: c.y - range, w: thickness, h: range };
  return { x: facing > 0 ? c.x : c.x - range, y: c.y - thickness / 2, w: range, h: thickness };
}

export function startAttack(state, f) {
  const attack = { t: 0, dir: f.aimUp ? 'up' : 'side', facing: f.facing, kind: 'normal', hit: [] };
  // In the air without Up the attack is the stomp (D-137), unless a held Book or Azulejo is thrown instead.
  const thrown = Boolean(f.held) && (f.held.type === 'book' || f.held.type === 'azulejo');
  const stomp = !f.onGround && !f.aimUp && !thrown;
  if (stomp) {
    attack.kind = 'stomp';
    attack.dir = 'down';
    attack.phase = 'dive';
  }
  if (f.held && f.held.type === 'sardine') {
    if (stomp) attack.power = 'sardine';
    else attack.kind = 'sardine';
    f.held.uses -= 1;
    // The fifth swing uses it up at once, so it cannot come back if that swing is interrupted.
    if (f.held.uses <= 0) {
      f.held = null;
      state.events.push({ type: 'itemBreak', slot: f.slot, item: 'sardine', x: f.x, y: f.y });
    }
  } else if (thrown) {
    attack.kind = f.held.type;
  } else if (f.held && f.held.type === 'megaphone' && !stomp) {
    // The next 3 normal attacks are a sound cone. The stomp does not use the megaphone.
    attack.kind = 'megaphone';
    f.held.uses -= 1;
    if (f.held.uses <= 0) {
      f.held = null;
      state.events.push({ type: 'itemBreak', slot: f.slot, item: 'megaphone', x: f.x, y: f.y });
    }
  }
  if (stomp) {
    // The dive starts at once: no sideways movement from this frame on.
    f.vx = 0;
    f.vy = CONFIG.stomp.diveSpeed;
  }
  f.attack = attack;
  f.attackBuffer = 0;
  state.events.push({ type: 'attack', slot: f.slot, kind: attack.kind, dir: attack.dir, facing: attack.facing, x: f.x, y: f.y });
}

// Advance every running attack by one frame.
// The hits of all fighters are collected first and applied afterwards, so two
// players who swing at each other in the same frame both land their hit (a trade)
// instead of the one earlier in the list always winning.
export function updateAttacks(state) {
  const A = CONFIG.attack;
  const pending = [];
  for (const f of state.fighters) {
    const attack = f.attack;
    if (f.state !== 'alive' || !attack || attack.kind === 'stomp') continue; // the stomp runs in stomp.js
    attack.t += 1;
    if (attack.kind === 'book' || attack.kind === 'azulejo') {
      if (attack.t === A.startup) (attack.kind === 'book' ? throwBook : throwTile)(state, f, attack);
    } else if (attack.t >= A.startup && attack.t < A.startup + A.active) {
      const M = CONFIG.items.megaphone;
      const box = attack.kind === 'megaphone' ? reachBox(f, attack.dir, attack.facing, M.range, M.height) : reachBox(f, attack.dir, attack.facing, A.range, A.thickness);
      for (const o of opponentsOf(state, f)) {
        if (attack.hit.includes(o.slot) || !canBeHit(o) || !rectsOverlap(box, hurtbox(o))) continue;
        attack.hit.push(o.slot);
        pending.push({ f, o, attack });
      }
    }
    if (attack.t >= A.total) f.attack = null;
  }
  for (const { f, o, attack } of pending) {
    const item = attack.kind === 'sardine' || attack.kind === 'megaphone';
    const power = item ? CONFIG.items[attack.kind] : A;
    const up = attack.dir === 'up';
    const result = applyHit(state, o, {
      by: f.slot, kind: item ? 'item' : 'normal', source: attack.kind,
      damage: power.damage, baseKb: power.baseKb, kbGrowth: power.kbGrowth,
      angleDeg: up ? CONFIG.match.upAngleDeg : power.angleDeg ?? A.angleDeg, dirX: up ? Math.sign(o.x - f.x) || attack.facing : attack.facing,
    });
    if (result === HIT) {
      feedback(state, o.slot, 'hit', '', '#ffffff');
      passProject(state, f, o); // a Group Project goes to whoever the attack hit
    }
  }
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

// Azulejo: the tile flies like a book and shatters after a moment (D-140).
function throwTile(state, f, attack) {
  const Z = CONFIG.items.azulejo;
  const c = centreOf(f);
  const up = attack.dir === 'up';
  spawnProjectile(state, {
    kind: 'tile', owner: f.slot, w: Z.size, h: Z.size, life: Z.shatterAt + 1, gravity: 0, rolls: false, harmless: true,
    x: c.x + (up ? 0 : attack.facing * 30), y: c.y - (up ? 40 : 10),
    vx: up ? 0 : Z.speed * attack.facing, vy: up ? -Z.speed : 0, dirX: attack.facing, up,
  });
  f.held = null;
}

// The tile breaks into three shards that fan out at -12, 0 and +12 degrees around its direction.
function shatter(state, tile) {
  const Z = CONFIG.items.azulejo;
  const S = Z.shard;
  state.events.push({ type: 'fx', fx: 'shatter', x: tile.x, y: tile.y, slot: tile.owner });
  for (const spread of [-Z.spreadDeg, 0, Z.spreadDeg]) {
    // Angles above the horizon, measured in the throw's direction (straight up for an upward throw).
    const a = (((tile.up ? 90 : 0) + spread) * Math.PI) / 180;
    spawnProjectile(state, {
      kind: 'shard', owner: tile.owner, w: S.size, h: S.size, life: S.life, gravity: 0, rolls: false,
      x: tile.x, y: tile.y, vx: Math.cos(a) * S.speed * (tile.up ? 1 : tile.dirX), vy: -Math.sin(a) * S.speed, dirX: tile.dirX,
    });
  }
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
  if (p.kind === 'shard') {
    const S = CONFIG.items.azulejo.shard;
    return { kind: 'item', damage: S.damage, baseKb: S.baseKb, kbGrowth: S.kbGrowth, angleDeg: S.angleDeg, once: true };
  }
  if (p.kind === 'tile') return null; // the tile itself does not hit, only its shards (D-142)
  const owner = state.fighters.find((f) => f.slot === p.owner);
  const S = getFighter(owner.fighterId).special;
  return { kind: 'special', damage: S.damage, baseKb: S.baseKb, kbGrowth: S.kbGrowth, angleDeg: S.angleDeg, once: p.kind === 'ball', special: S };
}

export function updateProjectiles(state) {
  const B = CONFIG.blast;
  for (const p of [...state.projectiles]) {
    p.age += 1;
    if (p.kind === 'tile' && p.age >= CONFIG.items.azulejo.shatterAt) {
      p.life = 0;
      shatter(state, p);
      continue;
    }
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
    // A ball or book that flies into the solid ground stops there: nothing reaches through the floor.
    if (!p.rolls && state.stage.platforms.some((pl) => pl.solid && p.x > pl.x && p.x < pl.x + pl.w && p.y > pl.y && p.y < pl.y + pl.h)) p.life = 0;
    const box = { x: p.x - p.w / 2, y: p.y - p.h / 2, w: p.w, h: p.h };
    const info = projectileHit(state, p);
    for (const o of state.fighters) {
      if (p.life <= 0 || !info) break;
      if (o.slot === p.owner || p.hit.includes(o.slot) || !canBeHit(o) || !rectsOverlap(box, hurtbox(o))) continue;
      p.hit.push(o.slot);
      const dirX = Math.sign(p.vx) || Math.sign(o.x - p.x) || p.dirX;
      const result = applyHit(state, o, { by: p.owner, kind: info.kind, source: p.kind, damage: info.damage, baseKb: info.baseKb, kbGrowth: info.kbGrowth, angleDeg: info.angleDeg, dirX });
      if (result === HIT) {
        if (info.special) feedback(state, o.slot, 'special', info.special.phone, info.special.flash, { special: info.special.id });
        else feedback(state, o.slot, 'hit', '', '#ffffff');
      }
      if (result && info.once) p.life = 0;
    }
    if (p.x < B.left || p.x > B.right || p.y < B.top || p.y > B.bottom) p.life = 0;
  }
  state.projectiles = state.projectiles.filter((p) => p.life > 0);
}
