// Rooms and the WebSocket relay.
//
// A room connects one host page (the laptop that runs the game) with up to four
// phones. The server does not run the game: it checks who is allowed to do what,
// validates every message and passes it on.
//
//   phone -> server -> host : input, pick, vote
//   host  -> server -> phone: phase, status, feedback
//
// Access control in one sentence: the socket that created a room is its host,
// and only the host can start a match, submit its result or talk to the phones.
import { randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { LIMITS } from './config.js';
import { Bucket } from './security.js';
import { verifyToken } from './accounts.js';
import { isInt, isPlainObject, isRoomCode } from './validate.js';
import { checkResult, scoreResult } from './results.js';
import { isValidMask } from '../src/game/input.js';
import { FIGHTER_IDS } from '../src/game/fighters.js';
import { HAZARD_IDS, STAGE_IDS } from '../src/game/stages.js';

const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // without I and O, which look like 1 and 0
const RELAY_TYPES = ['phase', 'status', 'feedback'];
const PHASE_NAMES = ['lobby', 'match', 'results'];
const FIGHTER_STATES = ['alive', 'dead', 'out'];

// A relayed message may only contain plain data of a sensible size: short text,
// numbers, booleans, and small lists or objects of those, at most three levels deep.
function plainData(value, depth = 0) {
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.length <= 300;
  if (depth >= 3 || typeof value !== 'object') return false;
  if (!Array.isArray(value) && Object.keys(value).some((k) => ['__proto__', 'constructor', 'prototype'].includes(k))) return false;
  const items = Array.isArray(value) ? value : Object.values(value);
  return items.length <= 24 && items.every((v) => plainData(v, depth + 1));
}
const optional = (value, check) => value === undefined || value === null || check(value);
const shortText = (max) => (v) => typeof v === 'string' && v.length <= max;
const colour = (v) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);

const onlyKeys = (object, allowed) => Object.keys(object).every((k) => allowed.includes(k));
const bool = (v) => typeof v === 'boolean';
const listOf = (max, check) => (v) => Array.isArray(v) && v.length <= max && v.every(check);
const named = (ids) => (v) => isPlainObject(v) && onlyKeys(v, ['id', 'name']) && ids.includes(v.id) && shortText(24)(v.name);
const count = (v) => isInt(v, 0, 100000);

// What each screen message may contain. Anything else is refused: a phone must never
// get a value it would choke on (a "lives: 400000000" would make it draw that many hearts).
const PHASE_FIELDS = {
  lobby: (m) => onlyKeys(m, ['t', 'name', 'vote', 'stages']) && optional(m.vote, bool) && optional(m.stages, listOf(4, named(STAGE_IDS))),
  match: (m) => onlyKeys(m, ['t', 'name', 'stage', 'stageName', 'paused', 'lives', 'slots', 'hazards'])
    && optional(m.stage, (v) => STAGE_IDS.includes(v)) && optional(m.stageName, shortText(40)) && optional(m.paused, bool)
    && optional(m.lives, (v) => isInt(v, 1, 3)) && optional(m.slots, listOf(4, (v) => isInt(v, 0, 3))) && optional(m.hazards, listOf(6, named(HAZARD_IDS))),
  results: (m) => onlyKeys(m, ['t', 'name', 'place', 'of', 'won', 'winner', 'stats', 'points', 'total', 'achievements', 'note'])
    && optional(m.place, (v) => isInt(v, 1, 4)) && optional(m.of, (v) => isInt(v, 2, 4)) && optional(m.won, bool) && optional(m.winner, shortText(40))
    && optional(m.stats, (v) => isPlainObject(v) && onlyKeys(v, ['dealt', 'taken', 'kos', 'falls']) && Object.values(v).every(count))
    && optional(m.points, count) && optional(m.total, (v) => isInt(v, 0, 1e9))
    && optional(m.achievements, listOf(8, (v) => isPlainObject(v) && onlyKeys(v, ['name', 'text']) && shortText(40)(v.name) && optional(v.text, shortText(80))))
    && optional(m.note, shortText(160)),
};
const FEEDBACK_KINDS = ['hit', 'special', 'hazard', 'ko', 'out', 'good', 'finalKo', 'hazardWarn', 'hazardCount', 'hazardStart', 'hazardCancel', 'hazardEnd'];
// A vibration pattern like the game's own: a few short pulses, two seconds at most.
const vibration = (v) => Array.isArray(v) && v.length <= 6 && v.every((x) => isInt(x, 0, 1000)) && v.reduce((a, b) => a + b, 0) <= 2000;

