// The in-memory store. It has the same interface as the Google Sheet store and
// is used when no sheet is configured, and in every test.
export class StoreError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code; // 'unavailable' | 'duplicate' | 'bad_request'
  }
}

export const emptyStats = () => ({ matches: 0, wins: 0, points: 0, kos: 0, falls: 0, damage_dealt: 0, damage_taken: 0, achievements: [], last_won: false });
// The crown (D-154): a player whose last saved match was a win. Set by every saved match.
export const wonLast = (update) => (update.deltas.wins || 0) > 0;
export const STAT_KEYS = ['matches', 'wins', 'points', 'kos', 'falls', 'damage_dealt', 'damage_taken'];

export class MemoryStore {
  constructor() {
    this.kind = 'memory';
    this.players = new Map(); // gamertag_lower -> row
    this.matches = new Map(); // match_id -> row
    this.failing = false; // tests switch this on to act out an outage
    this.calls = 0;
  }

  check() {
    this.calls += 1;
    if (this.failing) throw new StoreError('unavailable', 'The store is switched off');
  }

  async getPlayer(lower) {
    this.check();
    const row = this.players.get(lower);
    return row ? structuredClone(row) : null;
  }

  async createPlayer({ gamertag, gamertag_lower, salt, pin_hash, created_at }) {
    this.check();
    if (this.players.has(gamertag_lower)) throw new StoreError('duplicate', 'That gamertag is taken');
    const row = { gamertag, gamertag_lower, salt, pin_hash, created_at, ...emptyStats() };
    this.players.set(gamertag_lower, row);
    return structuredClone(row);
  }

  // Appends the match and adds each player's numbers. Saving the same match id twice changes nothing.
  async recordMatch(match, updates) {
    this.check();
    if (this.matches.has(match.match_id)) return { duplicate: true };
    this.matches.set(match.match_id, structuredClone(match));
    for (const u of updates) {
      const row = this.players.get(u.gamertag_lower);
      if (!row) continue;
      for (const key of STAT_KEYS) row[key] += u.deltas[key] || 0;
      for (const a of u.achievements || []) if (!row.achievements.includes(a)) row.achievements.push(a);
      row.last_won = wonLast(u);
    }
    return { duplicate: false };
  }

  async listPlayers() {
    this.check();
    return [...this.players.values()].map((r) => ({ gamertag: r.gamertag, matches: r.matches, wins: r.wins, points: r.points, kos: r.kos }));
  }
}
