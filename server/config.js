// Server settings: limits that protect the server, and the values read from the environment.
// Secrets are only ever read here, from environment variables. None are in the repository.
import { randomBytes } from 'node:crypto';

export const LIMITS = {
  httpBodyBytes: 1024, // the largest JSON body the API accepts
  phoneMessageBytes: 512, // the largest WebSocket message from a phone
  hostMessageBytes: 16 * 1024, // ... and from the host page (results are bigger)
  phoneMessagesPerSecond: 80,
  hostMessagesPerSecond: 600,
  maxStrikes: 200, // dropped messages before a socket is closed
  maxRooms: 200,
  roomsPerMinutePerAddress: 10,
  authPerMinutePerAddress: 30,
  apiPerMinutePerAddress: 240,
  playersPerRoom: 4,
  maxGuests: 2, // keyboard players on the host page
  slotHoldMs: 30_000, // a dropped phone keeps its slot this long in the lobby
  hostHoldMs: 60_000, // a room without its host page lives this long
  roomIdleMs: 3 * 60 * 60 * 1000,
  loginMaxFails: 5,
  loginWindowMs: 10 * 60 * 1000,
  loginLockMs: 10 * 60 * 1000,
  sessionMs: 30 * 24 * 60 * 60 * 1000, // session tokens expire after 30 days
  leaderboardCacheMs: 60_000,
  leaderboardSize: 10,
  socketPingMs: 15_000,
};

// Reads the configuration. Without the sheet variables the server uses the
// in-memory store, so it always starts and is fully playable for development.
export function readConfig(env = process.env) {
  const sheetsUrl = (env.SHEETS_WEBAPP_URL || '').trim();
  const sheetsSecret = (env.SHEETS_SHARED_SECRET || '').trim();
  const useSheets = Boolean(sheetsUrl && sheetsSecret);
  let pinPepper = (env.PIN_PEPPER || '').trim();
  let sessionSecret = (env.SESSION_SECRET || '').trim();
  const warnings = [];
  if (Boolean(sheetsUrl) !== Boolean(sheetsSecret)) {
    throw new Error('Set both SHEETS_WEBAPP_URL and SHEETS_SHARED_SECRET, or neither.');
  }
  if (useSheets) {
    if (!/^https:\/\//.test(sheetsUrl)) throw new Error('SHEETS_WEBAPP_URL must start with https://');
    // With a real sheet the pepper must be stable, or nobody could log in after a restart.
    if (pinPepper.length < 16) throw new Error('PIN_PEPPER must be set (at least 16 characters) when the Google Sheet is used.');
    if (sessionSecret.length < 16) throw new Error('SESSION_SECRET must be set (at least 16 characters) when the Google Sheet is used.');
  } else {
    warnings.push('No Google Sheet configured: using the in-memory store. Accounts and scores are lost on restart.');
    if (!pinPepper) pinPepper = randomBytes(32).toString('hex');
    if (!sessionSecret) {
      sessionSecret = randomBytes(32).toString('hex');
      warnings.push('SESSION_SECRET is not set: sessions end when the server restarts.');
    }
  }
  return {
    port: Number(env.PORT) || 3000,
    trustProxy: env.TRUST_PROXY === '1',
    useSheets, sheetsUrl, sheetsSecret, pinPepper, sessionSecret, warnings,
  };
}