// The three kinds of message a host may send to phones, each with its own fields.
// Returns true if the message must not be passed on.
export function relayProblem(m) {
  if (!isPlainObject(m) || !RELAY_TYPES.includes(m.t) || !plainData(m)) return true;
  if (JSON.stringify(m).length > LIMITS.relayBytes[m.t]) return true;
  if (m.t === 'phase') return !(PHASE_NAMES.includes(m.name) && PHASE_FIELDS[m.name](m));
  if (m.t === 'status') {
    return !(onlyKeys(m, ['t', 'pct', 'lives', 'state', 'cd', 'cdMax', 'held', 'tipsy'])
      && isInt(m.pct, 0, 999) && isInt(m.lives, 0, 3) && FIGHTER_STATES.includes(m.state) && isInt(m.cd, 0, 3600) && isInt(m.cdMax, 1, 3600)
      && optional(m.held, shortText(12)) && optional(m.tipsy, bool));
  }
  return !(onlyKeys(m, ['t', 'kind', 'text', 'title', 'name', 'flash', 'n', 'vibrate'])
    && FEEDBACK_KINDS.includes(m.kind) && optional(m.text, shortText(160)) && optional(m.title, shortText(60)) && optional(m.name, shortText(60))
    && optional(m.flash, colour) && optional(m.n, (v) => isInt(v, 0, 9)) && optional(m.vibrate, vibration));
}

export const ERRORS = {
  room_not_found: 'Room not found. Check the code on the big screen.',
  room_full: 'Room full. Four players are already in.',
  room_closed: 'The host closed the room. Ask them to open it again.',
  bad_token: 'Please log in again.',
  signed_out: 'This account was opened on another phone, so this one is signed out.',
  replaced: 'This player was opened in another tab. This one is no longer used.',
  unavailable: "Can't reach the player list right now. Try again in a moment.",
  not_host: 'Only the host screen can do that.',
  not_joined: 'Join a room first.',
  bad_message: 'That message was not understood.',
  busy: 'Too many requests. Wait a moment.',
  no_match: 'No such match, or its result was already saved.',
  bad_start: 'The match cannot start like this.',
  room_gone: 'That room no longer exists.',
};

export class Rooms {
  constructor({ data, sessions, config, limiter, now = () => Date.now(), log = () => {} }) {
    this.data = data;
    this.sessions = sessions;
    this.config = config;
    this.limiter = limiter;
    this.now = now;
    this.log = log;
    this.rooms = new Map(); // code -> room
    this.byGamertag = new Map(); // gamertag_lower -> connection (one phone per account)
    this.connections = new Set();
  }

  // ---- connections ----

  connect(ws, address) {
    const conn = { ws, address, role: null, room: null, slot: -1, lower: null, sid: null, bucket: new Bucket(LIMITS.phoneMessagesPerSecond, this.now()), strikes: 0, joining: false, alive: true, failedJoins: 0, openedAt: this.now() };
    this.connections.add(conn);
    return conn;
  }

  send(conn, message) {
    if (!conn || conn.ws.readyState !== 1) return false;
    // A receiver that has stopped reading would make the server pile messages up in
    // memory without end. Such a connection is cut; a real phone simply reconnects.
    if (conn.ws.bufferedAmount > LIMITS.sendBufferBytes) {
      conn.ws.terminate();
      return false;
    }
    try {
      conn.ws.send(JSON.stringify(message));
      return true;
    } catch {
      return false;
    }
  }

  fail(conn, code, extra = {}) {
    this.send(conn, { t: 'error', code, msg: extra.msg || ERRORS[code] || code, ...extra });
  }

