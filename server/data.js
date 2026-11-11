// The data service sits between the server and the store (Google Sheet or memory).
// It exists because the sheet is slow and can be down:
//  - players are cached once they have been read, so they can keep logging in,
//  - match results are put in a queue and written as soon as the sheet answers,
//  - the leaderboard is cached for 60 seconds.
// The game itself never waits for the sheet.
import { LIMITS } from './config.js';
import { StoreError, STAT_KEYS } from './store/memory.js';

const RETRY_MIN_MS = 2_000;
const RETRY_MAX_MS = 60_000;

export class DataService {
  constructor(store, { now = () => Date.now(), autoRetry = true, log = () => {} } = {}) {
    this.store = store;
    this.now = now;
    this.autoRetry = autoRetry;
    this.log = log;
    this.players = new Map(); // cache: gamertag_lower -> row
    this.queue = []; // results waiting to be written: { match, updates }
    this.flushing = null;
    this.retryMs = RETRY_MIN_MS;
    this.retryTimer = null;
    this.board = null; // { at, rows }
  }

  // Returns the player row or null. Throws StoreError('unavailable') only if the
  // player is not cached and the store cannot be reached.
  async getPlayer(lower) {
    const cached = this.players.get(lower);
    if (cached) return cached;
    const row = await this.store.getPlayer(lower);
    if (row) this.players.set(lower, row);
    return row;
  }

  async createPlayer(player) {
    const row = await this.store.createPlayer(player);
    this.players.set(row.gamertag_lower, row);
    this.board = null;
    return row;
  }

  // Save a finished match. The cache is updated at once (so the results screen is
  // right immediately); the write to the store happens in the background.
  recordMatch(match, updates) {
    for (const u of updates) {
      const row = this.players.get(u.gamertag_lower);
      if (!row) continue;
      for (const key of STAT_KEYS) row[key] += u.deltas[key] || 0;
      for (const a of u.achievements) if (!row.achievements.includes(a)) row.achievements.push(a);
    }
    this.queue.push({ match, updates });
    this.flush().catch(() => {});
  }

  get pending() {
    return this.queue.length;
  }

  // Try to write everything that is waiting. Stops at the first failure and tries again later.
  flush() {
    if (!this.flushing) {
      this.flushing = this.drain().finally(() => {
        this.flushing = null;
      });
    }
    return this.flushing;
  }

  async drain() {
    while (this.queue.length) {
      const job = this.queue[0];
      try {
        await this.store.recordMatch(job.match, job.updates);
      } catch (err) {
        if (err instanceof StoreError && err.code === 'bad_request') {
          this.log(`Result ${job.match.match_id} was refused by the store and is dropped: ${err.message}`);
          this.queue.shift();
          continue;
        }
        this.scheduleRetry();
        return false;
      }
      this.queue.shift();
      this.board = null;
    }
    this.retryMs = RETRY_MIN_MS;
    return true;
  }

  scheduleRetry() {
    if (!this.autoRetry || this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.flush().catch(() => {});
    }, this.retryMs);
    this.retryTimer.unref?.();
    this.retryMs = Math.min(RETRY_MAX_MS, this.retryMs * 2);
  }

  // Top players by points. Results that are still waiting in the queue are added
  // on top of what the store returned, so nobody's points seem to vanish.
  async leaderboard() {
    const now = this.now();
    let stale = false;
    if (!this.board || now - this.board.at >= LIMITS.leaderboardCacheMs) {
      try {
        this.board = { at: now, rows: await this.store.listPlayers() };
      } catch {
        stale = true;
        if (!this.board) {
          this.board = { at: 0, rows: [...this.players.values()].map((r) => ({ gamertag: r.gamertag, matches: r.matches, wins: r.wins, points: r.points, kos: r.kos })), fromCache: true };
        }
      }
    }
    const rows = new Map(this.board.rows.map((r) => [r.gamertag.toLowerCase(), { ...r }]));
    if (!this.board.fromCache) {
      for (const job of this.queue) {
        for (const u of job.updates) {
          const row = rows.get(u.gamertag_lower);
          if (!row) continue;
          for (const key of ['matches', 'wins', 'points', 'kos']) row[key] += u.deltas[key] || 0;
        }
      }
    }
    const players = [...rows.values()]
      .filter((r) => r.matches > 0)
      .sort((a, b) => b.points - a.points || b.wins - a.wins || a.gamertag.localeCompare(b.gamertag))
      .slice(0, LIMITS.leaderboardSize)
      .map((r, i) => ({ rank: i + 1, gamertag: r.gamertag, points: r.points, wins: r.wins, matches: r.matches }));
    return { players, stale };
  }

  stop() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }
}
