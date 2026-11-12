// The crown of the last match's winner (D-154): cosmetic only. Drawn in the ink-outlined
// style of the fighters, standing on (x, y), about 38 px wide and 26 px high at scale 1.
import { INK, SPRITE } from './characters.js';

// How far the top of the head is above the feet, in sprite pixels: the highest drawn
// pixel near the middle of the sprite. Fighters differ in height (hair, hats), so it is
// measured once per sprite. Without readable pixels, a typical head height is used.
const heads = new WeakMap();
export function headAboveFeet(sprite) {
  if (!sprite) return 66;
  if (heads.has(sprite)) return heads.get(sprite);
  let above = 66;
  try {
    const x0 = Math.round(SPRITE.anchorX - 12);
    const data = sprite.getContext('2d').getImageData(x0, 0, 24, sprite.height).data;
    for (let y = 0; y < sprite.height; y++) {
      let drawn = false;
      for (let x = 0; x < 24 && !drawn; x++) drawn = data[(y * 24 + x) * 4 + 3] > 0;
      if (drawn) { above = SPRITE.anchorY - y; break; }
    }
  } catch { /* keep the typical height */ }
  heads.set(sprite, above);
  return above;
}

// The crown sinks this far (screen pixels) into the hair, so it sits on the head.
export const CROWN_SINK = 5;

export function drawCrown(ctx, x, y, scale = 1, rot = 0, alpha = 1) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(scale, scale);
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.lineJoin = 'round';
  ctx.fillStyle = '#f6c343';
  ctx.beginPath();
  ctx.moveTo(-17, 0); ctx.lineTo(-19, -20); ctx.lineTo(-9, -10); ctx.lineTo(0, -24); ctx.lineTo(9, -10); ctx.lineTo(19, -20); ctx.lineTo(17, 0);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#d99a1e';
  ctx.fillRect(-16, -6, 32, 5);
  ctx.fillStyle = '#e63946';
  ctx.beginPath(); ctx.arc(0, -4, 3, 0, 7); ctx.fill();
  ctx.fillStyle = '#2f7fe0';
  for (const dx of [-10, 10]) { ctx.beginPath(); ctx.arc(dx, -4, 2.2, 0, 7); ctx.fill(); }
  ctx.fillStyle = '#fff6c8';
  for (const [dx, dy] of [[-19, -20], [0, -24], [19, -20]]) { ctx.beginPath(); ctx.arc(dx, dy, 2.6, 0, 7); ctx.fill(); ctx.stroke(); }
  ctx.restore();
}