  // A message that breaks the rules is dropped. A socket that keeps doing it is closed.
  strike(conn, code = 'bad_message') {
    conn.strikes += 1;
    if (conn.strikes > LIMITS.maxStrikes) {
      try {
        conn.ws.close(1008, 'too many invalid messages');
      } catch { /* already closed */ }
      return;
    }
    if (conn.strikes <= 20) this.fail(conn, code);
  }

  // Every message from every socket comes through here. Nothing in it is trusted.
  receive(conn, data, isBinary) {
    try {
      if (isBinary) return this.strike(conn);
      const limit = conn.role === 'host' ? LIMITS.hostMessageBytes : LIMITS.phoneMessageBytes;
      if (data.length > limit) return this.strike(conn);
      if (!conn.bucket.take(this.now())) return this.strike(conn, 'busy');
      let msg;
      try {
        msg = JSON.parse(data.toString('utf8'));
      } catch {
        return this.strike(conn);
      }
      if (!isPlainObject(msg) || typeof msg.t !== 'string') return this.strike(conn);
      if (msg.t === 'ping') return this.send(conn, { t: 'pong', n: isInt(msg.n, 0, 1e9) ? msg.n : 0 });
      if (conn.room) conn.room.lastActive = this.now(); // any message keeps the room alive
      const table = conn.role === 'host' ? HOST_HANDLERS : conn.role === 'phone' ? PHONE_HANDLERS : NEW_HANDLERS;
      const handler = Object.hasOwn(table, msg.t) ? table[msg.t] : null;
      if (!handler) {
        const known = Object.hasOwn(HOST_HANDLERS, msg.t) || Object.hasOwn(PHONE_HANDLERS, msg.t) || Object.hasOwn(NEW_HANDLERS, msg.t);
        if (!known) return this.strike(conn);
        // A real message type, but not for this sender: this is the access-control check.
        conn.strikes += 1;
        return this.fail(conn, conn.role === null ? 'not_joined' : 'not_host');
      }
      const done = handler.call(this, conn, msg);
      if (done && typeof done.catch === 'function') done.catch((err) => this.log(`handler ${msg.t} failed: ${err.message}`));
    } catch (err) {
      this.log(`message handling failed: ${err.message}`);
    }
  }

  disconnect(conn) {
    conn.alive = false;
    this.connections.delete(conn);
    const room = conn.room;
    if (!room) return;
    if (conn.role === 'host' && room.host === conn) {
      room.host = null;
      this.toPhones(room, { t: 'host', connected: false });
      room.hostTimer = setTimeout(() => this.destroyRoom(room, 'The host left, so the room was closed.'), LIMITS.hostHoldMs);
      room.hostTimer.unref?.();
    } else if (conn.role === 'phone') {
      const slot = room.slots[conn.slot];
      if (slot && slot.conn === conn) {
        slot.conn = null;
        slot.connected = false;
        if (this.byGamertag.get(slot.lower) === conn) this.byGamertag.delete(slot.lower);
        if (room.phase === 'lobby') this.holdSlot(room, conn.slot);
        this.sendRoster(room);
      }
    }
    conn.room = null;
  }

  // ---- rooms ----

  newCode() {
    for (let tries = 0; tries < 50; tries++) {
      let code = '';
      for (let i = 0; i < 4; i++) code += CODE_LETTERS[randomInt(CODE_LETTERS.length)];
      if (!this.rooms.has(code)) return code;
    }
    return null;
  }

  destroyRoom(room, msg) {
    if (!this.rooms.has(room.code)) return;
    this.rooms.delete(room.code);
    clearTimeout(room.hostTimer);
    for (const slot of room.slots) {
      if (!slot) continue;
      clearTimeout(slot.timer);
      if (slot.conn) {
        this.send(slot.conn, { t: 'closed', msg });
        if (this.byGamertag.get(slot.lower) === slot.conn) this.byGamertag.delete(slot.lower);
        Object.assign(slot.conn, { role: null, room: null, slot: -1, openedAt: this.now() });
      }
    }
    if (room.host) {
      this.send(room.host, { t: 'error', code: 'room_gone', msg: ERRORS.room_gone });
      Object.assign(room.host, { role: null, room: null, openedAt: this.now() });
    }
    room.slots = [null, null, null, null];
  }

