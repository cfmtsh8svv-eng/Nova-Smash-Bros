// The nine items (GAME_SPEC §7.3, D-140 to D-142): what each one does, and the limits
// (four at once, weighted chances, one held item, the forced Group Project).
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, seconds } from '../../src/game/config.js';
import { spawnItem, ITEM_TYPES, ITEM_NAMES, ITEM_WEIGHTS, pickItemType, effectiveWeight } from '../../src/game/items.js';
import { applyHit } from '../../src/game/combat.js';
import { beginWarning } from '../../src/game/hazards.js';
import { phoneStatus, step } from '../../src/game/match.js';
import { fight, place, run, tap, of, feedbackFor } from '../helpers/game.js';

const I = CONFIG.items;

// A fighter standing at x=400 with the item right at their feet. Runs until it is picked up.
function withItem(type, { percent = 0, fighters } = {}) {
  const state = fight({ fighters });
  const [a, b] = state.fighters;
  place(a, 400);
  place(b, 1000);
  a.percent = percent;
  spawnItem(state, type, 400, 600);
  const events = run(state, 25);
  return { state, a, b, events };
}

// ---- the set ----

test('nine items with their names; the Espresso is gone', () => {
  assert.deepEqual(ITEM_TYPES, ['nata', 'sardine', 'book', 'project', 'bifana', 'megaphone', 'cork', 'azulejo', 'rooster']);
  assert.deepEqual(ITEM_NAMES, {
    nata: 'Pastel de Nata', sardine: 'Sardine', book: 'Book', project: 'Group Project', bifana: 'Bifana',
    megaphone: 'Megaphone', cork: 'Cork Shield', azulejo: 'Azulejo', rooster: 'Lucky Rooster',
  });
  assert.ok(!('espressoBoost' in I) && !('espressoFrames' in I));
});

test('spawn chances: Lucky Rooster 4 %, the other eight 12 % each, drawn with the seeded random numbers', () => {
  assert.equal(ITEM_WEIGHTS.rooster, 4);
  for (const type of ITEM_TYPES.filter((t) => t !== 'rooster')) assert.equal(ITEM_WEIGHTS[type], 12, type);
  assert.equal(Object.values(ITEM_WEIGHTS).reduce((a, b) => a + b, 0), 100);
  const state = fight({ seed: 5 });
  const count = Object.fromEntries(ITEM_TYPES.map((t) => [t, 0]));
  const n = 20000;
  for (let i = 0; i < n; i++) count[pickItemType(state)] += 1;
  assert.ok(Math.abs(count.rooster / n - 0.04) < 0.01, `rooster ${count.rooster / n}`);
  for (const type of ITEM_TYPES.filter((t) => t !== 'rooster')) assert.ok(Math.abs(count[type] / n - 0.12) < 0.015, `${type} ${count[type] / n}`);
  const again = fight({ seed: 5 });
  const first = fight({ seed: 5 });
  assert.deepEqual([...Array(20)].map(() => pickItemType(again)), [...Array(20)].map(() => pickItemType(first)), 'the same seed, the same items');
});

test('a new item every 6 to 10 s, never more than four at once, each gone after 25 s', () => {
  assert.deepEqual([I.spawnMinS, I.spawnMaxS, I.max, I.lifetime], [6, 10, 4, seconds(25)]);
  const state = fight({ settings: { items: true } });
  // Park both fighters out of the way, in the air above the stage, so nothing gets picked up.
  const park = () => state.fighters.forEach((f, i) => Object.assign(f, { x: 600 + i * 80, y: 100, vx: 0, vy: 0, gravityScale: 0 }));
  const spawnFrames = [];
  const seen = new Set();
  for (let i = 0; i < 60 * 120; i++) {
    park();
    const events = run(state, 1);
    for (const e of of(events, 'itemSpawn')) {
      spawnFrames.push(state.frame);
      seen.add(e.item);
    }
    assert.ok(state.items.length <= 4, 'at most four items');
    for (const item of state.items) assert.ok(item.age <= I.lifetime, 'gone after 25 s');
  }
  assert.ok(spawnFrames.length >= 10, `items did spawn (${spawnFrames.length})`);
  for (let i = 1; i < spawnFrames.length; i++) {
    const gap = spawnFrames[i] - spawnFrames[i - 1];
    // A spawn that finds four items already lying there waits for the next turn.
    assert.ok(gap >= 6 * 60, `gap of ${gap} frames is at least 6 s`);
  }
  assert.ok(spawnFrames.slice(0, 3).every((f, i) => i === 0 || f - spawnFrames[i - 1] <= 10 * 60 + 1), 'the first ones come at most 10 s apart');
  for (const type of seen) assert.ok(ITEM_TYPES.includes(type));
});

