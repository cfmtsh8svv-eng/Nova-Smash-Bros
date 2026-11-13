// Small pure helpers shared by the host screen and the phone:
// which pose a fighter shows, and the colour of a damage value.

// Damage colour: white at 0 %, yellow at 100 %, then orange, red, dark red at 200 %.
const STOPS = [[0, '#ffffff'], [100, '#f6c343'], [135, '#ff8a2a'], [170, '#e02b2b'], [200, '#b0151c']];
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

export function damageColor(percent) {
  const p = Math.max(0, Math.min(200, Number(percent) || 0));
  for (let i = 1; i < STOPS.length; i++) {
    const [a, ca] = STOPS[i - 1];
    const [b, cb] = STOPS[i];
    if (p <= b) {
      const t = (p - a) / (b - a);
      const from = rgb(ca);
      const to = rgb(cb);
      return toHex(from.map((v, k) => v + (to[k] - v) * t));
    }
  }
  return STOPS[STOPS.length - 1][1];
}

// Which of the pre-drawn poses fits the fighter's current state.
export function poseOf(f) {
  if (f.state !== 'alive') return 'ko';
  if (f.hitstun > 0 || f.stun > 0 || f.pull) return 'hurt';
  if (f.hang) return 'hang';
  if (f.special) return 'special';
  if (f.attack && f.attack.kind === 'stomp') return f.attack.phase === 'dive' ? 'stomp' : 'idle';
  if (f.attack) return 'attack';
  if (!f.onGround) return f.vy < 0 ? 'jump' : 'fall';
  if (Math.abs(f.vx) > 0.6) return Math.floor(f.runPhase / 26) % 2 === 0 ? 'run1' : 'run2';
  return 'idle';
}

// The line at the bottom of the big screen that says how to pause (D-134). It sits in the
// strip under the main ground, so it never covers a platform, and it is semi-transparent.
export const PAUSE_HINT = { text: 'Press P or Esc to pause', y: 704, alpha: 0.55 };

// Shown during the countdown and the fight; hidden from the final KO on, and never in a
// match with a time cap (a demo match), where the clock takes its place.
export const pauseHint = (state) => Boolean(state) && !(state.settings.timeCapS > 0) && (state.phase === 'countdown' || state.phase === 'fight');

// The clock of a match with a time cap (demo mode, docs/DEMO.md): the fighting time left as
// m:ss, in the place of the pause hint. It counts the frames the rules count (fightFrames),
// so it stands still in the countdown, while paused and in the final-KO slow motion, and
// shows 0:00 on the frame the cap ends the match. null when the match has no cap.
// It fills `fill` of the strip between the main ground (y 600 on every stage) and the bottom
// edge of the screen, outline included, centred in it (D-209).
const CLOCK_STRIP = { top: 600, bottom: 720, fill: 0.8 };
export const CLOCK = {
  ...CLOCK_STRIP,
  height: Math.round((CLOCK_STRIP.bottom - CLOCK_STRIP.top) * CLOCK_STRIP.fill),
  y: (CLOCK_STRIP.top + CLOCK_STRIP.bottom) / 2,
};
export function matchClock(state) {
  if (!state || !(state.settings.timeCapS > 0)) return null;
  const left = Math.max(0, Math.ceil((state.settings.timeCapS * 60 - state.fightFrames) / 60));
  return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
}

// The pose as drawn: an attack or special aimed up has its own picture.
export function drawnPose(f) {
  const pose = poseOf(f);
  if (pose === 'attack' && f.attack && f.attack.dir === 'up') return 'attackUp';
  if (pose === 'special' && f.special && f.special.dir === 'up') return 'specialUp';
  return pose;
}

// Where a held item is drawn: in the back hand of the pose of the moment, mirrored with
// the facing (D-139). handPoint(fighterId, pose) comes from the sprite generator.
export function heldItemAt(f, handPoint) {
  const hand = handPoint(f.fighterId, drawnPose(f));
  return { x: f.x + f.facing * hand.x, y: f.y + hand.y };
}

// Lives as hearts. Both numbers are kept between 0 and 3, whatever is passed in.
export function hearts(lives, max) {
  const clamp = (v) => Math.max(0, Math.min(3, Math.floor(Number(v)) || 0));
  const total = clamp(max);
  const left = Math.min(clamp(lives), total || 3);
  return '♥'.repeat(left) + '♡'.repeat(Math.max(0, total - left));
}