  // A phone that dropped in the lobby keeps its slot for 30 seconds.
  holdSlot(room, index) {
    const slot = room.slots[index];
    if (!slot || slot.connected) return;
    if (slot.timer) clearTimeout(slot.timer);
    slot.timer = setTimeout(() => {
      slot.timer = null;
      if (room.slots[index] === slot && !slot.connected && room.phase === 'lobby') {
        room.slots[index] = null;
        this.sendRoster(room);
      }
    }, LIMITS.slotHoldMs);
    slot.timer.unref?.();
  }

  freeSlot(room, index) {
    const slot = room.slots[index];
    if (!slot) return;
    clearTimeout(slot.timer);
    if (slot.conn) {
      if (this.byGamertag.get(slot.lower) === slot.conn) this.byGamertag.delete(slot.lower);
      Object.assign(slot.conn, { role: null, room: null, slot: -1, openedAt: this.now() });
    }
    room.slots[index] = null;
  }

  roster(room) {
    return {
      t: 'roster', code: room.code, closed: room.closed, phase: room.phase,
      players: room.slots.map((s, i) => (s ? { slot: i, gamertag: s.gamertag, connected: s.connected, fighter: s.fighter, ready: s.ready } : null)).filter(Boolean),
    };
  }

  sendRoster(room) {
    this.send(room.host, this.roster(room));
  }

  toPhones(room, message) {
    for (const slot of room.slots) if (slot && slot.conn) this.send(slot.conn, message);
  }

  // Back to the lobby after a match (result saved or match aborted).
  endMatch(room) {
    room.match = null;
    room.phase = 'lobby';
    if (room.phaseAll && room.phaseAll.name === 'match') room.phaseAll = null;
    room.slots.forEach((slot, i) => {
      if (!slot) return;
      slot.ready = false;
      slot.status = null;
      // The phone is told that it is no longer "ready", so its screen cannot disagree with the lobby.
      if (slot.conn) this.send(slot.conn, { t: 'slot', fighter: slot.fighter, ready: false });
      if (slot.left) this.freeSlot(room, i);
      else if (!slot.connected) this.holdSlot(room, i);
    });
    this.sendRoster(room);
  }

  // Called after a login: the same gamertag on an older session is signed out.
  signOutOthers(lower, sid) {
    const conn = this.byGamertag.get(lower);
    if (conn && conn.sid !== sid) this.kick(conn, 'signed_out');
  }

  kick(conn, code) {
    const room = conn.room;
    this.send(conn, { t: 'signed_out', code, msg: ERRORS[code] });
    if (room && conn.role === 'phone') {
      const slot = room.slots[conn.slot];
      if (slot && slot.conn === conn) {
        slot.conn = null;
        slot.connected = false;
        if (room.phase === 'lobby') this.holdSlot(room, conn.slot);
        this.sendRoster(room);
      }
    }
    if (this.byGamertag.get(conn.lower) === conn) this.byGamertag.delete(conn.lower);
    Object.assign(conn, { role: null, room: null, slot: -1, openedAt: this.now() });
    setTimeout(() => {
      if (conn.role !== null) return; // it joined again in the meantime: leave it alone
      try {
        conn.ws.close(4001, 'signed out');
      } catch { /* already closed */ }
    }, 50).unref?.();
  }

  sweep() {
    const now = this.now();
    for (const room of [...this.rooms.values()]) {
      if (now - room.lastActive > LIMITS.roomIdleMs) this.destroyRoom(room, 'The room was closed because nothing happened for a long time.');
    }
    // A connection that never opened or joined a room has no reason to stay.
    for (const conn of this.connections) {
      if (conn.role === null && now - conn.openedAt > LIMITS.idleSocketMs) {
        try {
          conn.ws.close(1008, 'nothing to do');
        } catch { /* already closed */ }
      }
    }
  }

  closeAll() {
    for (const room of [...this.rooms.values()]) this.destroyRoom(room, 'The server is restarting.');
  }
}