test('spawnItem refuses a fifth item', () => {
  const state = fight();
  for (const [i, type] of ['nata', 'book', 'sardine', 'cork'].entries()) assert.ok(spawnItem(state, type, 200 + i * 100, 600));
  assert.equal(spawnItem(state, 'bifana', 700, 600), null);
  assert.equal(state.items.length, 4);
});

test('with items switched off none appear', () => {
  const state = fight({ settings: { items: false } });
  const events = run(state, 60 * 60);
  assert.equal(of(events, 'itemSpawn').length, 0);
});

test('items spawn on a platform surface', () => {
  const state = fight({ stage: 'bairro', settings: { items: true }, seed: 11 });
  for (let i = 0; i < 60 * 60; i++) {
    for (const e of of(run(state, 1), 'itemSpawn')) {
      const p = state.stage.platforms.find((pl) => pl.y === e.y && e.x >= pl.x && e.x <= pl.x + pl.w);
      assert.ok(p, `item at ${e.x},${e.y} is on a platform`);
    }
  }
});

test('an item cannot be taken in the first moment after it appears', () => {
  const state = fight();
  place(state.fighters[0], 400).percent = 50;
  spawnItem(state, 'nata', 400, 600);
  run(state, 5);
  assert.equal(state.items.length, 1);
  assert.equal(state.fighters[0].percent, 50);
});

test('every item has a pick-up line on the phone of the player who took it', () => {
  for (const type of ITEM_TYPES) {
    const { events } = withItem(type, { percent: 30 });
    const lines = of(events, 'feedback').filter((e) => e.kind === 'good');
    assert.deepEqual(lines.map((e) => e.slot), [0], type);
    assert.ok(lines[0].text.length > 5, `${type}: ${lines[0].text}`);
    assert.equal(lines[0].item, type);
  }
});

// ---- Pastel de Nata ----

test('Pastel de Nata heals 20 % on touch, never below 0 %', () => {
  const { state, a, events } = withItem('nata', { percent: 50 });
  assert.equal(a.percent, 30);
  assert.equal(state.items.length, 0);
  assert.deepEqual(of(events, 'itemPickup').map((e) => [e.slot, e.item]), [[0, 'nata']]);
  assert.deepEqual(feedbackFor(events, 'good'), [0]);
  assert.equal(withItem('nata', { percent: 12 }).a.percent, 0);
  assert.equal(withItem('nata', { percent: 0 }).a.percent, 0);
});

// ---- Sardine and Book (unchanged) ----

test('Sardine: the next 5 normal attacks do 6 % with very high knockback, then it breaks', () => {
  const { state, a, b } = withItem('sardine', { fighters: ['finance_bro', 'bairro_chad'] });
  assert.deepEqual(a.held, { type: 'sardine', uses: 5 });
  const speeds = [];
  for (let swing = 1; swing <= 5; swing++) {
    place(a, 400);
    place(b, 460);
    a.facing = 1;
    b.percent = 0;
    b.hitstun = 0;
    const events = tap(state, 0, { attack: true }, CONFIG.attack.total + 2);
    assert.equal(b.percent, 6, `swing ${swing} does 6 %`);
    speeds.push(of(events, 'hit')[0].speed);
    if (swing < 5) assert.equal(a.held.uses, 5 - swing);
    else assert.equal(of(events, 'itemBreak').length, 1);
  }
  assert.equal(a.held, null, 'broken after five swings');
  place(a, 400);
  place(b, 460);
  b.percent = 0;
  b.hitstun = 0;
  const normal = of(tap(state, 0, { attack: true }, CONFIG.attack.total + 2), 'hit')[0];
  assert.equal(b.percent, 8, 'the sixth attack is a normal one again');
  assert.ok(speeds[0] > normal.speed * 1.8, `sardine ${speeds[0]} vs normal ${normal.speed}`);
});

