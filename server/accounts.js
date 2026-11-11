// Accounts: PIN hashing, session tokens, the wrong-PIN lockout and "one phone per account".
import { createHmac, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { LIMITS } from './config.js';

// A PIN has only 10,000 possibilities, so a plain hash would be guessed at once
// by anyone who sees the sheet. Three things make that hard:
//  - scrypt is slow on purpose,
//  - the salt is different for every player,
//  - the pepper is a secret that only the server knows (it is not in the sheet).
export function hashPin(pin, saltHex, pepper) {
  return new Promise((resolve, reject) => {
    scrypt(`${pepper}:${pin}`, Buffer.from(saltHex, 'hex'), 32, { N: 16384, r: 8, p: 1 }, (err, key) => {
      if (err) reject(err);
      else resolve(key.toString('hex'));
    });
  });
}

export const newSalt = () => randomBytes(16).toString('hex');

export async function verifyPin(pin, saltHex, expectedHex, pepper) {
  if (typeof saltHex !== 'string' || typeof expectedHex !== 'string' || !/^[0-9a-f]{64}$/.test(expectedHex) || !/^[0-9a-f]+$/.test(saltHex)) return false;
  const actual = Buffer.from(await hashPin(pin, saltHex, pepper), 'hex');
  const expected = Buffer.from(expectedHex, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// ---- session tokens ----
// A token is "payload.signature". The payload says who it is for and when it
// expires; the signature is an HMAC of the payload with the server's secret.
// Without the secret nobody can make or change a token.
const b64 = (buf) => Buffer.from(buf).toString('base64url');
const sign = (payload, secret) => createHmac('sha256', secret).update(payload).digest('base64url');

export function createToken(gamertag, sid, secret, now = Date.now()) {
  const payload = b64(JSON.stringify({ g: gamertag, s: sid, i: now, e: now + LIMITS.sessionMs }));
  return `${payload}.${sign(payload, secret)}`;
}

// Returns { gamertag, sid } or null if the token is malformed, tampered with or expired.
export function verifyToken(token, secret, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 400) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const expected = Buffer.from(sign(parts[0], secret));
  const given = Buffer.from(parts[1]);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  let data;
  try {
    data = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!data || typeof data.g !== 'string' || typeof data.s !== 'string' || typeof data.e !== 'number') return null;
  if (data.e <= now) return null;
  return { gamertag: data.g, sid: data.s, issuedAt: typeof data.i === 'number' ? data.i : 0 };
}

// ---- wrong-PIN lockout: five wrong PINs within 10 minutes lock the gamertag for 10 minutes ----
export class LoginGuard {
  constructor() {
    this.entries = new Map(); // gamertag_lower -> { fails: [timestamps], day: [timestamps], lockedUntil }
  }

  // Seconds until the gamertag may try again (0 = not locked).
  lockedFor(lower, now) {
    const e = this.entries.get(lower);
    if (!e || e.lockedUntil <= now) return 0;
    return Math.ceil((e.lockedUntil - now) / 1000);
  }

  // Record a wrong PIN. Returns how many tries are left (0 = now locked).
  fail(lower, now) {
    const e = this.entries.get(lower) || { fails: [], day: [], lockedUntil: 0 };
    e.fails = e.fails.filter((t) => now - t < LIMITS.loginWindowMs);
    e.day = e.day.filter((t) => now - t < LIMITS.loginDayMs);
    e.fails.push(now);
    e.day.push(now);
    if (e.day.length >= LIMITS.loginMaxFailsPerDay) {
      // Twenty misses in a day: locked until the oldest of them is a day old. This is
      // what makes trying all 10,000 PINs take more than a year instead of two weeks.
      e.lockedUntil = e.day[0] + LIMITS.loginDayMs;
      e.fails = [];
    } else if (e.fails.length >= LIMITS.loginMaxFails) {
      e.lockedUntil = now + LIMITS.loginLockMs;
      e.fails = [];
    }
    this.entries.set(lower, e);
    return e.lockedUntil > now ? 0 : LIMITS.loginMaxFails - e.fails.length;
  }

  // A correct PIN clears the short count. The day's count stays, so a guesser who
  // also knows a way to reset the short count gains nothing.
  success(lower) {
    const e = this.entries.get(lower);
    if (e) e.fails = [];
  }

  // Forget old entries so the map cannot grow without limit.
  sweep(now) {
    for (const [key, e] of this.entries) {
      if (e.lockedUntil <= now && e.day.every((t) => now - t >= LIMITS.loginDayMs)) this.entries.delete(key);
    }
  }
}

// ---- one phone per account ----
// Every login gets a new session id. The newest one wins: an older token of the
// same gamertag is refused, and the phone using it is signed out.
export class Sessions {
  constructor() {
    this.current = new Map(); // gamertag_lower -> { sid, issuedAt }
  }

  start(lower, now = Date.now()) {
    const sid = randomUUID();
    this.current.set(lower, { sid, issuedAt: now });
    return sid;
  }

  // True if this session may be used. The newest login wins. After a server
  // restart nothing is known yet, so the first token seen is adopted; if a token
  // from a later login shows up afterwards, that one takes over.
  accept(lower, sid, issuedAt = 0) {
    const known = this.current.get(lower);
    if (!known || issuedAt > known.issuedAt) {
      this.current.set(lower, { sid, issuedAt });
      return true;
    }
    return known.sid === sid;
  }
}
