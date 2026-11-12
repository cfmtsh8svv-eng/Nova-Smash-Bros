// Server settings: limits that protect the server, and the values read from the environment.
// Secrets are only ever read here, from environment variables. None are in the repository.
import { randomBytes } from 'node:crypto';

export const LIMITS = {
  httpBodyBytes: 1024, // the largest JSON body the API accepts
  phoneMessageBytes: 512, // the largest WebSocket message from a phone
  hostMessageBytes: 4096, // ... and from the host page (a result for four players is about 1 KB)
  relayBytes: { phase: 2048, status: 240, feedback: 480 }, // what the host may pass on to a phone
  sendBufferBytes: 512 * 1024, // a receiver that stops reading is cut off at this backlog
  phoneMessagesPerSecond: 80,
  hostMessagesPerSecond: 200,
  maxStrikes: 200, // dropped messages before a socket is closed
  maxRooms: 200,
  roomsPerAddress: 12, // open at the same time (a lecture hall can share one address)
  roomsPerMinutePerAddress: 10,
  socketsPerAddress: 400,
  maxSockets: 3000,
  idleSocketMs: 60_000, // a connection that never opens or joins a room is closed
  failedJoinsPerMinutePerAddress: 40, // stops guessing room codes; joins that succeed do not count
  failedJoinsPerSocket: 10,
  registrationsPerMinutePerAddress: 40,
  resultsPerHourPerPlayer: 120, // more than that in an hour no longer counts for the leaderboard
  maxQueuedResults: 200,
  // A whole lecture hall can share one address (campus Wi-Fi), so these are roomy.
  // Guessing PINs is stopped by the lock on the gamertag, not by this.
  authPerMinutePerAddress: 120,
  apiPerMinutePerAddress: 600,
  playersPerRoom: 4,
  slotHoldMs: 30_000, // a dropped phone keeps its slot this long in the lobby
  hostQuietMs: 5_000, // a host page that said nothing for this long (it pings every second) counts as offline for the phones
  hostHoldMs: 60_000, // a room without its host page lives this long
  roomIdleMs: 3 * 60 * 60 * 1000,
  loginMaxFails: 5,
  loginWindowMs: 10 * 60 * 1000,
  loginLockMs: 10 * 60 * 1000,
  loginMaxFailsPerDay: 20, // on top of the rule above: at most 20 wrong PINs per gamertag in 24 hours
  loginDayMs: 24 * 60 * 60 * 1000,
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
    if (sheetsSecret.length < 16) throw new Error('SHEETS_SHARED_SECRET must be at least 16 characters.');
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
    // 'cloudflare' (or '1'): behind Render, whose front door sets CF-Connecting-IP itself.
    trustProxy: ['1', 'cloudflare'].includes((env.TRUST_PROXY || '').trim().toLowerCase()),
    host: (env.HOST || '').trim() || undefined, // for example 127.0.0.1 behind Tailscale Funnel
    useSheets, sheetsUrl, sheetsSecret, pinPepper, sessionSecret, warnings,
  };
}
