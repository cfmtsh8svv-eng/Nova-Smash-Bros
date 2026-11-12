// Movement: running, jumping, gravity and standing on platforms.
import { CONFIG } from './config.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Turn this frame's input into speed. Nothing moves yet: that is moveFighter.
export function controlFighter(state, f, inp) {
  const P = CONFIG.physics;
  // Remember presses for a few frames so a slightly early tap is not lost.
  f.jumpBuffer = inp.jumpP ? P.inputBufferFrames : Math.max(0, f.jumpBuffer - 1);
  f.attackBuffer = inp.attackP ? P.inputBufferFrames : Math.max(0, f.attackBuffer - 1);
  f.specialBuffer = inp.specialP ? P.inputBufferFrames : Math.max(0, f.specialBuffer - 1);
  if (f.hang) return holdLedge(state, f, inp);

  const canAct = f.hitstun <= 0 && f.stun <= 0 && !f.pull;
  // A special that holds the fighter, or the stomp's dive: no running, jumping or dropping.
  const locked = Boolean(f.special && f.special.lock) || Boolean(f.attack && f.attack.kind === 'stomp');

  if (!canAct) {
    f.aimUp = false;
    if (f.hitstun > 0) {
      f.vx *= f.onGround ? P.hitstunGroundFriction : P.launchDrag;
    } else {
      f.vx *= f.onGround ? P.groundFriction : P.airFriction;
    }
    return;
  }

  // Facing: the last direction pressed. Up is only "look up" while it is held.
  if (!f.attack && !locked) {
    if (inp.left && !inp.right) f.facing = -1;
    else if (inp.right && !inp.left) f.facing = 1;
    else if (inp.left && inp.right) {
      if (inp.leftP && !inp.rightP) f.facing = -1;
      if (inp.rightP && !inp.leftP) f.facing = 1;
    }
  }
  f.aimUp = inp.up;

  // Left and right.
  const dir = locked ? 0 : (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
  const max = f.runSpeed;
  let accel = f.onGround ? P.groundAccel : P.airAccel;
  if (f.slip > 0) accel *= P.slipControl;
  if (dir !== 0) {
    const sameWay = Math.sign(f.vx) === dir;
    if (f.onGround || !sameWay || Math.abs(f.vx) < max) {
      f.vx += clamp(dir * max - f.vx, -accel, accel);
    } else {
      f.vx *= P.airFriction; // flying faster than running speed: keep the momentum
    }
  } else if (f.slip > 0 && f.onGround) {
    f.vx *= P.slipFriction;
  } else {
    f.vx *= f.onGround ? P.groundFriction : P.airFriction;
  }
  if (Math.abs(f.vx) < 0.05) f.vx = 0;

  if (locked) return;

  // Jump: from the ground (or just after leaving it), otherwise the one double jump.
  if (f.jumpBuffer > 0) {
    if (f.onGround || f.coyote > 0) {
      f.vy = -P.jumpSpeed;
      f.onGround = false;
      f.coyote = 0;
      f.jumpBuffer = 0;
      f.stretch = 8;
      state.events.push({ type: 'jump', slot: f.slot, double: false, x: f.x, y: f.y });
    } else if (f.jumpsLeft > 0) {
      f.vy = -P.doubleJumpSpeed;
      f.jumpsLeft -= 1;
      f.jumpBuffer = 0;
      f.stretch = 8;
      state.events.push({ type: 'jump', slot: f.slot, double: true, x: f.x, y: f.y });
    }
  }

  // Down: drop through a thin platform.
  if (inp.downP && f.onGround && f.groundId >= 0 && !state.stage.platforms[f.groundId].solid) {
    f.dropTimer = P.dropThroughFrames;
    f.dropFrom = f.groundId; // only this platform is ignored, so holding Down cannot skip the next one
    f.onGround = false;
    f.y += 2;
  }
}

// Apply gravity, move, then sort out the platforms.
export function moveFighter(state, f, inp) {
  const P = CONFIG.physics;
  if (f.pull) {
    // Being reeled in by the spaghetti lasso: glide to the target point.
    const n = Math.max(1, f.pull.t);
    f.x += (f.pull.tx - f.x) / n;
    f.y += (f.pull.ty - f.y) / n;
    f.pull.t -= 1;
    f.vx = 0;
    f.vy = 0;
    f.onGround = false;
    if (f.pull.t <= 0) f.pull = null;
    return;
  }
  if (f.hang) {
    // Hanging: the hand stays on the corner.
    f.x = f.hang.x - f.hang.facing * (CONFIG.body.w / 2);
    f.y = f.hang.y + CONFIG.body.h;
    f.vx = 0;
    f.vy = 0;
    f.onGround = false;
    f.groundId = -1;
    f.gravityScale = 1;
    return;
  }
  if (f.gravityScale !== 0) {
    const canSteer = f.hitstun <= 0 && f.stun <= 0;
    const fast = canSteer && inp.down && !f.onGround && f.vy > -2;
    f.vy += P.gravity * f.gravityScale + (fast ? P.fastFallExtra : 0);
    f.vy = Math.min(f.vy, fast ? P.fastFallMax : f.hitstun > 0 ? P.hitstunMaxFall : P.maxFall);
  }
  const prevX = f.x;
  const prevY = f.y;
  // Dragged by a hazard: the crowd leaves a little grip, the big wave none (D-146).
  const grip = f.dragVx !== 0 ? f.dragGrip ?? CONFIG.hazards.crowd.grip : 1;
  f.x += f.vx * grip + f.dragVx;
  f.y += f.vy;
  f.dragVx = 0;
  f.dragGrip = undefined;
  f.gravityScale = 1;

  const wasOnGround = f.onGround;
  const impact = f.vy;
  f.onGround = false;
  f.groundId = -1;
  const half = CONFIG.body.w / 2;
  const H = CONFIG.body.h;
  const platforms = state.stage.platforms;
  for (let i = 0; i < platforms.length; i++) {
    const p = platforms[i];
    if (p.solid) {
      const overlapX = f.x + half > p.x && f.x - half < p.x + p.w;
      if (!overlapX || f.y < p.y || f.y - H >= p.y + p.h) continue;
      if (prevY <= p.y + 0.01 && f.vy >= 0) {
        land(f, i, p.y);
      } else if (prevY - H >= p.y + p.h - 0.01) {
        f.y = p.y + p.h + H; // bumped the head on the underside
        if (f.vy < 0) f.vy = 0;
      } else if (f.y > p.y) {
        // ran or flew into the side wall
        const leftSide = prevX < p.x + p.w / 2;
        f.x = leftSide ? p.x - half : p.x + p.w + half;
        f.vx = f.hitstun > 0 ? -f.vx * 0.5 : 0;
      }
    } else if (!(f.dropTimer > 0 && f.dropFrom === i) && f.vy >= 0 && prevY <= p.y + 0.01 && f.y >= p.y && f.x >= p.x - 6 && f.x <= p.x + p.w + 6) {
      land(f, i, p.y);
    }
  }

  if (f.onGround) {
    if (f.hitstun > 0 && impact > P.bounceSpeed) {
      // A launched fighter bounces off the floor instead of sticking to it.
      f.vy = -impact * P.bounceKeep;
      f.onGround = false;
      f.groundId = -1;
      state.events.push({ type: 'bounce', slot: f.slot, x: f.x, y: f.y });
    } else {
      f.jumpsLeft = 1;
      if (!wasOnGround) {
        f.squash = 8;
        state.events.push({ type: 'land', slot: f.slot, x: f.x, y: f.y, speed: impact });
      }
    }
  } else if (wasOnGround && f.vy >= 0) {
    f.coyote = P.coyoteFrames;
  }
  f.runPhase += f.onGround ? Math.abs(f.vx) : 0;
  tryLedge(state, f);
}

// ---- ledge grab (D-138) ----

// Only the two outer corners of the solid main ground, once per airtime, when falling
// towards the wall with the hand point (top of the hurtbox, wall side) close to the corner.
function tryLedge(state, f) {
  if (f.onGround) {
    f.ledgeUsed = false; // standing on a platform: the next airtime may grab again
    return;
  }
  if (f.ledgeUsed || f.vy <= 0 || f.hitstun > 0 || f.stun > 0 || f.special || f.pull || (f.attack && f.attack.kind === 'stomp')) return;
  const ground = state.stage.platforms.find((p) => p.solid);
  if (!ground) return;
  const L = CONFIG.ledge;
  const handX = f.x + f.facing * (CONFIG.body.w / 2);
  const handY = f.y - CONFIG.body.h;
  for (const corner of [{ x: ground.x, facing: 1 }, { x: ground.x + ground.w, facing: -1 }]) {
    if (f.facing !== corner.facing || Math.hypot(handX - corner.x, handY - ground.y) > L.reach) continue;
    f.hang = { x: corner.x, y: ground.y, facing: corner.facing, t: 0 };
    f.ledgeUsed = true;
    f.attack = null;
    f.x = corner.x - corner.facing * (CONFIG.body.w / 2);
    f.y = ground.y + CONFIG.body.h;
    f.vx = 0;
    f.vy = 0;
    state.events.push({ type: 'ledgeGrab', slot: f.slot, x: corner.x, y: ground.y });
    return;
  }
}

function letGoOfLedge(state, f) {
  state.events.push({ type: 'ledgeDrop', slot: f.slot, x: f.hang.x, y: f.hang.y });
  f.hang = null;
  f.vx = 0;
  f.vy = 0;
}

// While hanging: Jump climbs up, Down or away from the wall lets go, and after 1.5 s the fighter drops.
function holdLedge(state, f, inp) {
  const hang = f.hang;
  const L = CONFIG.ledge;
  hang.t += 1;
  f.facing = hang.facing;
  f.aimUp = false;
  f.attackBuffer = 0; // Attack and Special do nothing while hanging
  f.specialBuffer = 0;
  const away = hang.facing > 0 ? inp.left && !inp.right : inp.right && !inp.left;
  if (f.jumpBuffer > 0) {
    f.hang = null;
    f.jumpBuffer = 0;
    f.x = hang.x + hang.facing * L.climbInset;
    f.y = hang.y;
    f.vx = 0;
    f.vy = 0;
    f.onGround = true;
    f.groundId = state.stage.platforms.findIndex((p) => p.solid);
    f.squash = 6;
    state.events.push({ type: 'ledgeClimb', slot: f.slot, x: f.x, y: f.y });
  } else if (inp.down || away || hang.t >= L.hangFrames) {
    letGoOfLedge(state, f);
  }
}

function land(f, index, y) {
  f.y = y;
  f.vy = 0;
  f.onGround = true;
  f.groundId = index;
}

// Two fighters standing in the same spot slowly slide apart, so both stay visible.
export function pushApart(state) {
  const P = CONFIG.physics;
  const list = state.fighters.filter((f) => f.state === 'alive' && f.onGround && f.hitstun <= 0 && !f.special);
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      if (a.groundId !== b.groundId || Math.abs(a.x - b.x) >= CONFIG.body.w * 0.7) continue;
      const dir = a.x < b.x || (a.x === b.x && a.slot < b.slot) ? -1 : 1;
      a.x += dir * P.pushApart;
      b.x -= dir * P.pushApart;
    }
  }
}