test('Sardine: it is gone after the fifth swing even if that swing is interrupted', () => {
  const { state, a, b } = withItem('sardine', { fighters: ['finance_bro', 'bairro_chad'] });
  for (let i = 0; i < 4; i++) tap(state, 0, { attack: true }, CONFIG.attack.total + 2);
  assert.equal(a.held.uses, 1);
  place(a, 400);
  place(b, 440);
  b.facing = -1;
  tap(state, 1, { attack: true }, 3);
  tap(state, 0, { attack: true }, 1);
  run(state, 30);
  assert.ok(a.percent > 0, 'the swing was interrupted by a hit');
  assert.equal(a.held, null);
});

test('Book: the next normal attack throws it for 14 %', () => {
  const { state, a, b } = withItem('book');
  place(b, 700);
  a.facing = 1;
  const events = tap(state, 0, { attack: true }, 40);
  assert.equal(of(events, 'projectile')[0].kind, 'book');
  assert.equal(b.percent, 14);
  assert.equal(a.held, null);
  assert.equal(state.projectiles.length, 0, 'the book is gone after the hit');
});

test('Book: the throw has no close-range swing and misses out of reach', () => {
  const { state, a, b } = withItem('book');
  place(b, 400 + 13 * 46 + 120);
  a.facing = 1;
  tap(state, 0, { attack: true }, 80);
  assert.equal(b.percent, 0);
  assert.equal(state.projectiles.length, 0);
});

// ---- one held item ----

test('one held item at a time: a second one stays on the ground, but an on-touch item is still taken', () => {
  const { state, a } = withItem('sardine');
  for (const type of ['book', 'megaphone', 'cork', 'azulejo']) {
    spawnItem(state, type, 400, 600);
    run(state, 30);
    assert.equal(a.held.type, 'sardine', type);
    state.items = [];
  }
  a.percent = 40;
  spawnItem(state, 'nata', 400, 600);
  run(state, 25);
  assert.equal(a.percent, 20);
});

test('a KO drops everything: held item, Bifana and Rooster', () => {
  const { state, a } = withItem('sardine');
  a.bifana = 100;
  a.rooster = 100;
  a.x = -1000;
  run(state, 1);
  assert.equal(a.state, 'dead');
  assert.deepEqual([a.held, a.bifana, a.rooster], [null, 0, 0]);
  run(state, CONFIG.match.respawnFrames + 1);
  assert.equal(a.held, null);
});

// ---- Group Project ----

test('Group Project: taken even with full hands; the item held before drops to the ground', () => {
  const { state, a } = withItem('book');
  spawnItem(state, 'project', 400, 600);
  const events = run(state, 25);
  assert.equal(a.held.type, 'project');
  assert.equal(a.held.fuse, I.project.fuseFrames - (25 - I.spawnInFrames), 'the fuse started at the pick-up');
  const dropped = state.items.find((i) => i.type === 'book');
  assert.ok(dropped, 'the book lies on the ground');
  assert.equal(dropped.y, 600);
  assert.deepEqual(of(events, 'itemDrop').map((e) => e.item), ['book']);
  assert.deepEqual(feedbackFor(events, 'good'), [0]);
  assert.equal(of(events, 'feedback').find((e) => e.item === 'project').text, 'Group project! Pass it on before the deadline!');
  // The dropped book cannot be picked up while the project is in the hands.
  run(state, 30);
  assert.equal(a.held.type, 'project');
});

test('Group Project: a normal attack that hits passes it on, and the fuse does not reset', () => {
  const { state, a, b } = withItem('project');
  const fuse = a.held.fuse;
  place(a, 400);
  place(b, 460);
  a.facing = 1;
  const events = tap(state, 0, { attack: true }, CONFIG.attack.total);
  assert.equal(b.percent, CONFIG.attack.damage);
  assert.equal(a.held, null);
  assert.equal(b.held.type, 'project');
  assert.equal(b.held.from, a.slot);
  assert.equal(b.held.fuse, fuse - CONFIG.attack.total, 'the fuse kept running');
  assert.deepEqual(of(events, 'itemPass').map((e) => [e.from, e.to]), [[0, 1]]);
  assert.ok(of(events, 'feedback').some((e) => e.slot === 1 && e.item === 'project'), "the new holder's phone is told");
});