// ---- messages from a socket that is neither host nor player yet ----
const NEW_HANDLERS = {
  host_create(conn) {
    if (!this.limiter.allow(`room:${conn.address}`, LIMITS.roomsPerMinutePerAddress, this.now())) return this.fail(conn, 'busy');
    if (this.rooms.size >= LIMITS.maxRooms) return this.fail(conn, 'busy', { msg: 'The server is full. Try again later.' });
    let mine = 0;
    for (const other of this.rooms.values()) if (other.address === conn.address) mine += 1;
    if (mine >= LIMITS.roomsPerAddress) return this.fail(conn, 'busy', { msg: 'Too many rooms are open from this network. Close one first.' });
    const code = this.newCode();
    if (!code) return this.fail(conn, 'busy');
    const room = {
      code, hostKey: randomBytes(24).toString('base64url'), host: conn, hostTimer: null, closed: false, phase: 'lobby',
      slots: [null, null, null, null], match: null, phaseAll: null, lastResult: null, lastActive: this.now(), address: conn.address, banned: new Set(),
    };
    this.rooms.set(code, room);
    Object.assign(conn, { role: 'host', room, bucket: new Bucket(LIMITS.hostMessagesPerSecond, this.now()) });
    this.send(conn, { t: 'room', code, hostKey: room.hostKey, resumed: false });
    this.sendRoster(room);
  },

  // The host page lost its connection (or was reloaded) and takes its room back.
  // The host key was handed out only to the socket that created the room.
  host_resume(conn, msg) {
    const room = isRoomCode(msg.code) ? this.rooms.get(msg.code) : null;
    const key = typeof msg.hostKey === 'string' ? Buffer.from(msg.hostKey) : null;
    const expected = room ? Buffer.from(room.hostKey) : null;
    if (!room || !key || key.length !== expected.length || !timingSafeEqual(key, expected)) return this.fail(conn, 'room_gone');
    if (room.host && room.host !== conn) {
      const old = room.host;
      Object.assign(old, { role: null, room: null });
      try {
        old.ws.close(4002, 'replaced by a newer host connection');
      } catch { /* already closed */ }
    }
    clearTimeout(room.hostTimer);
    room.host = conn;
    room.lastActive = this.now();
    Object.assign(conn, { role: 'host', room, bucket: new Bucket(LIMITS.hostMessagesPerSecond, this.now()) });
    this.send(conn, { t: 'room', code: room.code, hostKey: room.hostKey, resumed: true, phase: room.phase, matchId: room.match ? room.match.id : null });
    this.sendRoster(room);
    if (room.lastResult) this.send(conn, room.lastResult);
    this.toPhones(room, { t: 'host', connected: true });
  },

  async join(conn, msg) {
    if (conn.joining) return;
    // Guessing room codes is slowed down twice: per address, and a socket that keeps
    // failing is closed. The token is checked first, so only a logged-in player ever
    // learns whether a room exists.
    const failed = (code) => {
      conn.failedJoins += 1;
      this.fail(conn, code);
      if (conn.failedJoins >= LIMITS.failedJoinsPerSocket) {
        try {
          conn.ws.close(1008, 'too many failed joins');
        } catch { /* already closed */ }
      }
    };
    if (!this.limiter.allow(`join:${conn.address}`, LIMITS.joinsPerMinutePerAddress, this.now())) return this.fail(conn, 'busy');
    const session = verifyToken(msg.token, this.config.sessionSecret, this.now());
    if (!session) return failed('bad_token');
    const room = isRoomCode(msg.room) ? this.rooms.get(msg.room) : null;
    if (!room) return failed('room_not_found');
    const lower = session.gamertag.toLowerCase();
    if (room.banned.has(lower)) return this.fail(conn, 'room_closed', { msg: 'The host removed you from this room.' });
    if (!this.sessions.accept(lower, session.sid, session.issuedAt)) return this.fail(conn, 'signed_out');
    conn.joining = true;
    let player;
    try {
      player = await this.data.getPlayer(lower);
    } catch {
      conn.joining = false;
      return this.fail(conn, 'unavailable');
    }
    conn.joining = false;
    if (!conn.alive || conn.role !== null) return;
    if (!player) return this.fail(conn, 'bad_token');
    // Somebody may have logged in on another phone while we were waiting for the store.
    if (!this.sessions.accept(lower, session.sid, session.issuedAt)) return this.fail(conn, 'signed_out');
    if (this.rooms.get(room.code) !== room) return this.fail(conn, 'room_not_found');

    let index = room.slots.findIndex((s) => s && s.lower === lower);
    if (index < 0) {
      if (room.closed) return this.fail(conn, 'room_closed');
      // During a match the slots of keyboard players are taken too (the host told us which).
      const reserved = room.match ? room.match.guestSlots : [];
      index = room.slots.findIndex((s, i) => !s && !reserved.includes(i));
      if (index < 0) return this.fail(conn, 'room_full');
    }
    // One phone per account: an older connection of this gamertag is signed out.
    // (The same login opened twice, for example in a second tab, only replaces the older connection.)
    const other = this.byGamertag.get(lower);
    if (other && other !== conn) this.kick(other, other.sid === session.sid ? 'replaced' : 'signed_out');

    let slot = room.slots[index];
    if (!slot) {
      slot = { gamertag: player.gamertag, lower, conn: null, connected: false, fighter: null, ready: false, phase: null, status: null, timer: null, left: false };
      room.slots[index] = slot;
    }
    clearTimeout(slot.timer);
    Object.assign(slot, { conn, connected: true, left: false });
    Object.assign(conn, { role: 'phone', room, slot: index, lower, sid: session.sid });
    this.byGamertag.set(lower, conn);
    room.lastActive = this.now();
    this.send(conn, {
      t: 'joined', room: room.code, slot: index, gamertag: player.gamertag, phase: room.phase, hostConnected: Boolean(room.host),
      fighter: slot.fighter, ready: slot.ready,
      stats: { matches: player.matches, wins: player.wins, points: player.points }, achievements: player.achievements.filter((a) => !a.startsWith('won_')),
    });
    // Catch up a phone that rejoined: the last screen the host set, then its own status.
    const phase = slot.phase || room.phaseAll;
    if (phase) this.send(conn, phase);
    if (slot.status) this.send(conn, slot.status);
    this.sendRoster(room);
  },
};

