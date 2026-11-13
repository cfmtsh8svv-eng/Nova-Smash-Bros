// Draws one picture of the match onto the canvas.
// It only reads the match state; it never changes it.
//
// Order, back to front: stage (one cached image) - hazards behind the fighters -
// items - fighters - things that fly - hazards in front - effects - name tags -
// the HUD (player cards, hazard countdown, big texts).
import { CONFIG, PLAYER_COLORS, SCREEN } from '/game/config.js';
import { CLOCK, damageColor, drawnPose, hearts, heldItemAt, matchClock, PAUSE_HINT, pauseHint } from '/game/view.js';
import { hazardRect } from '/game/hazards.js';
import { getFighter } from '/game/fighters.js';
import { duplicateColour, handPoint, SPRITE } from '/shared/art/characters.js';
import { getSprite, getStageImage, loadStage } from '/shared/art/sprites.js';
import { botTagWidth, drawBotTag, drawItemShape as drawItemPicture, roundRect } from './icons.js';
import { CROWN_SINK, drawCrown, headAboveFeet } from '/shared/art/crown.js';

const DISPLAY = '"Bungee", "Arial Black", sans-serif';
const BODY = '"Nunito", "Segoe UI", sans-serif';
const INK = '#16122a';
const H = CONFIG.body.h;

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
  let crowns = new Set(); // slots that wear the crown in the match being drawn

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
    drawItemPicture(ctx, type, t);
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
      } else if (p.kind === 'tile' || p.kind === 'shard') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.age * 0.4);
        if (p.kind === 'tile') drawItemShape('azulejo', 0, 16, t);
        else {
          ctx.fillStyle = '#eef3f8';
          ctx.strokeStyle = INK;
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(-8, -6); ctx.lineTo(8, -3); ctx.lineTo(-2, 8); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#2f5fb0';
          ctx.fillRect(-3, -3, 4, 4);
        }
        ctx.restore();
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

  // The train runs on the rails at the bottom of the screen (y 678 to 720) and is tall enough
  // to reach up through the terrace level, where it hits (D-144).
  function drawTrain(rect, dir) {
    // A Linha de Cascais unit: ribbed stainless steel, one long dark window band, a few
    // silver doors, grey boxes on the roof, and a flat yellow cab front.
    const cars = 3;
    const gap = 10;
    const carW = (rect.w - gap * (cars - 1)) / cars;
    const top = rect.y + 30;
    const floor = 664;
    const h = floor - top;
    const STEEL = '#c9c6bd';
    const STEEL_DARK = '#a7a49b';
    const YELLOW = '#f2b51d';
    ctx.save();
    ctx.lineJoin = 'round';
    for (let i = 0; i < cars; i++) {
      const x = rect.x + i * (carW + gap);
      const lead = dir > 0 ? i === cars - 1 : i === 0;
      const tail = dir > 0 ? i === 0 : i === cars - 1;
      if (i < cars - 1) {
        ctx.fillStyle = '#2b2d33';
        ctx.fillRect(x + carW - 4, top + 24, gap + 8, h - 40);
      }
      // roof units first, so the body covers their lower edge
      ctx.fillStyle = '#9b988f';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3;
      for (const k of [0.12, 0.62]) { roundRect(ctx, x + carW * k, top - 16, carW * 0.26, 22, 4); ctx.fill(); ctx.stroke(); }
      // body
      const body = ctx.createLinearGradient(0, top, 0, floor);
      body.addColorStop(0, '#dedbd2');
      body.addColorStop(0.5, STEEL);
      body.addColorStop(1, STEEL_DARK);
      ctx.fillStyle = body;
      ctx.lineWidth = 4;
      roundRect(ctx, x, top, carW, h, 12); ctx.fill(); ctx.stroke();
      ctx.save();
      roundRect(ctx, x, top, carW, h, 12); ctx.clip();
      // ribs over the whole side
      ctx.strokeStyle = 'rgba(80,76,68,.28)';
      ctx.lineWidth = 1.5;
      for (let fy = top + 8; fy < floor; fy += 6) { ctx.beginPath(); ctx.moveTo(x, fy); ctx.lineTo(x + carW, fy); ctx.stroke(); }
      // one long dark window band
      const bandTop = top + 22;
      const bandH = h * 0.3;
      ctx.fillStyle = '#2a2d31';
      ctx.fillRect(x, bandTop, carW, bandH);
      ctx.strokeStyle = '#4a4e55';
      ctx.lineWidth = 2;
      for (let wx = x + 60; wx < x + carW; wx += 60) { ctx.beginPath(); ctx.moveTo(wx, bandTop); ctx.lineTo(wx, bandTop + bandH); ctx.stroke(); }
      ctx.fillStyle = 'rgba(255,255,255,.12)';
      for (let wx = x + 14; wx < x + carW; wx += 60) ctx.fillRect(wx, bandTop + 5, 10, bandH - 10);
      // silver doors with two narrow windows, near the ends of the carriage
      const doors = [0.14, 0.86].map((k) => x + carW * k);
      for (const d of doors) {
        ctx.fillStyle = '#d9d7d0';
        ctx.strokeStyle = '#3a3c42';
        ctx.lineWidth = 2.5;
        roundRect(ctx, d - 26, bandTop - 6, 52, floor - bandTop + 4, 4); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(d, bandTop - 6); ctx.lineTo(d, floor); ctx.stroke();
        ctx.fillStyle = '#2a2d31';
        roundRect(ctx, d - 20, bandTop + 2, 14, bandH + 16, 3); ctx.fill();
        roundRect(ctx, d + 6, bandTop + 2, 14, bandH + 16, 3); ctx.fill();
      }
      // yellow cab ends: flat, with a wide dark windscreen and a headlight
      for (const end of [lead ? 'front' : null, tail ? 'back' : null]) {
        if (!end) continue;
        const atRight = (end === 'front') === (dir > 0);
        const cabW = 92;
        const cx = atRight ? x + carW - cabW : x;
        ctx.fillStyle = YELLOW;
        ctx.fillRect(cx, top, cabW, h);
        ctx.strokeStyle = 'rgba(120,80,0,.35)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(atRight ? cx : cx + cabW, top); ctx.lineTo(atRight ? cx : cx + cabW, floor); ctx.stroke();
        ctx.fillStyle = '#1c1e22';
        roundRect(ctx, cx + 10, bandTop - 2, cabW - 20, bandH + 10, 8); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.18)';
        ctx.fillRect(cx + 18, bandTop + 4, 8, bandH - 4);
        const lampX = atRight ? x + carW - 22 : x + 22;
        ctx.fillStyle = end === 'front' ? '#fff3c4' : '#e63946';
        ctx.beginPath(); ctx.arc(lampX, top + h * 0.72, 7, 0, 7); ctx.fill();
        if (end === 'front') {
          ctx.fillStyle = 'rgba(255,243,196,.4)';
          ctx.beginPath(); ctx.arc(lampX, top + h * 0.72, 15, 0, 7); ctx.fill();
        }
        // the coupler and a dark lower edge
        ctx.fillStyle = '#2b2d33';
        ctx.fillRect(cx, floor - 12, cabW, 12);
      }
      ctx.restore();
      // pantograph on the middle carriage
      if (i === 1) {
        ctx.strokeStyle = INK;
        ctx.lineWidth = 3;
        const px = x + carW / 2;
        ctx.beginPath();
        ctx.moveTo(px - 28, top); ctx.lineTo(px + 6, top - 28); ctx.lineTo(px - 16, top - 28);
        ctx.moveTo(px - 32, top - 28); ctx.lineTo(px + 34, top - 28);
        ctx.stroke();
      }
      // dark skirt and bogies
      ctx.fillStyle = '#2b2d33';
      ctx.fillRect(x + 8, floor, carW - 16, 8);
      for (const k of [0.15, 0.85]) {
        const bx = x + carW * k;
        roundRect(ctx, bx - 38, floor + 2, 76, 12, 4); ctx.fill();
        for (const dx of [-22, 22]) {
          ctx.fillStyle = '#16171b';
          ctx.beginPath(); ctx.arc(bx + dx, floor + 14, 9, 0, 7); ctx.fill();
          ctx.fillStyle = '#8a8f9c';
          ctx.beginPath(); ctx.arc(bx + dx, floor + 14, 3, 0, 7); ctx.fill();
          ctx.fillStyle = '#2b2d33';
        }
      }
    }
    ctx.restore();
  }

  // The water rises from the bottom edge of the screen (D-146).
  function drawWave(rect, dir, t) {
    ctx.save();
    const top = rect.y + 6;
    const bottom = SCREEN.h;
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

  // During the countdown the place where the hazard will strike gives a hint (not for the
  // Big Wave and the Midday Sun, D-151):
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
    if (hz.id === 'rain') {
      ctx.save();
      ctx.globalAlpha = 0.18 + 0.12 * pulse;
      ctx.fillStyle = '#2a3346';
      ctx.fillRect(0, 0, SCREEN.w, SCREEN.h);
      ctx.restore();
    }
    if (hz.id === 'fireworks') {
      for (const x of hz.spots) {
        glow(x, ground - 6, 44, '#ff7a3d');
        // a lit fuse lying on the street
        ctx.strokeStyle = INK;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x - 14, ground - 3); ctx.quadraticCurveTo(x, ground - 9, x + 12, ground - 4); ctx.stroke();
        ctx.fillStyle = Math.floor(t / 3) % 2 ? '#f6c343' : '#ff7a3d';
        ctx.beginPath(); ctx.arc(x + 12 + Math.sin(t / 2) * 2, ground - 6, 4, 0, 7); ctx.fill();
      }
    }
    if (hz.id === 'crowd') glow(edge, ground - 50, 170, '#ffd98a');
    if (hz.id === 'gulls') glow(edge, hz.zone === 'sand' ? 520 : 360, 150, '#ffffff');
    if (hz.id === 'wifi') drawWifiIcon(84, wifiBand(hz).y + 96, pulse);
    if (hz.id === 'drinks') {
      const p = state.stage.platforms[hz.platform];
      for (let i = 1; i <= 3; i++) glow(p.x + (p.w * i) / 4, p.y - 16, 46, '#c79bff');
    }
  }

  // Sudden Rain: a darker sky and a wet shine on every platform (the drops are drawn in front).
  function drawRainBack(state, t) {
    ctx.save();
    ctx.fillStyle = 'rgba(30,38,58,.38)';
    ctx.fillRect(0, 0, SCREEN.w, SCREEN.h);
    for (const p of state.stage.platforms) {
      const g = ctx.createLinearGradient(p.x, 0, p.x + p.w, 0);
      const k = (t * 4) % (p.w + 200);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(Math.max(0, Math.min(1, (k - 100) / p.w)), 'rgba(255,255,255,.08)');
      g.addColorStop(Math.max(0, Math.min(1, k / p.w)), 'rgba(220,240,255,.55)');
      g.addColorStop(1, 'rgba(255,255,255,.1)');
      ctx.fillStyle = g;
      ctx.fillRect(p.x, p.y - 3, p.w, 6);
    }
    ctx.restore();
  }

  // Raindrops in no pattern: each has its own place, length, speed and brightness, and
  // the wind turns them a little now and then. Drawn from a fixed random list, so a drop
  // keeps its place from one picture to the next.
  const DROPS = Array.from({ length: 170 }, () => ({
    x: Math.random() * (SCREEN.w + 300), y: Math.random() * SCREEN.h,
    speed: 14 + Math.random() * 14, len: 10 + Math.random() * 26, alpha: 0.25 + Math.random() * 0.5, width: Math.random() < 0.25 ? 2.5 : 1.5,
  }));
  function drawRain(t, state) {
    const wind = 0.22 + 0.12 * Math.sin(t / 47) + 0.05 * Math.sin(t / 13);
    ctx.save();
    ctx.lineCap = 'round';
    for (const d of DROPS) {
      const y = (d.y + t * d.speed) % (SCREEN.h + 60) - 30;
      const x = ((d.x - y * wind - t * wind * 4) % (SCREEN.w + 300) + SCREEN.w + 300) % (SCREEN.w + 300) - 150;
      ctx.strokeStyle = `rgba(205,228,255,${d.alpha})`;
      ctx.lineWidth = d.width;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - d.len * wind, y + d.len); ctx.stroke();
    }
    // splashes on the platforms, at changing places
    ctx.strokeStyle = 'rgba(220,238,255,.6)';
    ctx.lineWidth = 1.5;
    for (const p of state.stage.platforms) {
      for (let k = 0; k < Math.ceil(p.w / 140); k++) {
        const seed = Math.floor(t / 9) * 7 + k * 31 + p.x;
        const sx = p.x + ((seed * 9301 + 49297) % 233280) / 233280 * p.w;
        const age = (t % 9) / 9;
        ctx.globalAlpha = 1 - age;
        ctx.beginPath(); ctx.ellipse(sx, p.y - 1, 3 + age * 9, 1 + age * 2.5, 0, Math.PI, 0); ctx.stroke();
      }
    }
    ctx.restore();
  }

  // Midday Sun: a bright glare over the sand and heat shimmer on it.
  function drawSun(state, t) {
    const ground = state.stage.platforms[0].y;
    const top = CONFIG.levels.groundAbove - 60;
    ctx.save();
    const g = ctx.createLinearGradient(0, top, 0, ground + 20);
    g.addColorStop(0, 'rgba(255,240,170,0)');
    g.addColorStop(1, `rgba(255,236,150,${0.38 + 0.08 * Math.sin(t / 8)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, top, SCREEN.w, ground + 20 - top);
    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 16; i++) {
      const x = 140 + i * 66;
      const y = ground - 20 - ((t * 1.5 + i * 13) % 50);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 6 * Math.sin(t / 4 + i), y - 10, x, y - 20); ctx.stroke();
    }
    const sun = ctx.createRadialGradient(1120, 70, 10, 1120, 70, 150);
    sun.addColorStop(0, 'rgba(255,255,230,.9)');
    sun.addColorStop(1, 'rgba(255,240,170,0)');
    ctx.fillStyle = sun;
    ctx.fillRect(970, 0, 310, 230);
    ctx.restore();
  }

  function drawRockets(hz, t) {
    const F = CONFIG.hazards.fireworks;
    for (const r of hz.rockets) {
      if (r.done) continue;
      ctx.save();
      ctx.translate(r.x, r.y);
      // the trail of sparks below
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = ['#f6c343', '#ff7a3d', '#ffffff'][i % 3];
        ctx.fillRect(-3 + Math.sin(t + i) * 4, 6 + i * 9, 5, 5);
      }
      ctx.lineWidth = 3;
      ctx.strokeStyle = INK;
      ctx.fillStyle = '#e63946';
      roundRect(ctx, -F.width / 4, -F.height, F.width / 2, F.height - 6, 4); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#f6c343';
      ctx.beginPath(); ctx.moveTo(-F.width / 4, -F.height); ctx.lineTo(0, -F.height - 14); ctx.lineTo(F.width / 4, -F.height); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
  }

  function drawHazardBack(state, t) {
    const hz = state.hazard;
    if (hz.phase === 'warn') drawTelegraph(state, t);
    if (hz.phase !== 'active') return;
    if (hz.id === 'wifi') drawWifi(hz, t);
    if (hz.id === 'drinks') drawDrinks(hz, t);
    if (hz.id === 'rain') drawRainBack(state, t);
    if (hz.id === 'sun') drawSun(state, t);
  }

  function drawHazardFront(state, t) {
    const hz = state.hazard;
    if (hz.phase !== 'active') return;
    const rect = hazardRect(state);
    if (hz.id === 'train') drawTrain(rect, hz.dir);
    if (hz.id === 'wave') drawWave(rect, hz.dir, t);
    if (hz.id === 'crowd') drawCrowd(rect, hz.dir, t);
    if (hz.id === 'gulls') drawGulls(hz, t);
    if (hz.id === 'rain') drawRain(t, state);
    if (hz.id === 'fireworks') drawRockets(hz, t);
  }

  // ---- fighters ----

  function drawFighter(f, t) {
    if (f.state !== 'alive') return;
    const pose = drawnPose(f);
    const main = f.altColor ? duplicateColour(f.fighterId, PLAYER_COLORS[f.slot]) : null;
    const sprite = getSprite(f.fighterId, main, pose) || getSprite(f.fighterId, main, 'idle');

    // Lucky Rooster: a golden glow around the fighter.
    if (f.rooster > 0) {
      const glow = ctx.createRadialGradient(f.x, f.y - 50, 10, f.x, f.y - 50, 80);
      glow.addColorStop(0, `rgba(246,195,67,${0.55 + 0.15 * Math.sin(t / 5)})`);
      glow.addColorStop(1, 'rgba(246,195,67,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(f.x - 80, f.y - 130, 160, 160);
    }
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
    if (f.bifana > 0) sx *= 1.14; // a Bifana: a bit wider
    if (f.stretch > 0) { const k = f.stretch / 8; sx -= 0.13 * k; sy += 0.17 * k; }
    let tilt = 0;
    if (f.hitstun > 0) tilt = Math.max(-0.5, Math.min(0.5, f.vx * 0.035));
    if (f.tipsy > 0) tilt += Math.sin(t / 9) * 0.12;
    if (f.slip > 0) tilt += Math.sin(t / 4) * 0.1;

    // A hanging fighter is drawn with the hand on the corner of the ground.
    const lift = f.hang ? f.hang.y - (f.y + handPoint(f.fighterId, 'hang').y) : 0;
    ctx.save();
    ctx.translate(f.x, f.y + lift);
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
    // The crown of the last match's winner (D-154), on the head.
    if (crowns.has(f.slot)) {
      const head = headAboveFeet(getSprite(f.fighterId, main, 'idle')) * SPRITE.scale * sy;
      drawCrown(ctx, f.x - 3 * f.facing, f.y + lift - head + CROWN_SINK, 0.9);
    }

    drawAttack(f);

    // What the fighter carries, and what is wrong with them.
    if (f.held) {
      // In the back hand, following the arm (D-139).
      const hand = heldItemAt(f, handPoint);
      ctx.save();
      ctx.translate(hand.x, hand.y + lift);
      ctx.scale(0.7 * f.facing, 0.7);
      drawItemShape(f.held.type, 0, 14, t);
      ctx.restore();
      if (f.held.type === 'project') {
        // The fuse above the holder: the seconds left, red in the last two.
        const left = Math.ceil(f.held.fuse / 60);
        ctx.save();
        ctx.font = `30px ${DISPLAY}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const bob = Math.sin(t / 3) * 2;
        outlined(ctx, `${left}`, f.x, f.y - H - 62 + lift + bob, left <= 2 ? '#e63946' : '#f6c343', 6);
        ctx.restore();
      }
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
  }

  // The normal attack does the same for everyone; only its look differs:
  // a swing (an arc), a poke (a stick with the item at its tip) or a short throw.
  function drawAttack(f) {
    const attack = f.attack;
    if (attack && attack.kind === 'stomp' && attack.phase === 'dive') {
      // Speed lines above the diving fighter.
      ctx.strokeStyle = 'rgba(255,255,255,.7)';
      ctx.lineWidth = 3;
      for (const dx of [-16, 0, 16]) {
        ctx.beginPath(); ctx.moveTo(f.x + dx, f.y - H - 6); ctx.lineTo(f.x + dx, f.y - H - 30 - Math.abs(dx)); ctx.stroke();
      }
      return;
    }
    if (!attack || attack.kind === 'book' || attack.kind === 'azulejo' || attack.kind === 'stomp') return;
    const A = CONFIG.attack;
    const k = Math.min(1, attack.t / (A.startup + A.active)); // 0 at the start, 1 when the hit is over
    if (attack.kind === 'megaphone') {
      // A wide cone of sound waves, as long and as high as the blast reaches.
      const M = CONFIG.items.megaphone;
      ctx.save();
      ctx.translate(f.x, f.y - 48);
      if (attack.dir === 'up') ctx.rotate(-Math.PI / 2);
      else ctx.scale(attack.facing, 1);
      ctx.globalAlpha = Math.max(0, 1 - Math.max(0, attack.t - A.startup - A.active) / 6);
      ctx.lineCap = 'round';
      for (let i = 0; i < 4; i++) {
        const r = 30 + ((k * M.range + i * 45) % M.range);
        ctx.strokeStyle = i % 2 ? 'rgba(255,255,255,.8)' : 'rgba(246,195,67,.85)';
        ctx.lineWidth = 6;
        ctx.beginPath(); ctx.arc(0, 0, r, -0.45, 0.45); ctx.stroke();
      }
      ctx.restore();
      return;
    }
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
    // A bot carries the BOT tag after its name (D-162).
    const before = `P${f.slot + 1} · ${f.name}`;
    const tagW = f.bot ? botTagWidth(ctx, 10) + 6 : 0;
    const w = ctx.measureText(text).width + 22 + tagW;
    // A fighter outside the picture gets a marker at the edge instead.
    const off = f.x < 10 || f.x > SCREEN.w - 10 || f.y < 30 || f.y - H > SCREEN.h;
    const x = Math.max(w / 2 + 8, Math.min(SCREEN.w - w / 2 - 8, f.x));
    // A crowned fighter's pill sits a little higher, so the crown on the head stays visible.
    const y = Math.max(84, Math.min(SCREEN.h - 30, f.y - H - 30 - (crowns.has(f.slot) ? 22 : 0)));
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.fillStyle = color;
    roundRect(ctx, x - w / 2, y - 11, w, 22, 11); ctx.fill(); ctx.stroke();
    ctx.fillStyle = f.slot === 3 ? INK : '#ffffff';
    if (f.bot) {
      ctx.textAlign = 'left';
      const left = x - w / 2 + 11;
      const nameW = ctx.measureText(before).width;
      ctx.fillText(before, left, y + 1);
      drawBotTag(ctx, left + nameW + 4, y, 10);
      ctx.fillText(`  ${hearts(f.lives, lives)}`, left + nameW + tagW, y + 1);
      ctx.textAlign = 'center';
    } else {
      ctx.fillText(text, x, y + 1);
    }
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
      const tagW = f.bot ? botTagWidth(ctx, 9) + 5 : 0;
      const room = w - ctx.measureText(shown).width - 28 - tagW;
      let size = 14;
      ctx.font = `800 ${size}px ${BODY}`;
      while (ctx.measureText(f.name).width > room && size > 7) {
        size -= 0.5;
        ctx.font = `800 ${size}px ${BODY}`;
      }
      ctx.fillText(f.name, x + 11, y + 20);
      if (f.bot) drawBotTag(ctx, x + 11 + ctx.measureText(f.name).width + 5, y + 15, 9);
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
    if (state.phase !== 'fight') return; // hazards stop with the final KO: no frozen countdown
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
    }
  }

  // Bottom centre, under the main ground: how to pause. Subtle, and gone in the final KO.
  function drawPauseHint(state) {
    if (!pauseHint(state)) return;
    ctx.save();
    ctx.globalAlpha = PAUSE_HINT.alpha;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 16px ${BODY}`;
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4;
    ctx.strokeStyle = INK;
    ctx.strokeText(PAUSE_HINT.text, SCREEN.w / 2, PAUSE_HINT.y);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(PAUSE_HINT.text, SCREEN.w / 2, PAUSE_HINT.y);
    ctx.restore();
  }

  // Bottom centre, in the pause hint's place: the clock of a demo match (m:ss), in the
  // lobby's display font, white with a dark outline like the other canvas text.
  function drawClock(state) {
    const text = matchClock(state);
    if (!text) return;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `26px ${DISPLAY}`;
    outlined(ctx, text, SCREEN.w / 2, CLOCK.y, '#ffffff', 6);
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
      // A long line (a 12-letter gamertag "graduates with honours!") is made smaller until it fits.
      let size = b.size;
      ctx.font = `${size}px ${DISPLAY}`;
      while (ctx.measureText(b.text).width > SCREEN.w - 120 && size > 20) {
        size -= 2;
        ctx.font = `${size}px ${DISPLAY}`;
      }
      outlined(ctx, b.text, 0, 0, b.color, Math.max(6, size / 9));
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
    crowns = view.crowns || new Set();
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
      drawPauseHint(state);
      drawClock(state);
      drawBanners(fx);
    }
    if (fx && fx.flash > 0) {
      ctx.globalAlpha = Math.min(0.85, fx.flash);
      ctx.fillStyle = fx.flashColor;
      ctx.fillRect(0, 0, SCREEN.w, SCREEN.h);
      ctx.globalAlpha = 1;
    }
  }

  // The end sequence (ceremony.js) draws itself; this only sets up the canvas for it.
  function drawCeremony(stageId, ceremony, seconds) {
    ctx.setTransform(pixelScale, 0, 0, pixelScale, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#0c0a1c';
    ctx.fillRect(0, 0, SCREEN.w, SCREEN.h);
    ceremony.draw(ctx, seconds, () => drawStage(stageId));
  }

  return { draw, drawCeremony, resize };
}
