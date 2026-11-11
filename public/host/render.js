// Draws one picture of the match onto the canvas.
// It only reads the match state; it never changes it.
//
// Order, back to front: stage (one cached image) - hazards behind the fighters -
// items - fighters - things that fly - hazards in front - effects - name tags -
// the HUD (player cards, hazard countdown, big texts).
import { CONFIG, PLAYER_COLORS, SCREEN } from '/game/config.js';
import { damageColor, hearts, poseOf } from '/game/view.js';
import { hazardRect } from '/game/hazards.js';
import { getFighter } from '/game/fighters.js';
import { SPRITE } from '/shared/art/characters.js';
import { getSprite, getStageImage, loadStage } from '/shared/art/sprites.js';

const DISPLAY = '"Bungee", "Arial Black", sans-serif';
const BODY = '"Nunito", "Segoe UI", sans-serif';
const INK = '#16122a';
const H = CONFIG.body.h;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function outlined(ctx, text, x, y, fill, width = 6) {
  ctx.lineJoin = 'round';
  ctx.lineWidth = width;
  ctx.strokeStyle = INK;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let pixelScale = 1;

  // Keep the canvas as sharp as the screen allows (up to 2x), in a 16:9 box.
  function resize() {
    const box = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(640, Math.round(box.width * dpr));
    const height = Math.round((width * SCREEN.h) / SCREEN.w);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    pixelScale = canvas.width / SCREEN.w;
  }
  resize();
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 150);
  });

  function drawStage(stageId) {
    let img = getStageImage(stageId, canvas.width, canvas.height);
    if (!img) {
      loadStage(stageId, canvas.width, canvas.height).catch(() => {});
      img = getStageImage(stageId); // the 720p version is prepared first and used meanwhile
    }
    if (img) ctx.drawImage(img, 0, 0, SCREEN.w, SCREEN.h);
    else {
      ctx.fillStyle = '#1b1330';
      ctx.fillRect(0, 0, SCREEN.w, SCREEN.h);
    }
  }

  // ---- items and flying things ----

  function drawItemShape(type, x, y, t) {
    ctx.save();
    ctx.translate(x, y);
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    if (type === 'tart') {
      ctx.fillStyle = '#c98a3a';
      ctx.beginPath(); ctx.ellipse(0, -11, 17, 12, 0, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#f6c343';
      ctx.beginPath(); ctx.ellipse(0, -13, 12, 7, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#8a4f1e';
      for (const [dx, dy] of [[-5, -14], [4, -12], [0, -16]]) { ctx.beginPath(); ctx.arc(dx, dy, 2.2, 0, 7); ctx.fill(); }
    } else if (type === 'espresso') {
      ctx.fillStyle = '#eef3f8';
      roundRect(ctx, -11, -20, 20, 16, 4); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(11, -12, 5, -1.4, 1.4); ctx.stroke();
      ctx.fillStyle = '#5a3320';
      ctx.fillRect(-8, -18, 14, 4);
      ctx.strokeStyle = 'rgba(255,255,255,.75)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-4, -24); ctx.quadraticCurveTo(-8 + Math.sin(t / 9) * 3, -30, -4, -36);
      ctx.moveTo(4, -24); ctx.quadraticCurveTo(8 + Math.sin(t / 9 + 2) * 3, -30, 4, -36);
      ctx.stroke();
    } else if (type === 'sardine') {
      ctx.rotate(-0.25);
      ctx.fillStyle = '#8fb4d9';
      ctx.beginPath(); ctx.moveTo(-14, -12); ctx.lineTo(-24, -20); ctx.lineTo(-24, -4); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, -12, 17, 7, 0, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = INK;
      ctx.beginPath(); ctx.arc(10, -13, 2, 0, 7); ctx.fill();
    } else if (type === 'book') {
      ctx.fillStyle = '#8a2f3a';
      roundRect(ctx, -13, -30, 26, 30, 3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#f6c343';
      ctx.fillRect(-8, -24, 16, 4);
      ctx.fillStyle = '#eef3f8';
      ctx.fillRect(-11, -5, 22, 3);
    }
    ctx.restore();
  }

  function drawItems(state, t) {
    for (const item of state.items) {
      const pop = Math.min(1, item.age / 14);
      const fading = item.age > CONFIG.items.lifetime - 120 && Math.floor(t / 6) % 2 === 0;
      if (fading) continue;
      ctx.save();
      ctx.translate(item.x, item.y - 4 - Math.abs(Math.sin((t + item.id * 20) / 22)) * 5);
      ctx.scale(pop * 1.15, pop * 1.15);
      ctx.fillStyle = 'rgba(255,255,255,.22)';
      ctx.beginPath(); ctx.arc(0, -14, 24, 0, 7); ctx.fill();
      drawItemShape(item.type, 0, 0, t);
      ctx.restore();
    }
  }

  function drawTram(x, y, dir) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(dir, 1);
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.fillStyle = '#eef3f8';
    roundRect(ctx, -33, -27, 66, 9, 3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f6c343';
    roundRect(ctx, -35, -20, 70, 34, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#8fd3ff';
    for (let i = 0; i < 4; i++) ctx.fillRect(-29 + i * 15, -15, 11, 12);
    ctx.fillStyle = '#eef3f8';
    ctx.fillRect(-35, 2, 70, 5);
    ctx.fillStyle = INK;
    ctx.font = `800 9px ${BODY}`;
    ctx.textAlign = 'center';
    ctx.fillText('28', 0, 13);
    ctx.beginPath(); ctx.arc(-20, 18, 6, 0, 7); ctx.arc(20, 18, 6, 0, 7); ctx.fill();
    ctx.restore();
  }

  function drawProjectiles(state, t) {
    for (const p of state.projectiles) {
      if (p.kind === 'tram') {
        drawTram(p.x, p.y, Math.sign(p.vx) || p.dirX);
      } else if (p.kind === 'ball') {
        ctx.fillStyle = 'rgba(214,255,90,.35)';
        ctx.beginPath(); ctx.arc(p.x - p.vx * 1.3, p.y - p.vy * 1.3, 9, 0, 7); ctx.fill();
        ctx.fillStyle = '#d6ff5a';
        ctx.strokeStyle = INK;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(p.x, p.y, 10, 0, 7); ctx.fill(); ctx.stroke();
      } else {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.age * 0.35);
        drawItemShape('book', 0, 15, t);
        ctx.restore();
      }
    }
  }

  // ---- hazards ----

  function drawTrain(rect, dir) {
    const cars = 3;
    const carW = rect.w / cars;
    const y = rect.y + 8;
    const h = rect.h - 30 - 20;
    for (let i = 0; i < cars; i++) {
      const x = rect.x + i * carW;
      ctx.lineWidth = 4;
      ctx.strokeStyle = INK;
      ctx.fillStyle = '#f1f5fa';
      roundRect(ctx, x + 3, y, carW - 6, h, 12); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#f6c343';
      ctx.fillRect(x + 5, y + h * 0.62, carW - 10, h * 0.2);
      ctx.fillStyle = '#1f3348';
      for (let k = 0; k < 4; k++) roundRect(ctx, x + 16 + k * ((carW - 32) / 4), y + 12, (carW - 32) / 4 - 8, h * 0.36, 4), ctx.fill();
      ctx.fillStyle = INK;
      for (const wx of [0.2, 0.8]) { ctx.beginPath(); ctx.arc(x + carW * wx, y + h + 6, 9, 0, 7); ctx.fill(); }
    }
    const front = dir > 0 ? rect.x + rect.w - 10 : rect.x + 10;
    ctx.fillStyle = '#fff2c8';
    ctx.beginPath(); ctx.arc(front, y + h * 0.75, 7, 0, 7); ctx.fill();
  }

  function drawWave(rect, dir, t) {
    ctx.save();
    const top = rect.y + 6;
    const bottom = rect.y + rect.h;
    const grad = ctx.createLinearGradient(0, top, 0, bottom);
    grad.addColorStop(0, '#bfeeff');
    grad.addColorStop(0.3, '#3fb6d8');
    grad.addColorStop(1, '#1f6fa8');
    ctx.fillStyle = grad;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4;
    const x0 = dir > 0 ? rect.x : rect.x + rect.w;
    const s = dir;
    ctx.beginPath();
    ctx.moveTo(x0 - s * 60, bottom);
    ctx.quadraticCurveTo(x0 + s * rect.w * 0.3, top + 30, x0 + s * rect.w * 0.7, top);
    ctx.quadraticCurveTo(x0 + s * rect.w * 1.08, top + 8, x0 + s * rect.w * 0.96, top + 46);
    ctx.quadraticCurveTo(x0 + s * rect.w * 0.8, top + 34, x0 + s * rect.w * 0.82, bottom);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.arc(x0 + s * rect.w * (0.6 + i * 0.07), top + 6 + Math.sin(t / 5 + i) * 6, 9 - i, 0, 7);
      ctx.fill();
    }
    ctx.restore();
  }

  const CROWD_COLORS = ['#e63946', '#2f7fe0', '#f6c343', '#22a36b', '#8e5cc8', '#ff7a3d', '#e85d9c', '#eef3f8', '#1aa6a6'];
  function drawCrowd(rect, dir, t) {
    const n = 9;
    for (let i = 0; i < n; i++) {
      const row = i % 2;
      const x = rect.x + 16 + (i * (rect.w - 32)) / (n - 1);
      const bob = Math.sin(t / 6 + i * 1.7) * 4;
      const base = rect.y + rect.h - 30 - row * 8;
      ctx.lineWidth = 3;
      ctx.strokeStyle = INK;
      ctx.fillStyle = CROWD_COLORS[i % CROWD_COLORS.length];
      roundRect(ctx, x - 14, base - 58 + bob, 28, 50, 9); ctx.fill(); ctx.stroke();
      ctx.fillStyle = ['#f7c9a3', '#e0a070', '#a86b45'][i % 3];
      ctx.beginPath(); ctx.arc(x, base - 70 + bob, 13, 0, 7); ctx.fill(); ctx.stroke();
      // a raised arm with a cup
      ctx.beginPath(); ctx.moveTo(x + dir * 10, base - 50 + bob); ctx.lineTo(x + dir * 22, base - 78 + bob); ctx.stroke();
      ctx.fillStyle = '#f0a81e';
      ctx.fillRect(x + dir * 22 - 5, base - 90 + bob, 10, 12);
    }
  }

  function drawGulls(hz, t) {
    const y = hz.zone === 'sand' ? 520 : 360;
    for (let i = 0; i < 6; i++) {
      const x = hz.pos - hz.dir * i * 34 + Math.sin(t / 7 + i) * 6;
      const yy = y + Math.sin(t / 5 + i * 2) * 14 + (i % 3) * 16;
      const flap = Math.sin(t / 3 + i) * 9;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x - 20, yy - flap); ctx.quadraticCurveTo(x - 8, yy - 8, x, yy); ctx.quadraticCurveTo(x + 8, yy - 8, x + 20, yy - flap); ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.fillStyle = '#f6c343';
      ctx.beginPath(); ctx.arc(x + hz.dir * 5, yy + 2, 3, 0, 7); ctx.fill();
    }
  }

  function drawDrinks(hz, t) {
    hz.drinks.forEach((d, i) => {
      if (d.taken) return;
      const y = d.y - Math.abs(Math.sin((t + i * 30) / 20)) * 4;
      ctx.lineWidth = 3;
      ctx.strokeStyle = INK;
      ctx.fillStyle = ['#3fd0e0', '#ff7a3d', '#e63946'][i % 3];
      ctx.beginPath(); ctx.moveTo(d.x - 12, y - 32); ctx.lineTo(d.x + 12, y - 32); ctx.lineTo(d.x + 8, y - 6); ctx.lineTo(d.x - 8, y - 6); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#eef3f8';
      ctx.fillRect(d.x - 9, y - 6, 18, 5);
      ctx.strokeStyle = '#eef3f8';
      ctx.beginPath(); ctx.moveTo(d.x + 4, y - 30); ctx.lineTo(d.x + 12, y - 44); ctx.stroke();
    });
  }

  function wifiBand(hz) {
    return hz.zone === 'roof' ? { y: 0, h: CONFIG.levels.roofBelow } : { y: CONFIG.levels.roofBelow, h: SCREEN.h - CONFIG.levels.roofBelow };
  }

  function drawWifiIcon(x, y, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = INK;
    ctx.lineCap = 'round';
    for (const [w, c] of [[9, INK], [5, '#eef3f8']]) {
      ctx.lineWidth = w;
      ctx.strokeStyle = c;
      for (const r of [14, 26, 38]) { ctx.beginPath(); ctx.arc(x, y, r, -2.3, -0.84); ctx.stroke(); }
      ctx.beginPath(); ctx.arc(x, y - 1, 2, 0, 7); ctx.stroke();
    }
    ctx.lineWidth = 9; ctx.strokeStyle = INK;
    ctx.beginPath(); ctx.moveTo(x - 30, y - 42); ctx.lineTo(x + 30, y + 6); ctx.stroke();
    ctx.lineWidth = 5; ctx.strokeStyle = '#e63946';
    ctx.stroke();
    ctx.restore();
  }

  function drawWifi(hz, t) {
    const band = wifiBand(hz);
    ctx.save();
    ctx.fillStyle = 'rgba(138,143,156,.13)';
    ctx.fillRect(0, band.y, SCREEN.w, band.h);
    ctx.fillStyle = 'rgba(255,255,255,.10)';
    for (let i = 0; i < 7; i++) {
      const y = band.y + ((t * 3 + i * 97) % band.h);
      ctx.fillRect(0, y, SCREEN.w, 2);
    }
    ctx.fillStyle = 'rgba(22,18,42,.18)';
    for (let i = 0; i < 5; i++) {
      const k = Math.floor(t / 5) * 31 + i * 17;
      ctx.fillRect((k * 53) % SCREEN.w, band.y + ((k * 29) % Math.max(1, band.h - 12)), 60 + (k % 80), 6);
    }
    ctx.restore();
    drawWifiIcon(84, band.y + 96, 0.55 + 0.4 * Math.sin(t / 4));
  }

  // During the countdown the place where the hazard will strike gives a hint:
  // a soft pulsing glow, part of the scene and not a box or a bar.
  function drawTelegraph(state, t) {
    const hz = state.hazard;
    const pulse = 0.35 + 0.3 * Math.sin(t / 5);
    const ground = state.stage.platforms[0].y;
    const glow = (x, y, r, color) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
      ctx.restore();
    };
    const edge = hz.dir > 0 ? 0 : SCREEN.w;
    if (hz.id === 'train') glow(edge, ground - 50, 170, '#fff2c8');
    if (hz.id === 'wave') glow(edge, ground - 40, 190, '#7fe0ff');
    if (hz.id === 'crowd') glow(edge, ground - 50, 170, '#ffd98a');
    if (hz.id === 'gulls') glow(edge, hz.zone === 'sand' ? 520 : 360, 150, '#ffffff');
    if (hz.id === 'wifi') drawWifiIcon(84, wifiBand(hz).y + 96, pulse);
    if (hz.id === 'drinks') {
      const p = state.stage.platforms[hz.platform];
      for (let i = 1; i <= 3; i++) glow(p.x + (p.w * i) / 4, p.y - 16, 46, '#c79bff');
    }
  }

  function drawHazardBack(state, t) {
    const hz = state.hazard;
    if (hz.phase === 'warn') drawTelegraph(state, t);
    if (hz.phase !== 'active') return;
    if (hz.id === 'wifi') drawWifi(hz, t);
    if (hz.id === 'drinks') drawDrinks(hz, t);
  }

  function drawHazardFront(state, t) {
    const hz = state.hazard;
    if (hz.phase !== 'active') return;
    const rect = hazardRect(state);
    if (hz.id === 'train') drawTrain(rect, hz.dir);
    if (hz.id === 'wave') drawWave(rect, hz.dir, t);
    if (hz.id === 'crowd') drawCrowd(rect, hz.dir, t);
    if (hz.id === 'gulls') drawGulls(hz, t);
  }

  // ---- fighters ----

  function drawFighter(f, t) {
    if (f.state !== 'alive') return;
    let pose = poseOf(f);
    if (pose === 'attack' && f.attack.dir === 'up') pose = 'attackUp';
    if (pose === 'special' && f.special.dir === 'up') pose = 'specialUp';
    const main = f.altColor ? PLAYER_COLORS[f.slot] : null;
    const sprite = getSprite(f.fighterId, main, pose) || getSprite(f.fighterId, main, 'idle');

    if (f.onGround) {
      ctx.fillStyle = 'rgba(12,20,32,.3)';
      ctx.beginPath(); ctx.ellipse(f.x, f.y + 2, 30, 6, 0, 0, 7); ctx.fill();
    }
    // The wave under the surfer.
    if (f.special && f.special.id === 'wave_rider' && f.special.phase === 'ride') {
      ctx.fillStyle = '#3fb6d8';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(f.x - f.special.facing * 14, f.y + 4, 62, 16 + Math.sin(t / 2) * 3, 0, Math.PI, 0);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(f.x - f.special.facing * 60, f.y - 6, 9, 0, 7); ctx.fill();
    }

    // Squash on landing, stretch on take-off.
    let sx = 1;
    let sy = 1;
    if (f.squash > 0) { const k = f.squash / 8; sx += 0.2 * k; sy -= 0.18 * k; }
    if (f.stretch > 0) { const k = f.stretch / 8; sx -= 0.13 * k; sy += 0.17 * k; }
    let tilt = 0;
    if (f.hitstun > 0) tilt = Math.max(-0.5, Math.min(0.5, f.vx * 0.035));
    if (f.tipsy > 0) tilt += Math.sin(t / 9) * 0.12;
    if (f.slip > 0) tilt += Math.sin(t / 4) * 0.1;

    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(tilt);
    ctx.scale(f.facing * sx * SPRITE.scale, sy * SPRITE.scale);
    if (f.invincible > 0 && Math.floor(t / 4) % 2 === 0) ctx.globalAlpha = 0.4;
    if (sprite) {
      ctx.drawImage(sprite, -SPRITE.anchorX, -SPRITE.anchorY);
    } else {
      ctx.fillStyle = PLAYER_COLORS[f.slot];
      ctx.fillRect(-15, -64, 30, 64);
    }
    ctx.restore();

    drawAttack(f);

    // What the fighter carries, and what is wrong with them.
    if (f.held) {
      ctx.save();
      ctx.translate(f.x - f.facing * 26, f.y - 96 + Math.sin(t / 10) * 2);
      ctx.scale(0.7, 0.7);
      drawItemShape(f.held.type, 0, 14, t);
      ctx.restore();
    }
    if (f.stun > 0 && f.hitstun <= 0) {
      for (let i = 0; i < 3; i++) {
        const a = t / 6 + (i * Math.PI * 2) / 3;
        ctx.fillStyle = '#f6c343';
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(f.x + Math.cos(a) * 26, f.y - H - 8 + Math.sin(a) * 7, 5, 0, 7); ctx.fill(); ctx.stroke();
      }
    }
    if (f.tipsy > 0) {
      for (let i = 0; i < 3; i++) {
        const k = (t / 40 + i / 3) % 1;
        ctx.strokeStyle = `rgba(199,155,255,${1 - k})`;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(f.x + Math.sin(t / 8 + i * 2) * 18, f.y - H - k * 34, 4 + k * 4, 0, 7); ctx.stroke();
      }
    }
    if (f.speedBoost > 0 && Math.abs(f.vx) > 2) {
      ctx.strokeStyle = 'rgba(255,255,255,.6)';
      ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        const y = f.y - 20 - i * 26;
        ctx.beginPath(); ctx.moveTo(f.x - f.facing * 34, y); ctx.lineTo(f.x - f.facing * (58 + ((t * 5 + i * 9) % 20)), y); ctx.stroke();
      }
    }
  }

  // The normal attack does the same for everyone; only its look differs:
  // a swing (an arc), a poke (a stick with the item at its tip) or a short throw.
  function drawAttack(f) {
    const attack = f.attack;
    if (!attack || attack.kind === 'book') return;
    const A = CONFIG.attack;
    const k = Math.min(1, attack.t / (A.startup + A.active)); // 0 at the start, 1 when the hit is over
    const style = attack.kind === 'sardine' ? 'swing' : getFighter(f.fighterId).normalStyle;
    ctx.save();
    ctx.translate(f.x, f.y - 58);
    if (attack.dir === 'up') ctx.rotate(-Math.PI / 2);
    else ctx.scale(attack.facing, 1);
    ctx.lineCap = 'round';
    ctx.globalAlpha = attack.t > A.startup + A.active ? Math.max(0, 1 - (attack.t - A.startup - A.active) / 6) : 1;
    if (style === 'swing') {
      const sweep = -1.1 + 2.2 * k;
      ctx.strokeStyle = attack.kind === 'sardine' ? '#8fb4d9' : 'rgba(255,255,255,.85)';
      ctx.lineWidth = 9;
      ctx.beginPath(); ctx.arc(10, 0, 62, sweep - 0.9, sweep); ctx.stroke();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(10, 0, 67, sweep - 0.9, sweep); ctx.stroke();
    } else if (style === 'poke') {
      const reach = 26 + 60 * Math.sin(k * Math.PI);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(18 + reach, 0); ctx.stroke();
      ctx.strokeStyle = '#cfd6de';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = INK;
      roundRect(ctx, 14 + reach, -11, 16, 22, 3); ctx.fill();
      ctx.fillStyle = '#8fd3ff';
      ctx.fillRect(17 + reach, -8, 10, 16);
    } else {
      // throw: the fighter's own thing flies out to the end of the reach and is gone
      const x = 22 + 66 * k;
      const y = -18 * Math.sin(k * Math.PI);
      ctx.translate(x, y);
      ctx.rotate(k * 7);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3;
      if (f.fighterId === 'house_dj') {
        ctx.fillStyle = INK;
        ctx.beginPath(); ctx.arc(0, 0, 13, 0, 7); ctx.fill();
        ctx.fillStyle = '#f6c343';
        ctx.beginPath(); ctx.arc(0, 0, 5, 0, 7); ctx.fill();
      } else if (f.fighterId === 'carcavelos_gang_member') {
        ctx.fillStyle = '#f6c343';
        ctx.beginPath(); ctx.moveTo(-13, -11); ctx.lineTo(15, 0); ctx.lineTo(-13, 11); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#e63946';
        ctx.beginPath(); ctx.arc(-5, -3, 3, 0, 7); ctx.arc(2, 2, 3, 0, 7); ctx.fill();
      } else {
        ctx.fillStyle = '#f0a81e';
        roundRect(ctx, -8, -11, 16, 22, 3); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#eef3f8';
        ctx.fillRect(-9, -14, 18, 6);
      }
    }
    ctx.restore();
  }

  // Name, hearts and a thin damage bar above each fighter, in the player colour.
  function drawTag(f, lives) {
    if (f.state !== 'alive') return;
    const color = PLAYER_COLORS[f.slot];
    const text = `P${f.slot + 1} · ${f.name}  ${hearts(f.lives, lives)}`;
    ctx.font = `800 15px ${BODY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + 22;
    // A fighter outside the picture gets a marker at the edge instead.
    const off = f.x < 10 || f.x > SCREEN.w - 10 || f.y < 30 || f.y - H > SCREEN.h;
    const x = Math.max(w / 2 + 8, Math.min(SCREEN.w - w / 2 - 8, f.x));
    const y = Math.max(84, Math.min(SCREEN.h - 30, f.y - H - 30));
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.fillStyle = color;
    roundRect(ctx, x - w / 2, y - 11, w, 22, 11); ctx.fill(); ctx.stroke();
    ctx.fillStyle = f.slot === 3 ? INK : '#ffffff';
    ctx.fillText(text, x, y + 1);
    if (off) {
      ctx.fillStyle = color;
      ctx.beginPath();
      const ax = f.x < 10 ? x - w / 2 - 12 : f.x > SCREEN.w - 10 ? x + w / 2 + 12 : x;
      const ay = f.y < 30 ? y - 20 : f.y - H > SCREEN.h ? y + 20 : y;
      ctx.arc(ax, ay, 6, 0, 7);
      ctx.fill(); ctx.stroke();
      return;
    }
    const barW = 78;
    ctx.fillStyle = INK;
    roundRect(ctx, x - barW / 2 - 2, y + 14, barW + 4, 9, 4.5); ctx.fill();
    const fill = Math.max(0, Math.min(1, f.percent / CONFIG.match.burnoutPercent));
    if (fill > 0) {
      ctx.fillStyle = damageColor(f.percent);
      roundRect(ctx, x - barW / 2, y + 16, Math.max(5, barW * fill), 5, 2.5); ctx.fill();
    }
  }

  // ---- HUD ----

  function drawCards(state) {
    const lives = state.settings.lives;
    state.fighters.forEach((f, i) => {
      const w = 158;
      const x = 18 + i * (w + 11);
      const y = 12;
      const out = f.state === 'out';
      const color = out ? '#8a8f9c' : PLAYER_COLORS[f.slot];
      ctx.globalAlpha = out ? 0.7 : 1;
      ctx.fillStyle = 'rgba(22,18,42,.88)';
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      roundRect(ctx, x, y, w, 48, 11); ctx.fill(); ctx.stroke();
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
      ctx.fillStyle = color;
      // The name gets the room that the damage number leaves; a long gamertag is written smaller, never cut off.
      const shown = out ? 'OUT' : `${Math.floor(f.state === 'dead' ? 0 : f.percent)}%`;
      ctx.font = `${out ? 22 : 28}px ${DISPLAY}`;
      const room = w - ctx.measureText(shown).width - 28;
      let size = 14;
      ctx.font = `800 ${size}px ${BODY}`;
      while (ctx.measureText(f.name).width > room && size > 7) {
        size -= 0.5;
        ctx.font = `800 ${size}px ${BODY}`;
      }
      ctx.fillText(f.name, x + 11, y + 20);
      // The player label, small, in the corner of the card: colour is never the only cue.
      ctx.font = `800 9px ${BODY}`;
      ctx.textAlign = 'right';
      ctx.fillText(`P${f.slot + 1}`, x + w - 8, y + 12);
      ctx.textAlign = 'left';
      ctx.font = `800 14px ${BODY}`;
      ctx.fillText(hearts(f.lives, lives), x + 11, y + 38);
      ctx.textAlign = 'right';
      if (out) {
        ctx.font = `22px ${DISPLAY}`;
        ctx.fillText('OUT', x + w - 10, y + 34);
      } else {
        ctx.font = `28px ${DISPLAY}`;
        ctx.fillStyle = f.state === 'dead' ? '#8a8f9c' : damageColor(f.percent);
        ctx.fillText(`${Math.floor(f.state === 'dead' ? 0 : f.percent)}%`, x + w - 10, y + 36);
      }
      ctx.globalAlpha = 1;
    });
  }

  // Top right: the hazard's name, then a large 3, 2, 1. Text only.
  function drawHazardText(state, view) {
    const hz = state.hazard;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    if (hz.phase === 'warn') {
      ctx.font = `24px ${DISPLAY}`;
      outlined(ctx, hz.name, SCREEN.w - 30, 44, '#f6c343', 6);
      if (hz.count > 0) {
        const age = Math.min(1, (view.time - view.countAt) / 11);
        const scale = 1.7 - 0.7 * age;
        ctx.save();
        ctx.translate(SCREEN.w - 34, 128);
        ctx.scale(scale, scale);
        ctx.globalAlpha = Math.min(1, age * 3);
        ctx.font = `88px ${DISPLAY}`;
        outlined(ctx, String(hz.count), 0, 0, '#ffffff', 9);
        ctx.restore();
      }
    } else if (hz.phase === 'cancelled') {
      ctx.font = `24px ${DISPLAY}`;
      outlined(ctx, hz.text, SCREEN.w - 30, 44, '#f6c343', 6);
    }
  }

  function drawBanners(fx) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const b of fx.banners) {
      const age = b.max - b.life;
      const pop = age < 8 ? 1.6 - 0.6 * (age / 8) : 1;
      ctx.save();
      ctx.translate(SCREEN.w / 2, b.y);
      ctx.scale(pop, pop);
      ctx.globalAlpha = Math.min(1, b.life / 12, age / 3 + 0.3);
      ctx.font = `${b.size}px ${DISPLAY}`;
      outlined(ctx, b.text, 0, 0, b.color, Math.max(6, b.size / 9));
      if (b.sub) {
        ctx.font = `${Math.round(b.size * 0.36)}px ${DISPLAY}`;
        outlined(ctx, b.sub, 0, b.size * 0.78, '#f6c343', 7);
      }
      ctx.restore();
    }
  }

  function drawFx(fx) {
    for (const r of fx.rings) {
      const k = 1 - r.life / r.max;
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = 1 - k;
      ctx.lineWidth = 10 * (1 - k) + 2;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.radius * (0.25 + 0.75 * k), 0, 7); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const l of fx.lines) {
      const k = l.life / l.max;
      ctx.strokeStyle = l.color;
      ctx.lineWidth = 7 * k + 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(l.x1, l.y1);
      const mx = (l.x1 + l.x2) / 2;
      const my = (l.y1 + l.y2) / 2;
      ctx.quadraticCurveTo(mx + Math.sin(fx.time) * 18, my - 26 * k, l.x2, l.y2);
      ctx.stroke();
    }
    for (const p of fx.particles) {
      ctx.globalAlpha = Math.min(1, p.life / (p.max * 0.5));
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const n of fx.numbers) {
      const age = n.max - n.life;
      const scale = age < 6 ? 1.5 - 0.5 * (age / 6) : 1;
      ctx.save();
      ctx.translate(n.x, n.y);
      ctx.scale(scale, scale);
      ctx.globalAlpha = Math.min(1, n.life / 14);
      ctx.font = `26px ${DISPLAY}`;
      outlined(ctx, n.text, 0, 0, n.color, 5);
      ctx.restore();
    }
  }

  // view: { camera: {x, y, zoom}, fx, time, countAt, dim }
  function draw(stageId, state, view) {
    const fx = view.fx;
    ctx.setTransform(pixelScale, 0, 0, pixelScale, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#0c0a1c';
    ctx.fillRect(0, 0, SCREEN.w, SCREEN.h);

    const cam = view.camera || { x: 640, y: 360, zoom: 1 };
    const shakeX = fx && fx.shake ? (Math.random() - 0.5) * 2 * fx.shake : 0;
    const shakeY = fx && fx.shake ? (Math.random() - 0.5) * 2 * fx.shake : 0;
    ctx.save();
    ctx.translate(SCREEN.w / 2 + shakeX, SCREEN.h / 2 + shakeY);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);
    drawStage(stageId);
    if (state) {
      const t = view.time;
      drawHazardBack(state, t);
      drawItems(state, t);
      ctx.imageSmoothingEnabled = false; // crisp pixels for the sprites
      for (const f of state.fighters) drawFighter(f, t);
      ctx.imageSmoothingEnabled = true;
      drawProjectiles(state, t);
      drawHazardFront(state, t);
      drawFx(fx);
      for (const f of state.fighters) drawTag(f, state.settings.lives);
    }
    ctx.restore();

    if (state) {
      drawCards(state);
      drawHazardText(state, view);
      drawBanners(fx);
    }
    if (fx && fx.flash > 0) {
      ctx.globalAlpha = Math.min(0.85, fx.flash);
      ctx.fillStyle = fx.flashColor;
      ctx.fillRect(0, 0, SCREEN.w, SCREEN.h);
      ctx.globalAlpha = 1;
    }
  }

  return { draw, resize };
}