// ---- messages from a phone that joined a room ----
const PHONE_HANDLERS = {
  input(conn, msg) {
    if (!isValidMask(msg.m) || !isInt(msg.q, 0, 2 ** 31)) return this.strike(conn);
    const room = conn.room;
    if (room.phase === 'match' && room.host) this.send(room.host, { t: 'input', slot: conn.slot, m: msg.m, q: msg.q });
  },

  pick(conn, msg) {
    const room = conn.room;
    const fighter = msg.fighter === null ? null : typeof msg.fighter === 'string' && FIGHTER_IDS.includes(msg.fighter) ? msg.fighter : undefined;
    if (fighter === undefined || typeof msg.ready !== 'boolean') return this.strike(conn);
    if (room.phase !== 'lobby') return this.fail(conn, 'bad_message', { msg: 'You can change your fighter after this match.' });
    const slot = room.slots[conn.slot];
    const ready = Boolean(fighter) && msg.ready;
    if (slot.fighter === fighter && slot.ready === ready) return undefined; // nothing new: nothing to tell the host
    if (!this.limiter.allow(`pick:${room.code}:${conn.slot}`, 120, this.now())) return this.fail(conn, 'busy');
    slot.fighter = fighter;
    slot.ready = ready;
    return this.sendRoster(room);
  },

  vote(conn, msg) {
    const room = conn.room;
    const ok = (msg.kind === 'stage' && STAGE_IDS.includes(msg.value) && room.phase === 'lobby')
      || (msg.kind === 'hazard' && HAZARD_IDS.includes(msg.value) && room.phase === 'match');
    if (!ok) return this.strike(conn);
    this.send(room.host, { t: 'vote', slot: conn.slot, kind: msg.kind, value: msg.value });
  },

  // The player taps "Leave": the slot is free again (after the match, if one is running).
  leave(conn) {
    const room = conn.room;
    const index = conn.slot;
    const slot = room.slots[index];
    if (this.byGamertag.get(conn.lower) === conn) this.byGamertag.delete(conn.lower);
    if (room.phase === 'lobby') {
      this.freeSlot(room, index);
    } else if (slot) {
      Object.assign(slot, { conn: null, connected: false, left: true });
    }
    Object.assign(conn, { role: null, room: null, slot: -1, openedAt: this.now() });
    this.send(conn, { t: 'left' });
    this.sendRoster(room);
  },

  // "Log out": leave the room and make every copy of this player's login token invalid.
  logout(conn) {
    this.sessions.start(conn.lower, this.now());
    PHONE_HANDLERS.leave.call(this, conn);
  },

  // A phone is in one room at a time: it has to leave before it joins another.
  join(conn) {
    this.fail(conn, 'bad_message', { msg: 'You are already in a room.' });
  },
};

