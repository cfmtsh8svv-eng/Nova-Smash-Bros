// The end of a match on the big screen (GAME_SPEC §10, D-155), drawn on the game canvas
// after the final-KO slow motion. Times are seconds from the end of the match:
//
//   0.0 to 1.8  the camera zooms on the winner, who hops; "{NAME} WINS!" slams in with a
//               screen shake and a burst of confetti
//   1.8 to 2.6  the camera goes back, the stage dims, the name moves to the top
//   2.2 to 3.0  three podium blocks rise out of the stage ground; the winner jumps onto
//               the first, the 2nd and 3rd drop onto theirs, the 4th lies flat beside them
//   3.2 to 4.0  old crowns pop off, a new crown drops onto the winner, fireworks start
//   from 4.2    stat cards above the fighters (DOM, main.js), then Back to the lobby
//
// It only draws: the result is already decided. Math.random is fine here (looks only).
import { PLAYER_COLORS, SCREEN } from '/game/config.js';
import { duplicateColour, INK, SPRITE } from '/shared/art/characters.js';
import { getSprite } from '/shared/art/sprites.js';
import { CROWN_SINK, drawCrown, headAboveFeet } from '/shared/art/crown.js';

const DISPLAY = '"Bungee", "Arial Black", sans-serif';
const BODY = '"Nunito", "Segoe UI", sans-serif';
export const GROUND = 600; // the main ground of every stage
// Podium blocks by place: centre x, height, width. The 4th lies on the ground at FOURTH_X.
export const BLOCKS = { 1: { x: 640, h: 130, w: 160 }, 2: { x: 468, h: 92, w: 160 }, 3: { x: 812, h: 62, w: 160 } };
export const FOURTH_X = 1010;
export const STATS_AT = 4.2; // when the stat cards come in
export const BUTTON_AT = 5.2; // when Back to the lobby appears
const FIREWORKS_UNTIL = 10; // then the results stay on a quiet podium

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const prog = (t, a, b) => clamp((t - a) / (b - a));
const easeOut = (k) => 1 - (1 - k) ** 3;
const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
const easeBack = (k) => { const c = 1.9; return 1 + (c + 1) * (k - 1) ** 3 + c * (k - 1) ** 2; };
function bounce(k) {
  const n = 7.5625;
  const d = 2.75;
  if (k < 1 / d) return n * k * k;
  if (k < 2 / d) { k -= 1.5 / d; return n * k * k + 0.75; }
  if (k < 2.5 / d) { k -= 2.25 / d; return n * k * k + 0.9375; }
  k -= 2.625 / d;
  return n * k * k + 0.984375;
}

