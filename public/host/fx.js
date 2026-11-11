// Visual effects that live only on the screen and never touch the rules:
// particles, damage numbers, shock rings, big texts, screen shake and flashes.
// The match tells us what happened (events); this file makes it look good.

export function createFx() {
  const fx = {
    particles: [], numbers: [], rings: [], lines: [], banners: [],
    shake: 0, flash: 0, flashColor: '#ffffff', time: 0,
  };

  fx.burst = (x, y, { count = 10, color = '#ffffff', speed = 5, size = 5, life = 26, gravity = 0.25, up = 0 } = {}) => {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      fx.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - up, life, max: life, color: Array.isArray(color) ? color[i % color.length] : color, size: size * (0.6 + Math.random() * 0.7), gravity, spin: Math.random() * 6 });
    }
    if (fx.particles.length > 500) fx.particles.splice(0, fx.particles.length - 500);
  };
  fx.number = (x, y, text, color) => fx.numbers.push({ x: x + (Math.random() - 0.5) * 20, y, text, color, life: 50, max: 50 });
  fx.ring = (x, y, radius, color, life = 22) => fx.rings.push({ x, y, radius, color, life, max: life });
  fx.line = (x1, y1, x2, y2, color, life = 14) => fx.lines.push({ x1, y1, x2, y2, color, life, max: life });
  // A big text in the middle of the screen. size in px of the 720p space.
  fx.banner = (text, { size = 72, color = '#ffffff', y = 250, life = 80, sub = '' } = {}) => {
    fx.banners = fx.banners.filter((b) => b.y !== y);
    fx.banners.push({ text, size, color, y, life, max: life, sub });
  };
  fx.addShake = (amount) => { fx.shake = Math.min(26, Math.max(fx.shake, amount)); };
  fx.addFlash = (amount, color = '#ffffff') => { fx.flash = Math.max(fx.flash, amount); fx.flashColor = color; };

  // steps: how many 60 Hz frames passed since the last picture (can be a fraction).
  fx.update = (steps) => {
    fx.time += steps;
    for (const p of fx.particles) {
      p.x += p.vx * steps;
      p.y += p.vy * steps;
      p.vy += p.gravity * steps;
      p.life -= steps;
    }
    fx.particles = fx.particles.filter((p) => p.life > 0);
    for (const n of fx.numbers) { n.y -= 1.1 * steps; n.life -= steps; }
    fx.numbers = fx.numbers.filter((n) => n.life > 0);
    for (const list of [fx.rings, fx.lines, fx.banners]) for (const o of list) o.life -= steps;
    fx.rings = fx.rings.filter((o) => o.life > 0);
    fx.lines = fx.lines.filter((o) => o.life > 0);
    fx.banners = fx.banners.filter((o) => o.life > 0);
    fx.shake *= 0.86 ** steps;
    if (fx.shake < 0.3) fx.shake = 0;
    fx.flash *= 0.88 ** steps;
    if (fx.flash < 0.02) fx.flash = 0;
  };

  fx.clear = () => {
    for (const key of ['particles', 'numbers', 'rings', 'lines', 'banners']) fx[key] = [];
    fx.shake = 0;
    fx.flash = 0;
  };

  return fx;
}
