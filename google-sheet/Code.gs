/**
 * NOVA Brawl: the Google Sheet side.
 *
 * This script is deployed as a web app (see docs/SETUP_SHEETS.md). Only the game
 * server calls it. Every request must carry the shared secret; the secret is
 * stored in the script properties, never in this file.
 *
 * Request  (POST, JSON):  { secret, action, payload }
 * Response (JSON):        { ok: true, data }  or  { ok: false, error, message }
 *
 * Actions: ping, getPlayer, createPlayer, recordMatch, listPlayers
 */

// last_won (column N, D-154): 1 if the player's last saved match was a win (the crown), else 0.
var PLAYER_COLUMNS = ['gamertag', 'gamertag_lower', 'salt', 'pin_hash', 'created_at', 'matches', 'wins', 'points', 'kos', 'falls', 'damage_dealt', 'damage_taken', 'achievements', 'last_won'];
var MATCH_COLUMNS = ['match_id', 'ended_at', 'stage', 'mode', 'lives', 'duration_s', 'winner', 'players_json'];
var STAT_COLUMNS = ['matches', 'wins', 'points', 'kos', 'falls', 'damage_dealt', 'damage_taken'];
// Columns stored as whole numbers rather than as plain text.
function isNumberColumn(c) {
  return STAT_COLUMNS.indexOf(c) >= 0 || c === 'lives' || c === 'duration_s' || c === 'last_won';
}
var GAMERTAG = /^[A-Za-z0-9_]{3,12}$/;
var HEX = /^[0-9a-f]{16,128}$/;
var ACHIEVEMENT = /^[a-z_]{1,30}$/;
var STAGES = ['campus', 'beach', 'bairro'];
// The winner column holds a gamertag, or one of these when the winner has no account:
// a bot won (D-172), or the winner's row could not be read when the result was saved.
var WINNER_MARKERS = ['(bot)', '(unknown)'];

function doPost(e) {
  try {
    var request = JSON.parse(e.postData.contents);
    var secret = PropertiesService.getScriptProperties().getProperty('SHARED_SECRET');
    if (!secret || !sameText(String(request.secret || ''), secret)) {
      return reply({ ok: false, error: 'forbidden', message: 'Wrong or missing secret.' });
    }
    var payload = request.payload || {};
    switch (request.action) {
      case 'ping': return reply({ ok: true, data: 'pong' });
      case 'getPlayer': return reply({ ok: true, data: getPlayer(payload) });
      case 'listPlayers': return reply({ ok: true, data: listPlayers() });
      case 'createPlayer': return reply(withLock(function () { return createPlayer(payload); }));
      case 'recordMatch': return reply(withLock(function () { return recordMatch(payload); }));
      default: return reply({ ok: false, error: 'bad_request', message: 'Unknown action.' });
    }
  } catch (err) {
    return reply({ ok: false, error: 'server_error', message: String(err && err.message ? err.message : err) });
  }
}

// A visit in the browser shows nothing useful (and nothing secret).
function doGet() {
  return reply({ ok: false, error: 'forbidden', message: 'This web app only answers the NOVA Brawl server.' });
}

function reply(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}

