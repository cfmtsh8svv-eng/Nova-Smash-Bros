// Item and hazard pictures that are drawn in more than one place: the items lying on the
// stage (render.js) and the cards of the intro before a match (intro.js). Each function
// draws around the current origin of `ctx`; the caller moves and scales it.
const INK = '#16122a';
const BODY = '"Nunito", "Segoe UI", sans-serif';

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// The small BOT tag next to a bot's name (GAME_SPEC §5a, D-162): a dark pill with white
// letters, left edge at x, centred on y. Returns its width, so the caller can place what follows.
export const botTagWidth = (ctx, size) => {
  ctx.save();
  ctx.font = `900 ${size}px "Nunito", "Segoe UI", sans-serif`;
  const w = ctx.measureText('BOT').width + size * 0.9;
  ctx.restore();
  return w;
};
export function drawBotTag(ctx, x, y, size) {
  const w = botTagWidth(ctx, size);
  const h = size * 1.35;
  ctx.save();
  ctx.fillStyle = '#16122a';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(1, size / 8);
  roundRect(ctx, x, y - h / 2, w, h, h / 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = `900 ${size}px "Nunito", "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('BOT', x + w / 2, y + size * 0.06);
  ctx.restore();
  return w;
}

// One of the nine items, standing on the origin (it is about 40 px wide and 40 px high).
export function drawItemShape(ctx, type, t) {
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  if (type === 'nata') {
    // Pastel de Nata: a golden tart with a burnt-sugar top
    ctx.fillStyle = '#c98a3a';
    ctx.beginPath(); ctx.ellipse(0, -11, 17, 12, 0, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f6c343';
    ctx.beginPath(); ctx.ellipse(0, -13, 12, 7, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#8a4f1e';
    for (const [dx, dy] of [[-5, -14], [4, -12], [0, -16]]) { ctx.beginPath(); ctx.arc(dx, dy, 2.2, 0, 7); ctx.fill(); }
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
  } else if (type === 'project') {
    // Group Project: a stuffed folder with a lit fuse
    ctx.fillStyle = '#f6c343';
    roundRect(ctx, -16, -28, 32, 26, 3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#eef3f8';
    ctx.fillRect(-12, -32, 22, 6);
    ctx.fillStyle = INK;
    ctx.font = `800 8px ${BODY}`;
    ctx.textAlign = 'center';
    ctx.fillText('GROUP', 0, -16);
    ctx.fillText('WORK', 0, -8);
    ctx.strokeStyle = INK;
    ctx.beginPath(); ctx.moveTo(12, -28); ctx.quadraticCurveTo(20, -36, 16, -42); ctx.stroke();
    ctx.fillStyle = Math.floor(t / 4) % 2 ? '#ff7a3d' : '#f6c343';
    ctx.beginPath(); ctx.arc(16, -43, 3.5, 0, 7); ctx.fill();
  } else if (type === 'bifana') {
    // Bifana: a pork sandwich in a crusty roll
    ctx.fillStyle = '#d9a35c';
    ctx.beginPath(); ctx.ellipse(0, -16, 19, 8, 0, Math.PI, 0); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#9a5a32';
    ctx.fillRect(-18, -16, 36, 5);
    ctx.fillStyle = '#d9a35c';
    ctx.beginPath(); ctx.ellipse(0, -10, 18, 5, 0, 0, Math.PI); ctx.fill(); ctx.stroke();
  } else if (type === 'megaphone') {
    ctx.fillStyle = '#e63946';
    ctx.beginPath(); ctx.moveTo(-14, -20); ctx.lineTo(10, -30); ctx.lineTo(10, -4); ctx.lineTo(-14, -12); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#eef3f8';
    ctx.fillRect(-20, -20, 7, 8);
    ctx.strokeRect(-20, -20, 7, 8);
    ctx.fillStyle = INK;
    ctx.fillRect(-10, -10, 4, 9);
  } else if (type === 'cork') {
    // Cork Shield: a round cork board with a darker rim
    ctx.fillStyle = '#c98a3a';
    ctx.beginPath(); ctx.arc(0, -16, 15, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#a86b2c';
    for (const [dx, dy] of [[-6, -20], [5, -12], [3, -23], [-3, -9], [8, -19]]) { ctx.beginPath(); ctx.arc(dx, dy, 1.6, 0, 7); ctx.fill(); }
    ctx.strokeStyle = '#7a4a2c';
    ctx.beginPath(); ctx.arc(0, -16, 11, 0, 7); ctx.stroke();
  } else if (type === 'azulejo') {
    // Azulejo: a white tile with a blue pattern
    ctx.fillStyle = '#eef3f8';
    roundRect(ctx, -14, -30, 28, 28, 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#2f5fb0';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0, -16, 7, 0, 7); ctx.stroke();
    for (const [dx, dy] of [[-10, -26], [10, -26], [-10, -6], [10, -6]]) { ctx.beginPath(); ctx.arc(dx, dy, 3.5, 0, 7); ctx.stroke(); }
  } else if (type === 'rooster') {
    // Lucky Rooster (Galo de Barcelos): black body, red comb, coloured hearts
    ctx.fillStyle = '#16122a';
    ctx.beginPath(); ctx.ellipse(-2, -14, 13, 10, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(9, -27, 5, 7, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-12, -16); ctx.lineTo(-20, -30); ctx.lineTo(-8, -22); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e63946';
    ctx.beginPath(); ctx.arc(9, -35, 3.5, 0, 7); ctx.arc(13, -33, 3, 0, 7); ctx.fill();
    ctx.fillStyle = '#f6c343';
    ctx.beginPath(); ctx.moveTo(13, -28); ctx.lineTo(18, -27); ctx.lineTo(13, -25); ctx.fill();
    ctx.fillStyle = '#f6c343';
    ctx.beginPath(); ctx.arc(-4, -14, 3, 0, 7); ctx.fill();
    ctx.fillStyle = '#e63946';
    ctx.beginPath(); ctx.arc(3, -11, 2.5, 0, 7); ctx.fill();
    ctx.strokeStyle = '#f6c343';
    ctx.beginPath(); ctx.moveTo(-2, -4); ctx.lineTo(-2, 0); ctx.moveTo(4, -4); ctx.lineTo(4, 0); ctx.stroke();
  }
}

// Small hazard pictures for the intro, about 80 x 80 around the centre, in the same ink-outlined style as the items.
export function drawHazardIcon(ctx, id, t) {
  ctx.lineWidth = 3.5; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const bob = Math.sin(t / 14) * 2;
  if (id === 'train') {
    // A Linha de Cascais unit from the side: ribbed steel carriage, yellow cab front, wheels on rails
    ctx.translate(Math.sin(t / 20) * 3, 0);
    ctx.fillStyle = '#b9c2cc'; roundRect(ctx, -40, -22, 62, 32, 4); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#8b96a3'; ctx.lineWidth = 1.5;
    for (let x = -36; x < 20; x += 5) { ctx.beginPath(); ctx.moveTo(x, -2); ctx.lineTo(x, 8); ctx.stroke(); }
    ctx.lineWidth = 3.5; ctx.strokeStyle = INK;
    ctx.fillStyle = '#f6c343'; ctx.beginPath(); ctx.moveTo(22, -22); ctx.lineTo(32, -22); ctx.quadraticCurveTo(42, -12, 42, 10); ctx.lineTo(22, 10); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#2b3a55'; for (const x of [-34, -20, -6]) { roundRect(ctx, x, -17, 10, 10, 2); ctx.fill(); }
    ctx.beginPath(); ctx.moveTo(27, -17); ctx.lineTo(33, -17); ctx.quadraticCurveTo(37, -12, 38, -6); ctx.lineTo(27, -6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e63946'; ctx.fillRect(-40, 2, 62, 3);
    ctx.fillStyle = INK; for (const x of [-30, -14, 8, 30]) { ctx.beginPath(); ctx.arc(x, 13, 5, 0, 7); ctx.fill(); }
    ctx.fillRect(-46, 18, 92, 3);
  } else if (id === 'wifi') {
    // Wi-Fi arcs, the outer ones greyed out, and a blinking red cross
    const arcs = [[30, '#5b5670'], [20, '#5b5670'], [10, '#8fb4d9']];
    for (const [r, c] of arcs) { ctx.strokeStyle = c; ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(-4, 16, r, -Math.PI * 0.78, -Math.PI * 0.22); ctx.stroke(); }
    ctx.fillStyle = '#8fb4d9'; ctx.beginPath(); ctx.arc(-4, 16, 4.5, 0, 7); ctx.fill();
    if (Math.floor(t / 20) % 2 === 0) {
      ctx.fillStyle = '#e63946'; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(22, -18, 11, 0, 7); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(17, -23); ctx.lineTo(27, -13); ctx.moveTo(27, -23); ctx.lineTo(17, -13); ctx.stroke();
    }
  } else if (id === 'rain') {
    // A grey cloud with drops falling and a slippery puddle
    ctx.strokeStyle = '#5fa8e8'; ctx.lineWidth = 3;
    for (let i = 0; i < 5; i++) { const x = -22 + i * 11, y = -2 + ((t * 1.2 + i * 9) % 26); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 3, y + 7); ctx.stroke(); }
    ctx.fillStyle = '#5fa8e8'; ctx.globalAlpha = .6; ctx.beginPath(); ctx.ellipse(0, 30, 28, 4, 0, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = INK; ctx.lineWidth = 3.5; ctx.fillStyle = '#9aa3b5';
    ctx.beginPath(); ctx.arc(-16, -12, 12, Math.PI * 0.5, Math.PI * 1.5); ctx.arc(-2, -22, 15, Math.PI, 0); ctx.arc(17, -12, 12, Math.PI * 1.5, Math.PI * 0.5); ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if (id === 'wave') {
    // A curling blue wave with white foam over the sand
    ctx.fillStyle = '#e8c88a'; ctx.fillRect(-42, 20, 84, 10);
    ctx.translate(Math.sin(t / 16) * 3, 0);
    ctx.fillStyle = '#2f7fe0'; ctx.beginPath(); ctx.moveTo(-40, 24); ctx.quadraticCurveTo(-30, -30, 14, -30); ctx.quadraticCurveTo(38, -28, 34, -8);
    ctx.quadraticCurveTo(26, -20, 12, -12); ctx.quadraticCurveTo(2, -4, 10, 8); ctx.quadraticCurveTo(24, 22, 40, 24); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#5fc8e8'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-28, 14); ctx.quadraticCurveTo(-22, -16, 8, -22); ctx.stroke();
    ctx.fillStyle = '#eef3f8'; for (const [x, y, r] of [[32, -10, 5], [26, -22, 4], [16, -27, 4], [38, 20, 4], [30, 18, 3]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }
  } else if (id === 'gulls') {
    // A seagull flying off with a Pastel de Nata in its beak
    ctx.translate(0, bob);
    const flap = Math.sin(t / 6) * 8;
    ctx.fillStyle = '#eef3f8';
    ctx.beginPath(); ctx.moveTo(-6, -4); ctx.quadraticCurveTo(-22, -20 - flap, -38, -10 - flap); ctx.quadraticCurveTo(-22, -8, -8, 4); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, 2, 22, 10, 0, 0, 7); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(18, -6, 8, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#5b5670'; ctx.beginPath(); ctx.moveTo(-4, -2); ctx.quadraticCurveTo(14, -24 + flap, 26, -16 + flap); ctx.quadraticCurveTo(14, -6, 4, 4); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ff9a3d'; ctx.beginPath(); ctx.moveTo(24, -6); ctx.lineTo(36, -3); ctx.lineTo(24, -1); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(20, -8, 1.8, 0, 7); ctx.fill();
    ctx.fillStyle = '#c98a3a'; ctx.beginPath(); ctx.ellipse(36, 6, 8, 5, 0, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f6c343'; ctx.beginPath(); ctx.ellipse(36, 5, 5, 3, 0, 0, 7); ctx.fill();
  } else if (id === 'sun') {
    // A blazing sun with turning rays and heat lines below
    ctx.save(); ctx.rotate(t / 60); ctx.strokeStyle = '#f6c343'; ctx.lineWidth = 5;
    for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 24, Math.sin(a) * 24 - 6); ctx.lineTo(Math.cos(a) * 34, Math.sin(a) * 34 - 6); ctx.stroke(); }
    ctx.restore();
    ctx.fillStyle = '#ff9a3d'; ctx.beginPath(); ctx.arc(0, -6, 19, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f6c343'; ctx.beginPath(); ctx.arc(-4, -10, 10, 0, 7); ctx.fill();
    ctx.strokeStyle = '#e63946'; ctx.lineWidth = 3;
    for (const x of [-16, 0, 16]) { ctx.beginPath(); ctx.moveTo(x, 40); for (let y = 40; y > 26; y -= 2) ctx.lineTo(x + Math.sin(y / 2 + t / 5) * 2.5, y); ctx.stroke(); }
  } else if (id === 'crowd') {
    // Three party people swaying together
    const people = [[-24, '#8e5cc8', 0], [24, '#2f7fe0', 2], [0, '#e85d9c', 1]];
    for (const [x, c, k] of people) {
      ctx.save(); ctx.translate(x, (k === 1 ? -4 : 2)); ctx.rotate(Math.sin(t / 10 + k) * 0.12);
      ctx.fillStyle = c; roundRect(ctx, -11, -6, 22, 34, 8); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#e8b48a'; ctx.beginPath(); ctx.arc(0, -16, 10, 0, 7); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = INK; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(-17, -16); ctx.moveTo(9, 0); ctx.lineTo(17, -16); ctx.stroke();
      ctx.restore();
    }
  } else if (id === 'drinks') {
    // A beer glass with foam, tilting, and dizzy swirls
    ctx.save(); ctx.rotate(Math.sin(t / 12) * 0.15);
    ctx.fillStyle = 'rgba(238,243,248,.25)'; roundRect(ctx, -16, -20, 30, 44, 4); ctx.fill();
    ctx.fillStyle = '#f6c343'; ctx.fillRect(-14, -12, 26, 34);
    ctx.strokeStyle = INK; roundRect(ctx, -16, -20, 30, 44, 4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(14, -10); ctx.quadraticCurveTo(28, -10, 28, 2); ctx.quadraticCurveTo(28, 14, 14, 14); ctx.stroke();
    ctx.fillStyle = '#eef3f8'; for (const [x, r] of [[-10, 7], [0, 8], [9, 7]]) { ctx.beginPath(); ctx.arc(x, -20, r, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#fff8'; for (const [x, y] of [[-6, 4], [4, -2], [-2, 14]]) { ctx.beginPath(); ctx.arc(x, y - (t % 30) / 3, 2, 0, 7); ctx.fill(); }
    ctx.restore();
    ctx.strokeStyle = '#c58af0'; ctx.lineWidth = 2.5;
    for (const [x, y, d] of [[-30, -26, 1], [30, -30, -1]]) { ctx.beginPath(); for (let a = 0; a < 10; a += 0.3) ctx.lineTo(x + Math.cos(a * d + t / 8) * a * 0.8, y + Math.sin(a * d + t / 8) * a * 0.8); ctx.stroke(); }
  } else if (id === 'fireworks') {
    // A rocket climbing from the street with a burst above it
    const k = (t % 60) / 60;
    ctx.strokeStyle = '#f6c343'; ctx.lineWidth = 3;
    const burst = 0.4 + k * 0.8;
    const cols = ['#e85d9c', '#f6c343', '#5fc8e8', '#22a36b'];
    for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; ctx.strokeStyle = cols[i % 4]; ctx.globalAlpha = 1 - k * 0.6;
      ctx.beginPath(); ctx.moveTo(-12 + Math.cos(a) * 8 * burst, -22 + Math.sin(a) * 8 * burst); ctx.lineTo(-12 + Math.cos(a) * 22 * burst, -22 + Math.sin(a) * 22 * burst); ctx.stroke(); }
    ctx.globalAlpha = 1;
    ctx.save(); ctx.translate(18, 10 - k * 8); ctx.rotate(0.25);
    ctx.fillStyle = '#ff7a3d'; ctx.beginPath(); ctx.moveTo(-4, 16); ctx.lineTo(0, 26 + Math.sin(t) * 3); ctx.lineTo(4, 16); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 3.5;
    ctx.fillStyle = '#e63946'; roundRect(ctx, -6, -10, 12, 26, 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#eef3f8'; ctx.beginPath(); ctx.moveTo(-6, -10); ctx.lineTo(0, -20); ctx.lineTo(6, -10); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f6c343'; ctx.fillRect(-6, 2, 12, 4);
    ctx.restore();
  }
}