// ---- messages from the host page ----
const HOST_HANDLERS = {
  // Pass a message on to one phone or to all of them.
  to(conn, msg) {
    const room = conn.room;
    const inner = msg.msg;
    if (relayProblem(inner) || !(msg.slot === 'all' || isInt(msg.slot, 0, 3))) return this.strike(conn);
    room.lastActive = this.now();
    const targets = msg.slot === 'all' ? room.slots : [room.slots[msg.slot]];
    for (const slot of targets) {
      if (!slot) continue;
      if (inner.t === 'phase') slot.phase = msg.slot === 'all' ? null : inner;
      if (inner.t === 'status') slot.status = inner;
      if (slot.conn) this.send(slot.conn, inner);
    }
    if (inner.t === 'phase' && msg.slot === 'all') room.phaseAll = inner;
  },

  // Close the room so nobody new can join, or open it again.
  room_set(conn, msg) {
    if (typeof msg.closed !== 'boolean') return this.strike(conn);
    conn.room.closed = msg.closed;
    this.sendRoster(conn.room);
  },

  // Remove a player from the room. They cannot come back into this room.
  kick(conn, msg) {
    const room = conn.room;
    if (!isInt(msg.slot, 0, 3)) return this.strike(conn);
    const slot = room.slots[msg.slot];
    if (!slot) return undefined;
    room.banned.add(slot.lower);
    const phone = slot.conn;
    if (room.phase === 'lobby') {
      this.freeSlot(room, msg.slot);
    } else {
      // Mid-match the fighter stays (idle) until the match is over, then the slot is freed.
      if (phone && this.byGamertag.get(slot.lower) === phone) this.byGamertag.delete(slot.lower);
      if (phone) Object.assign(phone, { role: null, room: null, slot: -1, openedAt: this.now() });
      Object.assign(slot, { conn: null, connected: false, left: true });
    }
    if (phone) this.send(phone, { t: 'closed', msg: 'The host removed you from this room.' });
    return this.sendRoster(room);
  },

  match_start(conn, msg) {
    const room = conn.room;
    const refuse = (why) => this.fail(conn, 'bad_start', { msg: why });
    if (room.phase !== 'lobby') return refuse('A match is already running.');
    if (!STAGE_IDS.includes(msg.stage) || !isInt(msg.lives, 1, 3) || !isInt(msg.guests, 0, LIMITS.maxGuests)) return this.strike(conn);
    if (!Array.isArray(msg.slots) || msg.slots.length > 4 || new Set(msg.slots).size !== msg.slots.length || !msg.slots.every((s) => isInt(s, 0, 3))) return this.strike(conn);
    for (const index of msg.slots) {
      const slot = room.slots[index];
      if (!slot) return refuse('A player in the start list is not in the room.');
      if (!slot.fighter || !slot.ready) return refuse(`${slot.gamertag} has not picked a fighter yet.`);
    }
    const total = msg.slots.length + msg.guests;
    if (total < 2) return refuse('At least 2 players are needed.');
    if (total > LIMITS.playersPerRoom) return refuse('At most 4 players can fight.');
    // Optional: which slots the keyboard players sit in, so no phone is given one of them mid-match.
    const guestSlots = msg.guestSlots === undefined ? [] : msg.guestSlots;
    if (!Array.isArray(guestSlots) || guestSlots.length > msg.guests || new Set(guestSlots).size !== guestSlots.length
      || !guestSlots.every((s) => isInt(s, 0, 3) && !room.slots[s])) return this.strike(conn);
    room.lastResult = null;
    room.match = { id: randomUUID(), stage: msg.stage, lives: msg.lives, slots: [...msg.slots], guests: msg.guests, guestSlots: [...guestSlots], startedAt: this.now(), players: new Map(msg.slots.map((i) => [i, room.slots[i].lower])) };
    room.phase = 'match';
    room.lastActive = this.now();
    this.send(conn, { t: 'match_started', matchId: room.match.id });
    this.sendRoster(room);
  },

  async match_result(conn, msg) {
    const room = conn.room;
    const match = room.match;
    if (!match || typeof msg.matchId !== 'string' || msg.matchId !== match.id) return this.fail(conn, 'no_match');
    const checked = checkResult(match, msg.result, this.now());
    if (!checked.ok) return this.fail(conn, 'bad_result', { msg: `Result refused: ${checked.reason}`, matchId: match.id });
    // From here on the match is closed: a second result for the same id is refused.
    this.endMatch(room);
    const roster = new Map();
    for (const [index, lower] of match.players) {
      try {
        const row = await this.data.getPlayer(lower);
        if (row) roster.set(index, row);
      } catch { /* not reachable: this player's numbers cannot be saved */ }
    }
    const scored = scoreResult(match, checked, roster, this.now());
    let stored = false;
    let note = '';
    // Limits that keep the leaderboard and the sheet from being flooded with results.
    const hour = Math.floor(this.now() / 3_600_000);
    const busyPlayer = [...roster.values()].some((row) => !this.limiter.peek(`results:${hour}:${row.gamertag_lower}`, LIMITS.resultsPerHourPerPlayer));
    if (roster.size >= 2 && (busyPlayer || this.data.pending >= LIMITS.maxQueuedResults)) {
      note = busyPlayer ? 'A player has reached the limit of matches per hour, so this one does not count.' : 'Too many results are waiting to be saved. This match does not count.';
      for (const line of scored.lines) Object.assign(line, { totalPoints: (line.totalPoints || 0) - line.points, points: 0, achievements: [] });
    } else if (roster.size >= 2) {
      for (const row of roster.values()) this.limiter.count(`results:${hour}:${row.gamertag_lower}`, this.now());
      this.data.recordMatch(scored.matchRow, scored.updates);
      stored = true;
      await Promise.race([this.data.flush().catch(() => {}), new Promise((r) => setTimeout(r, 2500))]);
      if (this.data.pending > 0) note = 'The scores are still being written to the Google Sheet. Nothing is lost.';
    } else {
      note = 'Practice match: points need at least two logged-in players.';
      for (const line of scored.lines) Object.assign(line, { totalPoints: (line.totalPoints || 0) - line.points, points: 0, achievements: [] });
    }
    // The leaderboard for the results screen comes from what the server already knows:
    // it never waits for the sheet here.
    const board = this.data.leaderboardNow();
    const saved = { t: 'result_saved', matchId: match.id, stored, note, players: scored.lines, leaderboard: board.players, stale: board.stale };
    // Sent to whoever is the host now (the page may have reconnected meanwhile), and kept
    // so a host that reconnects later still gets it.
    if (this.rooms.get(room.code) === room) {
      room.lastResult = saved;
      this.send(room.host, saved);
    }
    // If the write was still on its way, tell the host again once it is done.
    if (stored && note) {
      this.data.flush().then((written) => {
        if (!written || room.lastResult !== saved || this.rooms.get(room.code) !== room) return;
        saved.note = '';
        saved.leaderboard = this.data.leaderboardNow().players;
        this.send(room.host, saved);
      }).catch(() => {});
    }
  },

  match_abort(conn, msg) {
    const room = conn.room;
    if (!room.match || msg.matchId !== room.match.id) return this.fail(conn, 'no_match');
    this.endMatch(room);
  },
};
