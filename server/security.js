// HTTP security headers and a small rate limiter.

// The Content-Security-Policy allows only our own files: no inline scripts,
// nothing from other sites, and WebSockets only to this server.
function csp(host) {
  const sockets = /^[A-Za-z0-9.:[\]-]{1,255}$/.test(host || '') ? ` ws://${host} wss://${host}` : '';
  return [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:", // the sprites and stages are drawn through data: images
    "font-src 'self'",
    `connect-src 'self'${sockets}`,
    "media-src 'none'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'none'",
  ].join('; ');
}

// host: the Host header of the request. secure: the request came over https.
export function securityHeaders(host = '', secure = false) {
  const headers = {
    'Content-Security-Policy': csp(host),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  };
  // Tell browsers to use https only from now on (only sent where https is certain).
  if (secure) headers['Strict-Transport-Security'] = 'max-age=31536000';
  return headers;
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

  // True if this key has already used up `limit` in the current window (nothing is counted).
  isOver(key, limit, now = Date.now()) {
    const entry = this.hits.get(key);
    return Boolean(entry) && now - entry.start < this.windowMs && entry.count >= limit;
  }

  sweep(now = Date.now()) {
    for (const [key, entry] of this.hits) if (now - entry.start >= (entry.keepMs || this.windowMs)) this.hits.delete(key);
  }

  // A plain counter under a key that already contains its own time slot (for example
  // "results:<hour>:<gamertag>"). peek() asks whether there is room, count() adds one.
  peek(key, limit) {
    const entry = this.hits.get(key);
    return !entry || entry.count < limit;
  }

  count(key, now = Date.now(), keepMs = 2 * 3_600_000) {
    const entry = this.hits.get(key) || { start: now, count: 0, keepMs };
    entry.count += 1;
    this.hits.set(key, entry);
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

// The address a request came from. Forwarding headers are only trusted when the
// server is told that it sits behind Render (TRUST_PROXY=cloudflare): Render's front
// door is Cloudflare, which sets CF-Connecting-IP itself and overwrites whatever a
// visitor sends. Headers a visitor can choose (X-Forwarded-For) are never used.
export function clientAddress(req, trustProxy) {
  if (trustProxy) {
    const direct = req.headers['cf-connecting-ip'];
    if (typeof direct === 'string' && /^[0-9a-fA-F.:]{3,45}$/.test(direct)) return direct;
  }
  return req.socket.remoteAddress || 'unknown';
}
