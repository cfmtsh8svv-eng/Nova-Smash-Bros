// HTTP security headers and a small rate limiter.

// The Content-Security-Policy allows only our own files: no inline scripts,
// nothing from other sites. Sprites are drawn through data: images, sounds are
// synthesised, so nothing external is ever needed.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' ws: wss:",
  "media-src 'self' data: blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join('; ');

export function securityHeaders() {
  return {
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  };
}

// Counts events per key (an address, a socket) in one-minute windows.
export class RateLimiter {
  constructor(windowMs = 60_000) {
    this.windowMs = windowMs;
    this.hits = new Map(); // key -> { start, count }
  }

  // Returns true if this event is still within `limit` for the current window.
  allow(key, limit, now = Date.now()) {
    let entry = this.hits.get(key);
    if (!entry || now - entry.start >= this.windowMs) {
      entry = { start: now, count: 0 };
      this.hits.set(key, entry);
    }
    entry.count += 1;
    return entry.count <= limit;
  }

  sweep(now = Date.now()) {
    for (const [key, entry] of this.hits) if (now - entry.start >= this.windowMs) this.hits.delete(key);
  }
}

// A token bucket for one socket: `rate` messages per second, short bursts of twice that.
export class Bucket {
  constructor(rate, now = Date.now()) {
    this.rate = rate;
    this.tokens = rate * 2;
    this.last = now;
  }

  take(now = Date.now()) {
    this.tokens = Math.min(this.rate * 2, this.tokens + ((now - this.last) / 1000) * this.rate);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

// The address a request came from. Behind Render's proxy the real one is the
// last entry the proxy added to X-Forwarded-For; without a proxy we never trust that header.
export function clientAddress(req, trustProxy) {
  if (trustProxy) {
    const header = req.headers['x-forwarded-for'];
    if (typeof header === 'string' && header.length < 500) {
      const last = header.split(',').pop().trim();
      if (last) return last;
    }
  }
  return req.socket.remoteAddress || 'unknown';
}