test('Group Project: a swing that misses does not pass it', () => {
  const { state, a, b } = withItem('project');
  place(b, 900);
  tap(state, 0, { attack: true }, CONFIG.attack.total);
  assert.equal(a.held.type, 'project');
  assert.equal(b.held, null);
});

test('Group Project: when the fuse runs out it explodes on the holder: 18 %, a strong launch upward', () => {
  const { state, a, b } = withItem('project', { fighters: ['finance_bro', 'house_dj'] });
  place(a, 400);
  place(b, 460);
  a.facing = 1;
  tap(state, 0, { attack: true }, CONFIG.attack.total); // passed to b
  const percent = b.percent;
  let events = [];
  let guard = 0;
  while (b.held && guard++ < 400) events = step(state, {});
  const blast = of(events, 'hit').find((e) => e.source === 'project');
  assert.ok(blast, 'it exploded');
  assert.equal(b.percent, percent + I.project.damage);
  assert.equal(b.held, null);
  assert.ok(b.vy < 0 && Math.abs(b.vy) > Math.abs(b.vx) * 2, 'launched steeply upward (70°)');
  assert.equal(blast.by, 0, 'credited to the player who passed it');
  assert.equal(of(events, 'fx').filter((e) => e.fx === 'project').length, 1);
});

test('Group Project: the fuse counts 5 s from the first pick-up; the phone sees the seconds left', () => {
  const { state, a } = withItem('project');
  assert.equal(phoneStatus(state, 0).held, 'project');
  assert.equal(phoneStatus(state, 0).fuse, Math.ceil(a.held.fuse / 60));
  const first = a.held.fuse;
  run(state, 60);
  assert.equal(a.held.fuse, first - 60);
  run(state, a.held.fuse);
  assert.equal(a.held, null, 'exploded after 5 s in total');
  assert.equal(phoneStatus(state, 0).fuse, null);
});

test('Group Project: seagulls cannot steal it, the Cork Shield does not stop the explosion', () => {
  const state = fight({ stage: 'beach', settings: { hazards: true } });
  const [a] = state.fighters;
  place(a, 640);
  a.held = { type: 'project', fuse: 1e6, from: null }; // a fuse that outlasts the flock
  beginWarning(state, { id: 'gulls', zone: 'sand', dir: 1 });
  const events = [];
  for (let i = 0; i < 2000 && state.hazard.phase !== 'idle'; i++) events.push(...step(state, {}));
  assert.equal(state.hazard.phase, 'idle', 'the flock has flown');
  assert.equal(a.held.type, 'project', 'not stolen');
  assert.equal(of(events, 'itemStolen').filter((e) => e.slot === 0).length, 0);
});

// ---- Bifana ----

test('Bifana: eaten at once, weight +40 for 10 s, so the same hit launches less', () => {
  const { state, a, events } = withItem('bifana');
  assert.equal(a.held, null, 'not held');
  assert.deepEqual(of(events, 'itemPickup').map((e) => e.item), ['bifana']);
  assert.equal(effectiveWeight(a), a.weight + 40);
  const hit = { by: 1, kind: 'normal', damage: 0, baseKb: 6, kbGrowth: 9, angleDeg: 45, dirX: 1 };
  applyHit(state, a, hit);
  const heavy = Math.hypot(a.vx, a.vy);
  run(state, I.bifana.frames);
  assert.equal(a.bifana, 0);
  assert.equal(effectiveWeight(a), a.weight);
  place(a, 400);
  a.hitstun = 0;
  applyHit(state, a, hit);
  const normal = Math.hypot(a.vx, a.vy);
  assert.ok(Math.abs(heavy / normal - a.weight / (a.weight + 40)) < 0.02, `${heavy} vs ${normal}`);
  assert.equal(phoneStatus(state, 0).buff, null);
});

// ---- Megaphone ----

