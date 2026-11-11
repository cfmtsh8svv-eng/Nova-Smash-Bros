// The Google Sheet store: every call is one HTTPS request to the Apps Script
// web app in apps-script/Code.gs, which reads and writes the sheet.
// The shared secret proves to the script that the request comes from our server.
import { StoreError } from './memory.js';

const TIMEOUT_MS = 10_000;

export class SheetsStore {
  constructor({ url, secret, fetchImpl = fetch }) {
    this.kind = 'sheets';
    this.url = url;
    this.secret = secret;
    this.fetch = fetchImpl;
  }

  async call(action, payload = {}) {
    let response;
    try {
      response = await this.fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: this.secret, action, payload }),
        redirect: 'follow', // Apps Script answers through a redirect
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      throw new StoreError('unavailable', `Google Sheet not reachable: ${err.name}`);
    }
    if (!response.ok) throw new StoreError('unavailable', `Google Sheet answered with status ${response.status}`);
    let body;
    try {
      body = await response.json();
    } catch {
      throw new StoreError('unavailable', 'Google Sheet sent an answer that is not JSON');
    }
    if (!body || body.ok !== true) {
      const code = body && body.error === 'duplicate' ? 'duplicate' : body && body.error === 'bad_request' ? 'bad_request' : 'unavailable';
      throw new StoreError(code, (body && body.message) || 'The Google Sheet refused the request');
    }
    return body.data;
  }

  async getPlayer(lower) {
    const row = await this.call('getPlayer', { gamertag_lower: lower });
    return row ? normalise(row) : null;
  }

  async createPlayer(player) {
    return normalise(await this.call('createPlayer', player));
  }

  async recordMatch(match, updates) {
    return this.call('recordMatch', { match, updates });
  }

  async listPlayers() {
    const rows = await this.call('listPlayers');
    return Array.isArray(rows) ? rows.map((r) => ({ gamertag: String(r.gamertag), matches: num(r.matches), wins: num(r.wins), points: num(r.points), kos: num(r.kos) })) : [];
  }
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// Never trust the shape of what comes back from the sheet: someone may have edited a cell by hand.
function normalise(row) {
  let achievements = row.achievements;
  if (typeof achievements === 'string') achievements = achievements.split(',').map((s) => s.trim()).filter(Boolean);
  if (!Array.isArray(achievements)) achievements = [];
  return {
    gamertag: String(row.gamertag), gamertag_lower: String(row.gamertag_lower), salt: String(row.salt), pin_hash: String(row.pin_hash),
    created_at: String(row.created_at || ''),
    matches: num(row.matches), wins: num(row.wins), points: num(row.points), kos: num(row.kos), falls: num(row.falls),
    damage_dealt: num(row.damage_dealt), damage_taken: num(row.damage_taken),
    achievements: achievements.filter((a) => /^[a-z_]{1,30}$/.test(a)),
  };
}