// Where to put the feet of a fighter lying on its back (the sprite turned -90 degrees around
// the feet) so that the middle of the drawn body is at x = 0 and the body rests on y = 0.
// Measured from the sprite's pixels; the arms-up hanging pose is used, so the arms reach past
// the head along the ground instead of the body propping itself up on one arm.
function lyingOffset(sprite) {
  const fallback = { dx: 61, dy: -20 };
  if (!sprite) return fallback;
  try {
    const d = sprite.getContext('2d').getImageData(0, 0, sprite.width, sprite.height).data;
    let minX = 1e9;
    let minY = 1e9;
    let maxY = -1e9;
    for (let y = 0; y < sprite.height; y++) {
      for (let x = 0; x < sprite.width; x++) {
        if (!d[(y * sprite.width + x) * 4 + 3]) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
    if (minX > sprite.width) return fallback;
    const S = SPRITE.scale;
    // Turned by -90 degrees: sprite y (from the feet) becomes screen x, sprite x becomes -screen y.
    const left = (minY - SPRITE.anchorY) * S;
    const right = (maxY + 1 - SPRITE.anchorY) * S;
    return { dx: -(left + right) / 2, dy: (minX - SPRITE.anchorX) * S };
  } catch {
    return fallback;
  }
}

// players: [{ slot, name, fighterId, altColor, place, crown, x, y }] (x, y: where the fighter was
// when the match ended; crown: worn coming into this match). onCue(name) plays the sounds.
export function createCeremony({ players, onCue = () => {} }) {
  const people = players.map((p) => ({ ...p, main: p.altColor ? duplicateColour(p.fighterId, PLAYER_COLORS[p.slot]) : null, popped: false, landed: false }));
  const winner = people.find((p) => p.place === 1);
  let particles = [];
  let lastT = 0;
  let nextFirework = 3.4;
  const cues = new Set();
  const cue = (name, at, t) => {
    if (t >= at && !cues.has(`${name}@${at}`)) {
      cues.add(`${name}@${at}`);
      onCue(name);
      return true;
    }
    return false;
  };
  const sprite = (p, pose) => getSprite(p.fighterId, p.main, pose) || getSprite(p.fighterId, p.main, 'idle');
  let lying = null;

  function burst(x, y, n, speed, kind) {
    const colours = ['#e63946', '#2f7fe0', '#22a36b', '#f6c343', '#e85d9c', '#ff7a3d', '#eef3f8'];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      particles.push({
        kind, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (kind === 'confetti' ? speed * 0.6 : 0),
        life: kind === 'spark' ? 50 : 160, size: kind === 'spark' ? 3.5 : 7, color: colours[i % colours.length], rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
      });
    }
  }

  function step(frames) {
    for (const q of particles) {
      q.x += q.vx * frames;
      q.y += q.vy * frames;
      q.life -= frames;
      if (q.kind === 'confetti') { q.vy = Math.min(q.vy + 0.18 * frames, 3.2); q.vx *= 0.985; q.rot += q.vr * frames; }
      else if (q.kind === 'spark') { q.vy += 0.06 * frames; q.vx *= 0.97; q.vy *= 0.97; }
      else q.vy += 0.05 * frames;
    }
    particles = particles.filter((q) => q.life > 0 && q.y < SCREEN.h + 40);
  }

  // Where each fighter is at time t, and how it is drawn.
  function placeOf(p, t) {
    if (p.place === 4) {
      const k = prog(t, 2.3, 3.0);
      if (k <= 0) return null;
      if (k < 1) return { pose: 'ko', x: FOURTH_X, y: lerp(-140, GROUND, k * k), rot: k * 2, flip: false };
      if (!lying) lying = lyingOffset(getSprite(p.fighterId, p.main, 'hang'));
      return { pose: 'hang', x: FOURTH_X + lying.dx, y: GROUND + lying.dy, rot: -Math.PI / 2, flip: false, lying: true };
    }
    const block = BLOCKS[p.place];
    const top = { x: block.x, y: GROUND - block.h };
    if (p.place === 1) {
      const from = { x: p.x, y: Math.min(p.y, GROUND) };
      if (t < 2.2) {
        const hop = t > 0.1 ? Math.abs(Math.sin((t - 0.1) * 5)) * 46 : 0;
        return { pose: t > 0.1 ? 'jump' : 'idle', x: from.x, y: from.y - hop, flip: false };
      }
      const k = prog(t, 2.2, 3.0);
      return { pose: 'jump', x: lerp(from.x, top.x, easeInOut(k)), y: lerp(from.y, top.y, k) - Math.sin(Math.PI * k) * 210, flip: k < 1 && top.x < from.x };
    }
    // 2nd and 3rd were knocked out: they drop in from above onto their block.
    const k = prog(t, 2.35 + (p.place - 2) * 0.1, 3.0 + (p.place - 2) * 0.1);
    if (k <= 0) return null;
    return { pose: k < 1 ? 'fall' : 'idle', x: top.x, y: lerp(-140, top.y, bounce(k)), flip: p.place === 3 };
  }

  function drawFighter(ctx, p, f) {
    const img = sprite(p, f.pose);
    if (!img) return;
    const S = SPRITE.scale;
    ctx.save();
    ctx.translate(f.x, f.y);
    if (f.rot) ctx.rotate(f.rot);
    if (f.flip) ctx.scale(-1, 1);
    ctx.drawImage(img, -SPRITE.anchorX * S, -SPRITE.anchorY * S, SPRITE.w * S, SPRITE.h * S);
    ctx.restore();
  }

  function drawBlock(ctx, place, k) {
    const b = BLOCKS[place];
    const p = people.find((q) => q.place === place);
    const h = b.h * k;
    if (!p || h <= 1) return;
    const x = b.x - b.w / 2;
    const y = GROUND - h;
    const g = ctx.createLinearGradient(0, y, 0, GROUND);
    g.addColorStop(0, '#4a3a76');
    g.addColorStop(1, '#241a3d');
    ctx.fillStyle = g;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4;
    ctx.fillRect(x, y, b.w, h);
    ctx.strokeRect(x, y, b.w, h);
    ctx.fillStyle = PLAYER_COLORS[p.slot];
    ctx.fillRect(x + 2, y + 2, b.w - 4, Math.min(10, h - 4));
    ctx.strokeStyle = 'rgba(255,255,255,.08)';
    ctx.lineWidth = 2;
    for (let yy = y + 30; yy < GROUND - 6; yy += 22) { ctx.beginPath(); ctx.moveTo(x + 6, yy); ctx.lineTo(x + b.w - 6, yy); ctx.stroke(); }
    if (h > 44) {
      ctx.font = `400 40px ${DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 6;
      ctx.strokeText(String(place), b.x, y + Math.min(h / 2 + 6, 56));
      ctx.fillStyle = '#f6c343';
      ctx.fillText(String(place), b.x, y + Math.min(h / 2 + 6, 56));
    }
    // dust where the block breaks through the ground while it rises
    if (k < 1 && Math.random() < 0.6) particles.push({ kind: 'dust', x: x + Math.random() * b.w, y: GROUND, vx: (Math.random() - 0.5) * 3, vy: -Math.random() * 3, life: 30, size: 4 + Math.random() * 5, color: 'rgba(200,190,220,.7)' });
  }

  function drawParticles(ctx) {
    for (const q of particles) {
      ctx.save();
      ctx.globalAlpha = q.kind === 'confetti' ? 1 : clamp(q.life / 30);
      ctx.fillStyle = q.color;
      ctx.translate(q.x, q.y);
      if (q.kind === 'confetti') {
        ctx.rotate(q.rot);
        ctx.fillRect(-q.size / 2, -q.size / 4, q.size, (q.size / 2) * (0.4 + Math.abs(Math.sin(q.rot * 2))));
      } else {
        ctx.beginPath(); ctx.arc(0, 0, q.size, 0, 7); ctx.fill();
      }
      ctx.restore();
    }
  }

  const headY = (p, f) => f.y - headAboveFeet(getSprite(p.fighterId, p.main, 'idle')) * SPRITE.scale + CROWN_SINK;

  // Draws one picture. drawStage paints the stage in stage coordinates.
  function draw(ctx, t, drawStage) {
    const frames = clamp((t - lastT) * 60, 0, 6);
    lastT = t;

    // The camera: on the winner until 1.8 s, then back. Never so far that the stage edge shows.
    const zin = easeOut(prog(t, 0, 0.6));
    const zout = easeInOut(prog(t, 1.8, 2.4));
    const k = zin * (1 - zout);
    const z = 1 + 0.8 * k;
    const halfW = SCREEN.w / 2 / z;
    const halfH = SCREEN.h / 2 / z;
    const focus = {
      x: clamp(lerp(640, winner.x, k), halfW, SCREEN.w - halfW),
      y: clamp(lerp(360, Math.min(winner.y, GROUND) - 90, k), halfH, SCREEN.h - halfH),
    };
    const shake = t > 0.4 && t < 0.85 ? (0.85 - t) * 40 : 0;

    ctx.save();
    ctx.translate(SCREEN.w / 2 + (Math.random() - 0.5) * shake, SCREEN.h / 2 + (Math.random() - 0.5) * shake);
    ctx.scale(z, z);
    ctx.translate(-focus.x, -focus.y);
    drawStage();
    const dim = 0.5 * easeInOut(prog(t, 1.8, 2.6));
    if (dim) { ctx.fillStyle = `rgba(10,6,24,${dim})`; ctx.fillRect(-50, -50, SCREEN.w + 100, SCREEN.h + 100); }

    cue('rise', 2.2, t);
    for (const place of [1, 2, 3]) drawBlock(ctx, place, easeBack(prog(t, 2.2 + (place - 1) * 0.08, 2.9 + (place - 1) * 0.08)));

    ctx.imageSmoothingEnabled = false;
    for (const p of people) {
      const f = placeOf(p, t);
      if (!f) continue;
      drawFighter(ctx, p, f);
      if (f.lying) continue; // a fighter lying flat has lost the crown already
      // Old crowns ride along until 3.2 s, then pop off; the winner keeps theirs.
      if (p.crown && p.place !== 1) {
        const c = prog(t, 3.2, 4.0);
        const side = p.place === 2 ? -1 : 1;
        if (c <= 0) drawCrown(ctx, f.x + (f.flip ? 3 : -3), headY(p, f), 0.9);
        else if (c < 1) {
          drawCrown(ctx, f.x + c * 60 * side, headY(p, f) - Math.sin(c * Math.PI) * 90 - c * 40, 0.9, c * 7, 1 - c);
          if (c > 0.8 && !p.popped) { p.popped = true; burst(f.x + 60 * side, headY(p, f) - 30, 14, 3, 'spark'); onCue('pop'); }
        }
      }
      if (p.place === 1) {
        if (p.crown) {
          drawCrown(ctx, f.x - 3, headY(p, f), 0.9);
        } else {
          const c = prog(t, 3.4, 4.0);
          if (c > 0) drawCrown(ctx, f.x - 3, lerp(-60, headY(p, f), bounce(c)), 0.9);
        }
        if (t >= 4.0 && !p.landed) { p.landed = true; burst(f.x, headY(p, f) - 10, 26, 4, 'spark'); onCue('crown'); }
      }
    }
    ctx.imageSmoothingEnabled = true;
    drawParticles(ctx);
    ctx.restore();

    // Screen text: the winner's name slams in, then moves to the top.
    if (t >= 0.4) {
      const slam = prog(t, 0.4, 0.65);
      const settle = easeInOut(prog(t, 1.8, 2.5));
      const s = lerp(3, 1, easeOut(slam)) * lerp(1, 0.5, settle);
      const y = lerp(160, 58, settle);
      const line = `${winner.name.toUpperCase()} WINS!`;
      ctx.save();
      ctx.translate(SCREEN.w / 2, y);
      ctx.scale(s, s);
      ctx.globalAlpha = slam;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `400 96px ${DISPLAY}`;
      ctx.lineJoin = 'round';
      ctx.lineWidth = 14;
      ctx.strokeStyle = INK;
      ctx.strokeText(line, 0, 0);
      ctx.fillStyle = '#f6c343';
      ctx.fillText(line, 0, 0);
      ctx.restore();
      if (settle > 0) {
        ctx.save();
        ctx.globalAlpha = settle;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `800 26px ${BODY}`;
        ctx.fillStyle = '#eef3f8';
        ctx.fillText('graduates with honours', SCREEN.w / 2, 104);
        ctx.restore();
      }
      if (cue('slam', 0.4, t)) burst(SCREEN.w / 2, 200, 90, 9, 'confetti');
    }

    // Fireworks over the podium, and confetti raining down.
    if (t >= nextFirework && t < FIREWORKS_UNTIL) {
      nextFirework = t + 0.65;
      burst(240 + Math.random() * 800, 130 + Math.random() * 160, 34, 4.2, 'spark');
      onCue('firework');
    }
    if (t > 3.0 && Math.random() < 0.35 * frames) {
      particles.push({ kind: 'confetti', x: Math.random() * SCREEN.w, y: -10, vx: (Math.random() - 0.5) * 1.5, vy: 1 + Math.random() * 2, life: 400, size: 7, color: PLAYER_COLORS[Math.floor(Math.random() * 4)], rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3 });
    }
    step(frames);
  }

  return { draw, players: people };
}