// Compare two strings without stopping at the first difference.
function sameText(a, b) {
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Everything that reads and then writes runs inside this lock, so two requests
// at the same moment cannot both take the same gamertag or lose each other's points.
function withLock(work) {
  var lock = LockService.getScriptLock();
  // Shorter than the server's patience (25 s), so the server always hears how it ended.
  if (!lock.tryLock(6000)) return { ok: false, error: 'busy', message: 'The sheet is busy.' };
  try {
    return work();
  } finally {
    SpreadsheetApp.flush();
    lock.releaseLock();
  }
}

// For reading only: the tab, or null if it does not exist yet. Reads never create
// anything, so they do not need the lock.
function existingTab(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}

// Returns the tab, creating it with its header row the first time.
// Only called from inside withLock (createPlayer, recordMatch) and from setup().
function tab(name, columns) {
  var book = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = book.getSheetByName(name);
  if (!sheet) {
    sheet = book.insertSheet(name);
    sheet.getRange(1, 1, 1, columns.length).setValues([columns]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    // Text columns are stored as plain text, so a value can never be read as a formula, date or number.
    sheet.getRange(1, 1, sheet.getMaxRows(), columns.length).setNumberFormat('@');
    for (var i = 0; i < columns.length; i++) {
      if (isNumberColumn(columns[i])) {
        sheet.getRange(2, i + 1, sheet.getMaxRows() - 1, 1).setNumberFormat('0');
      }
    }
  }
  return sheet;
}

// Add one row at the end. Text cells are formatted as plain text BEFORE the values
// are written, so "=1+1", "1e5" or a date-like string is stored exactly as given.
function appendRecord(sheet, columns, values) {
  var row = sheet.getLastRow() + 1;
  if (row > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), 50);
  var formats = columns.map(function (c) {
    return isNumberColumn(c) ? '0' : '@';
  });
  var range = sheet.getRange(row, 1, 1, columns.length);
  range.setNumberFormats([formats]);
  range.setValues([values]);
}

// Row number (2 or more) of a player, or 0.
function findPlayerRow(sheet, lower) {
  var last = sheet.getLastRow();
  if (last < 2) return 0;
  var values = sheet.getRange(2, 2, last - 1, 1).getValues();
  for (var i = 0; i < values.length; i++) if (String(values[i][0]) === lower) return i + 2;
  return 0;
}

function rowToPlayer(values) {
  var player = {};
  for (var i = 0; i < PLAYER_COLUMNS.length; i++) player[PLAYER_COLUMNS[i]] = values[i];
  for (var j = 0; j < STAT_COLUMNS.length; j++) player[STAT_COLUMNS[j]] = Number(player[STAT_COLUMNS[j]]) || 0;
  player.achievements = String(player.achievements || '').split(',').filter(function (a) { return ACHIEVEMENT.test(a); });
  // An empty cell (a sheet from before the column was added) means no crown.
  player.last_won = Number(player.last_won) === 1;
  return player;
}

function getPlayer(payload) {
  var lower = String(payload.gamertag_lower || '');
  if (!/^[a-z0-9_]{3,12}$/.test(lower)) return null;
  var sheet = existingTab('players');
  if (!sheet) return null;
  var row = findPlayerRow(sheet, lower);
  if (!row) return null;
  return rowToPlayer(sheet.getRange(row, 1, 1, PLAYER_COLUMNS.length).getValues()[0]);
}

function createPlayer(payload) {
  var gamertag = String(payload.gamertag || '');
  var lower = String(payload.gamertag_lower || '');
  var salt = String(payload.salt || '');
  var hash = String(payload.pin_hash || '');
  var created = String(payload.created_at || '');
  // The server already validated all of this. It is checked again here because
  // this script is the last step before the data is written.
  if (!GAMERTAG.test(gamertag) || lower !== gamertag.toLowerCase() || !HEX.test(salt) || !HEX.test(hash) || !/^[0-9T:.Z-]{10,30}$/.test(created)) {
    return { ok: false, error: 'bad_request', message: 'Invalid player data.' };
  }
  var sheet = tab('players', PLAYER_COLUMNS);
  if (findPlayerRow(sheet, lower)) return { ok: false, error: 'duplicate', message: 'That gamertag is taken.' };
  appendRecord(sheet, PLAYER_COLUMNS, [gamertag, lower, salt, hash, created, 0, 0, 0, 0, 0, 0, 0, '', 0]);
  return { ok: true, data: { gamertag: gamertag, gamertag_lower: lower, salt: salt, pin_hash: hash, created_at: created, matches: 0, wins: 0, points: 0, kos: 0, falls: 0, damage_dealt: 0, damage_taken: 0, achievements: [], last_won: false } };
}

function isJsonList(text) {
  try {
    return typeof text === 'string' && Array.isArray(JSON.parse(text));
  } catch (err) {
    return false;
  }
}

function wholeNumber(value, max) {
  return typeof value === 'number' && isFinite(value) && Math.floor(value) === value && value >= 0 && value <= max;
}

function recordMatch(payload) {
  var match = payload.match || {};
  var updates = payload.updates;
  var id = String(match.match_id || '');
  if (!/^[0-9a-f-]{36}$/.test(id) || STAGES.indexOf(match.stage) < 0 || !wholeNumber(match.lives, 3) || match.lives < 1 || !wholeNumber(match.duration_s, 21600) || !isJsonList(match.players_json) ||
      !/^[0-9T:.Z-]{10,30}$/.test(String(match.ended_at || '')) || match.mode !== 'stock' ||
      !(GAMERTAG.test(String(match.winner)) || WINNER_MARKERS.indexOf(match.winner) >= 0) ||
      typeof match.players_json !== 'string' || match.players_json.length > 2000 || match.players_json.charAt(0) !== '[' ||
      !Array.isArray(updates) || updates.length < 2 || updates.length > 4) {
    return { ok: false, error: 'bad_request', message: 'Invalid match data.' };
  }
  for (var u = 0; u < updates.length; u++) {
    var d = updates[u].deltas || {};
    var achievements = updates[u].achievements || [];
    if (!GAMERTAG.test(String(updates[u].gamertag_lower || '')) || d.matches !== 1 || !wholeNumber(d.wins, 1) || !wholeNumber(d.points, 10200) ||
        !wholeNumber(d.kos, 9) || !wholeNumber(d.falls, 3) || !wholeNumber(d.damage_dealt, 100000) || !wholeNumber(d.damage_taken, 100000) ||
        !Array.isArray(achievements) || achievements.length > 20 || !achievements.every(function (a) { return ACHIEVEMENT.test(String(a)); })) {
      return { ok: false, error: 'bad_request', message: 'Invalid player update.' };
    }
  }

  // One result per match id: a repeated request (a retry) changes nothing.
  var matches = tab('matches', MATCH_COLUMNS);
  var lastMatch = matches.getLastRow();
  if (lastMatch >= 2) {
    var ids = matches.getRange(2, 1, lastMatch - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === id) return { ok: true, data: { duplicate: true } };
  }

  // The match row is written first. It is what marks a match as saved, so if anything
  // fails after this line a retry adds nothing twice.
  appendRecord(matches, MATCH_COLUMNS, [id, String(match.ended_at), match.stage, match.mode, match.lives, match.duration_s, String(match.winner), match.players_json]);

  var players = tab('players', PLAYER_COLUMNS);
  for (var k = 0; k < updates.length; k++) {
    var row = findPlayerRow(players, String(updates[k].gamertag_lower));
    if (!row) continue;
    var range = players.getRange(row, 1, 1, PLAYER_COLUMNS.length);
    var player = rowToPlayer(range.getValues()[0]);
    var deltas = updates[k].deltas;
    for (var s = 0; s < STAT_COLUMNS.length; s++) player[STAT_COLUMNS[s]] += deltas[STAT_COLUMNS[s]] || 0;
    var list = player.achievements;
    (updates[k].achievements || []).forEach(function (a) { if (list.indexOf(a) < 0) list.push(a); });
    // Only the number columns and the achievements are written back: name, salt and hash are never touched.
    players.getRange(row, 6, 1, 7).setValues([STAT_COLUMNS.map(function (c) { return player[c]; })]);
    players.getRange(row, 13).setValue(list.join(','));
    // The crown: whoever won this match wears it, everyone else in it loses theirs.
    players.getRange(row, 14).setNumberFormat('0').setValue(deltas.wins === 1 ? 1 : 0);
  }
  return { ok: true, data: { duplicate: false } };
}

// The numbers the leaderboard needs. Salts and PIN hashes never leave the sheet this way.
function listPlayers() {
  var sheet = existingTab('players');
  if (!sheet) return [];
  var last = sheet.getLastRow();
  if (last < 2) return [];
  var rows = sheet.getRange(2, 1, last - 1, PLAYER_COLUMNS.length).getValues();
  return rows.map(function (values) {
    var p = rowToPlayer(values);
    return { gamertag: String(p.gamertag), matches: p.matches, wins: p.wins, points: p.points, kos: p.kos };
  }).filter(function (p) { return GAMERTAG.test(p.gamertag); });
}

/** Run this once from the editor (Run > setup) to create both tabs with their headers. */
function setup() {
  withLock(function () {
    tab('players', PLAYER_COLUMNS);
    tab('matches', MATCH_COLUMNS);
    return { ok: true };
  });
}
