// Held items in the hand (GAME_SPEC §7.1, D-139): the hand anchor of every pose.
import test from 'node:test';
import assert from 'node:assert/strict';
import { handPoint, LOOKS, POSES, SPRITE, VIEW } from '../../public/shared/art/characters.js';
import { FIGHTER_IDS } from '../../src/game/fighters.js';
import { heldItemAt } from '../../src/game/view.js';

const k = SPRITE.scale * (81 / 180); // SVG units to screen pixels

test('every fighter has a hand point in every pose, inside the sprite', () => {
  for (const id of FIGHTER_IDS) {
    for (const pose of Object.keys(POSES)) {
      const p = handPoint(id, pose);
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), `${id} ${pose}`);
      assert.ok(p.x / k >= VIEW.x && p.x / k <= VIEW.x + VIEW.w, `${id} ${pose}: x inside`);
      assert.ok(p.y / k >= VIEW.y && p.y / k <= VIEW.y + VIEW.h, `${id} ${pose}: y inside`);
    }
  }
  assert.equal(Object.keys(LOOKS).length, FIGHTER_IDS.length);
});

test('the hand follows the arm: run, jump, attack and hang put it in different places', () => {
  const at = (pose) => handPoint('house_dj', pose);
  assert.notDeepEqual(at('run1'), at('run2'), 'the arm swings while running');
  assert.ok(at('jump').y < at('idle').y, 'raised in the jump');
  assert.notDeepEqual(at('attack'), at('idle'));
  assert.ok(at('hang').y < at('fall').y && at('hang').y < -60, 'above the shoulders when hanging');
});

test('the held item is placed at the hand and mirrored with the facing', () => {
  const f = { fighterId: 'finance_bro', x: 500, y: 600, facing: 1, state: 'alive', hitstun: 0, stun: 0, pull: null, hang: null, special: null, attack: null, onGround: true, vx: 0, vy: 0, runPhase: 0 };
  const right = heldItemAt(f, handPoint);
  const hand = handPoint('finance_bro', 'idle');
  assert.deepEqual(right, { x: 500 + hand.x, y: 600 + hand.y });
  const left = heldItemAt({ ...f, facing: -1 }, handPoint);
  assert.deepEqual(left, { x: 500 - hand.x, y: 600 + hand.y }, 'mirrored');
  const jumping = heldItemAt({ ...f, onGround: false, vy: -5 }, handPoint);
  assert.deepEqual(jumping, { x: 500 + handPoint('finance_bro', 'jump').x, y: 600 + handPoint('finance_bro', 'jump').y }, 'the pose of the moment');
});