test('Megaphone: the next 3 normal attacks are a wide sound cone, 3 % and a strong push', () => {
  const { state, a, b } = withItem('megaphone', { fighters: ['finance_bro', 'house_dj', 'surfer_girl'] });
  const c = state.fighters[2];
  assert.deepEqual(a.held, { type: 'megaphone', uses: 3 });
  for (let blast = 1; blast <= 3; blast++) {
    place(a, 400);
    place(b, 400 + 180); // 180 px away: far beyond the normal 90 px reach, inside the 200 px cone
    place(c, 400 - 120); // behind: not hit
    a.facing = 1;
    for (const f of [b, c]) { f.percent = 0; f.hitstun = 0; }
    const events = tap(state, 0, { attack: true }, CONFIG.attack.total + 2);
    assert.equal(b.percent, 3, `blast ${blast}`);
    assert.equal(c.percent, 0, 'behind the megaphone: nothing');
    assert.equal(of(events, 'attack')[0].kind, 'megaphone');
    assert.ok(b.vx > Math.abs(b.vy) * 2, 'pushed forward, flat (15°)');
  }
  assert.equal(a.held, null, 'used up after three');
});

test('Megaphone: Up + Attack blasts upward; in the air without Up the stomp does not use it', () => {
  const { state, a, b } = withItem('megaphone');
  place(a, 400);
  Object.assign(b, { x: 400, y: 600 - 180, vx: 0, vy: 0, onGround: false, gravityScale: 0 });
  tap(state, 0, { attack: true, up: true }, CONFIG.attack.startup + 2);
  assert.equal(b.percent, 3, 'hit 180 px above');
  assert.ok(b.vy < 0);
  assert.equal(a.held.uses, 2);
  run(state, CONFIG.attack.total);
  Object.assign(a, { y: 100, onGround: false, vy: 0 });
  tap(state, 0, { attack: true }, 1);
  assert.equal(a.attack.kind, 'stomp');
  assert.equal(a.held.uses, 2, 'the stomp did not use the megaphone');
});

// ---- Cork Shield ----

test('Cork Shield: blocks the next hit completely, then breaks', () => {
  const { state, a, b } = withItem('cork');
  assert.equal(a.held.type, 'cork');
  place(a, 460);
  place(b, 400);
  b.facing = 1;
  const events = tap(state, 1, { attack: true }, CONFIG.attack.total);
  assert.equal(a.percent, 0, 'no damage');
  assert.deepEqual([a.vx, a.hitstun], [0, 0], 'no knockback');
  assert.equal(a.held, null, 'broken');
  assert.deepEqual(of(events, 'block').map((e) => e.slot), [0]);
  tap(state, 1, { attack: true }, CONFIG.attack.total);
  assert.equal(a.percent, 8, 'the next hit lands');
});

test('Cork Shield: blocks specials, projectiles and hazards, and their status effects', () => {
  const state = fight({ fighters: ['bairro_chad', 'house_dj'] });
  const [chad, dj] = state.fighters;
  place(chad, 400);
  place(dj, 480);
  dj.held = { type: 'cork', uses: 1 };
  tap(state, 0, { special: true }, 40); // Round's On Me: 4 % and tipsy
  assert.deepEqual([dj.percent, dj.tipsy], [0, 0], 'no damage, not tipsy');
  dj.held = { type: 'cork', uses: 1 };
  assert.equal(applyHit(state, dj, { by: null, kind: 'hazard', source: 'train', damage: 20, baseKb: 8, kbGrowth: 7, angleDeg: 30, dirX: 1 }), 0);
  assert.equal(dj.percent, 0);
  assert.equal(dj.held, null);
});

test('Cork Shield: no help against the Group Project explosion or falling out', () => {
  const state = fight();
  const [a] = state.fighters;
  place(a, 400);
  // (A project holder cannot hold a shield as well; the rule is checked on its own here.)
  a.held = { type: 'cork', uses: 1 };
  const result = applyHit(state, a, { by: null, kind: 'item', source: 'project', damage: 18, baseKb: 8, kbGrowth: 10, angleDeg: 70, dirX: 1 });
  assert.ok(result, 'the explosion is not blocked');
  assert.equal(a.percent, 18);
  const state2 = fight();
  const [b] = state2.fighters;
  b.held = { type: 'cork', uses: 1 };
  b.x = -1000;
  run(state2, 1);
  assert.equal(b.state, 'dead', 'falling out is a KO as usual');
});

// ---- Azulejo ----

test('Azulejo: the next attack throws the tile; after 12 frames it shatters into 3 shards fanning out', () => {
  const { state, a } = withItem('azulejo');
  a.facing = 1;
  let events = tap(state, 0, { attack: true }, CONFIG.attack.startup);
  assert.equal(a.held, null);
  assert.deepEqual(of(events, 'projectile').map((e) => e.kind), ['tile']);
  events = run(state, I.azulejo.shatterAt);
  const shards = state.projectiles.filter((p) => p.kind === 'shard');
  assert.equal(shards.length, 3);
  assert.equal(state.projectiles.filter((p) => p.kind === 'tile').length, 0, 'the tile is gone');
  const angles = shards.map((p) => Math.round((Math.atan2(-p.vy, p.vx) * 180) / Math.PI) + 0).sort((x, y) => x - y);
  assert.deepEqual(angles, [-12, 0, 12]);
  assert.equal(of(events, 'fx').filter((e) => e.fx === 'shatter').length, 1);
});

test('Azulejo: each shard hits one opponent once, 5 % with small knockback', () => {
  const state = fight({ fighters: ['finance_bro', 'house_dj', 'surfer_girl'] });
  const [a, b, c] = state.fighters;
  place(a, 300);
  place(b, 580);
  place(c, 640);
  a.held = { type: 'azulejo', uses: 1 };
  a.facing = 1;
  const events = tap(state, 0, { attack: true }, 80);
  const hits = of(events, 'hit').filter((e) => e.source === 'shard');
  assert.ok(hits.length >= 1 && hits.length <= 3, `${hits.length} shard hits: three shards, each hits at most once`);
  for (const hit of hits) assert.equal(hit.damage, I.azulejo.shard.damage);
  assert.equal(b.percent + c.percent, hits.length * I.azulejo.shard.damage);
  // b stands in the way of all three shards: c behind is not hit by a shard that already hit b.
  assert.equal(b.percent, 3 * I.azulejo.shard.damage);
  assert.equal(c.percent, 0);
  assert.ok(Math.hypot(b.vx, b.vy) < 6, 'small knockback');
});

test('Azulejo is thrown in the air too, like the Book (no stomp)', () => {
  const state = fight();
  const [a] = state.fighters;
  a.held = { type: 'azulejo', uses: 1 };
  Object.assign(a, { x: 400, y: 100, onGround: false, vy: 0 });
  const events = tap(state, 0, { attack: true }, CONFIG.attack.startup + 1);
  assert.notEqual(of(events, 'attack')[0].kind, 'stomp');
  assert.deepEqual(of(events, 'projectile').map((e) => e.kind), ['tile']);
});

// ---- Lucky Rooster ----

test('Lucky Rooster: invincible for 5 s, hits pass through without effect', () => {
  const { state, a, b } = withItem('rooster');
  assert.equal(a.rooster, I.rooster.frames - (25 - I.spawnInFrames));
  assert.equal(phoneStatus(state, 0).buff, 'lucky');
  place(a, 460);
  place(b, 400);
  b.facing = 1;
  tap(state, 1, { attack: true }, CONFIG.attack.total);
  assert.deepEqual([a.percent, a.hitstun], [0, 0]);
  run(state, a.rooster);
  assert.equal(a.rooster, 0);
  tap(state, 1, { attack: true }, CONFIG.attack.total);
  assert.equal(a.percent, 8, 'after 5 s hits land again');
});

test('Lucky Rooster: a hazard still moves the fighter but does no damage', () => {
  const state = fight({ stage: 'bairro', settings: { hazards: true } });
  const [a] = state.fighters;
  place(a, 640);
  a.rooster = 600;
  beginWarning(state, { id: 'crowd', dir: 1 });
  const x = a.x;
  for (let i = 0; i < 400 && state.hazard.phase !== 'idle'; i++) step(state, {});
  assert.equal(a.percent, 0);
  assert.ok(a.x > x + 30 || a.state !== 'alive', 'carried by the crowd');
});
