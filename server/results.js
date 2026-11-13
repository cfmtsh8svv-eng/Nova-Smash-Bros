// Match results: plausibility checks, points and achievements.
//
// The match is simulated in the host page, so the server cannot know what really
// happened. It checks that a result is possible at all (who played, how long,
// how much damage) and refuses anything that is not. This is a known limit and
// is explained in docs/WALKTHROUGH.md.
import { matchPoints } from '../src/game/scoring.js';
import { STAGE_IDS } from '../src/game/stages.js';
import { FIGHTER_IDS } from '../src/game/fighters.js';
import { isInt, isPlainObject } from './validate.js';
import { demoMatchSettings } from '../src/game/config.js';

export const ACHIEVEMENTS = [
  { id: 'first_win', name: 'First Win', text: 'Win a match.' },
  { id: 'hat_trick', name: 'Hat-Trick', text: 'Win 3 matches.' },
  { id: 'heavy_hitter', name: 'Heavy Hitter', text: 'Deal 1,000 % damage in total.' },
  { id: 'untouchable', name: 'Untouchable', text: 'Win without losing a life.' },
  { id: 'comeback', name: 'Comeback', text: 'Win on your last life above 150 %.' },
  { id: 'globetrotter', name: 'Globetrotter', text: 'Win on all three stages.' },
  { id: 'regular', name: 'Regular', text: 'Play 10 matches.' },
  { id: 'special_delivery', name: 'Special Delivery', text: 'KO someone with a special.' },
];
export const ACHIEVEMENT_IDS = ACHIEVEMENTS.map((a) => a.id);
const BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));
export const achievementName = (id) => BY_ID.get(id)?.name || id;
// Hidden notes kept next to the achievements: which stages a player has won on.
const wonMarker = (stage) => `won_${stage}`;

const MAX_DURATION_S = 6 * 60 * 60;
const COUNTDOWN_S = 3;
const RESPAWN_S = 2;
const MAX_DAMAGE_PER_SECOND = 80; // far above what one fighter can deal, even hitting three opponents // there is no time limit; this only stops absurd numbers
// A demo match (docs/DEMO.md) ends at its time cap. The duration is rounded to whole seconds,
// so it may come out a little above the cap; anything beyond this margin is refused.
const DEMO_CAP_MARGIN_S = 2;

// Check a result the host sent against what the server knows about the match.
// match: { id, stage, lives, slots: [..] (humans), bots: [{ slot, name, fighter }], startedAt, demo? }
// Only a match started with demo: true may end by the time cap (byTimeCap: true).
// A bot's line is checked like any other; its fighter must be the one it started with.
// Returns { ok: true, players } with cleaned numbers, or { ok: false, reason }.
export function checkResult(match, result, now) {
  const bad = (reason) => ({ ok: false, reason });
  if (!isPlainObject(result)) return bad('The result is not an object.');
  if (result.stage !== match.stage || !STAGE_IDS.includes(result.stage)) return bad('The stage does not match the match that was started.');
  if (result.lives !== match.lives) return bad('The lives do not match the match that was started.');
  const capS = match.demo ? demoMatchSettings().timeCapS : 0;
  if (result.byTimeCap !== undefined && typeof result.byTimeCap !== 'boolean') return bad('The end of the match is malformed.');
  const byCap = result.byTimeCap === true;
  if (byCap && !capS) return bad('This build has no time limit.');
  if (!isInt(result.durationS, 1, MAX_DURATION_S)) return bad('The duration is not plausible.');
  if (capS && result.durationS > capS + DEMO_CAP_MARGIN_S) return bad('A demo match cannot last longer than its time limit.');
  if (byCap && result.durationS < capS - DEMO_CAP_MARGIN_S) return bad('The match ended at the time limit before the time was up.');
  // Time: the countdown alone takes 3 s, so a match cannot have lasted longer than the
  // time since it started minus that; and a player who lost several lives needed
  // 2 s to come back each time.
  const elapsedS = (now - match.startedAt) / 1000;
  if (result.durationS > elapsedS - COUNTDOWN_S + 1.5) return bad('The match cannot have lasted longer than the time since it started.');
  if (result.durationS < RESPAWN_S * (match.lives - 1)) return bad('The match is too short for the lives that were lost.');

  const bots = match.bots || [];
  const allSlots = [...match.slots, ...bots.map((b) => b.slot)];
  const n = allSlots.length;
  if (!Array.isArray(result.players) || result.players.length !== n) return bad('The player list does not match the players who started.');
  const seen = new Set();
  const players = [];
  for (const p of result.players) {
    if (!isPlainObject(p) || !isInt(p.slot, 0, 3) || seen.has(p.slot)) return bad('The player list is malformed.');
    seen.add(p.slot);
    if (!isInt(p.place, 1, n)) return bad('A place is out of range.');
    if (!isInt(p.falls, 0, match.lives) || !isInt(p.kos, 0, match.lives * (n - 1)) || !isInt(p.specialKos, 0, p.kos)) return bad('KOs or falls are out of range.');
    if (!isInt(p.endLives, 0, match.lives) || p.endLives !== match.lives - p.falls) return bad('Lives left do not fit the falls.');
    if (!isInt(p.damageDealt, 0, 100000) || !isInt(p.damageTaken, 0, 100000) || !isInt(p.endPercent, 0, 260)) return bad('Damage is out of range.');
    // Per life at most 200 % plus the last hit; a Pastel de Nata heals 20 % and can come about
    // every 6 s, so up to 4 % a second can be healed and taken again (D-142).
    if (p.damageTaken > match.lives * 240 + result.durationS * 4) return bad('More damage taken than is possible.');
    if (typeof p.fighterId !== 'string' || !FIGHTER_IDS.includes(p.fighterId)) return bad('Unknown fighter.');
    const bot = bots.find((b) => b.slot === p.slot);
    if (bot && p.fighterId !== bot.fighter) return bad('A bot played another fighter than it started with.');
    players.push({ slot: p.slot, place: p.place, falls: p.falls, kos: p.kos, specialKos: p.specialKos, endLives: p.endLives, endPercent: p.endPercent, damageDealt: p.damageDealt, damageTaken: p.damageTaken, fighterId: p.fighterId });
  }
  for (const slot of allSlots) if (!seen.has(slot)) return bad('A player who started the match is missing from the result.');
  if (new Set(players.map((p) => p.place)).size !== n) return bad('Two players share a place.');

  const winner = players.find((p) => p.place === 1);
  if (result.winner !== winner.slot) return bad('The winner does not match the places.');
  if (winner.endLives < 1) return bad('The winner has no life left.');
  if (byCap) {
    // At the cap several players may still be in the match; all of them place above those who are out.
    const still = players.filter((p) => p.endLives > 0);
    if (still.some((p) => p.place > still.length)) return bad('A player who was out places above one still in the match.');
    // ... and more lives left always places higher (the first rule of the cap).
    const byPlace = [...still].sort((a, b) => a.place - b.place);
    if (byPlace.some((p, i) => i > 0 && p.endLives > byPlace[i - 1].endLives)) return bad('At the time limit more lives left must place higher.');
  } else if (players.some((p) => p !== winner && p.endLives !== 0)) return bad('The match can only end when one player is left.');

  const sum = (key) => players.reduce((total, p) => total + p[key], 0);
  if (sum('kos') > sum('falls')) return bad('More KOs than falls.');
  if (sum('damageDealt') > sum('damageTaken') + n) return bad('More damage dealt than taken.');
  for (const p of players) {
    if (p.damageDealt > sum('damageTaken') - p.damageTaken + n) return bad('A player dealt more damage than the others took.');
    if (p.kos > sum('falls') - p.falls) return bad('A player has more KOs than the others have falls.');
    if (p.endPercent > p.damageTaken + 1) return bad('A player ends with more damage than they took.');
    if (p.damageDealt > 100 + result.durationS * MAX_DAMAGE_PER_SECOND) return bad('Too much damage by one player for such a short match.');
  }
  if (sum('damageTaken') > 60 + result.durationS * 60 * n) return bad('Too much damage for such a short match.');
  return { ok: true, players, durationS: result.durationS };
}

// Which achievements a player earns with this match.
// before: the player's totals and achievements before the match; p: their line of the result.
export function newAchievements(before, p, stage) {
  const have = new Set(before.achievements);
  const earned = [];
  const add = (id) => {
    if (!have.has(id)) {
      have.add(id);
      earned.push(id);
    }
  };
  const won = p.place === 1;
  const wins = before.wins + (won ? 1 : 0);
  if (wins >= 1) add('first_win');
  if (wins >= 3) add('hat_trick');
  if (before.damage_dealt + p.damageDealt >= 1000) add('heavy_hitter');
  if (won && p.falls === 0) add('untouchable');
  if (won && p.endLives === 1 && p.endPercent > 150) add('comeback');
  if (before.matches + 1 >= 10) add('regular');
  if (p.specialKos > 0) add('special_delivery');
  if (won) {
    add(wonMarker(stage));
    if (STAGE_IDS.every((s) => have.has(wonMarker(s)))) add('globetrotter');
  }
  return earned;
}

// Turn a checked result into what gets stored. roster maps slot -> player row (accounts only).
export function scoreResult(match, checked, roster, endedAt) {
  const updates = [];
  const lines = [];
  const bots = new Map((match.bots || []).map((b) => [b.slot, b]));
  for (const p of checked.players) {
    // A bot has no account: no points, no achievements, never in the sheet (D-161).
    if (bots.has(p.slot)) {
      lines.push({ slot: p.slot, bot: true, name: bots.get(p.slot).name, place: p.place, points: 0, achievements: [] });
      continue;
    }
    const row = roster.get(p.slot);
    if (!row) {
      // The account could not be read (the sheet is down): this player's numbers are not saved.
      lines.push({ slot: p.slot, unsaved: true, place: p.place, points: 0, achievements: [] });
      continue;
    }
    const points = matchPoints(p.place, p.damageDealt);
    const achievements = newAchievements(row, p, match.stage);
    updates.push({
      gamertag_lower: row.gamertag_lower,
      deltas: { matches: 1, wins: p.place === 1 ? 1 : 0, points, kos: p.kos, falls: p.falls, damage_dealt: p.damageDealt, damage_taken: p.damageTaken },
      achievements,
    });
    lines.push({
      slot: p.slot, gamertag: row.gamertag, place: p.place, points, totalPoints: row.points + points,
      achievements: achievements.filter((id) => BY_ID.has(id)).map((id) => ({ id, name: BY_ID.get(id).name, text: BY_ID.get(id).text })),
    });
  }
  const winnerLine = checked.players.find((p) => p.place === 1);
  const winnerRow = roster.get(winnerLine.slot);
  const matchRow = {
    match_id: match.id,
    ended_at: new Date(endedAt).toISOString(),
    stage: match.stage,
    mode: 'stock',
    lives: match.lives,
    duration_s: checked.durationS,
    // A bot that won is written as "(bot)"; the humans keep their place among all fighters.
    winner: winnerRow ? winnerRow.gamertag : bots.has(winnerLine.slot) ? '(bot)' : '(unknown)',
    players_json: JSON.stringify(checked.players.filter((p) => !bots.has(p.slot)).map((p) => ({
      gamertag: roster.get(p.slot)?.gamertag || '(unknown)', fighter: p.fighterId, place: p.place, kos: p.kos, falls: p.falls,
      damage_dealt: p.damageDealt, damage_taken: p.damageTaken,
    }))),
  };
  return { matchRow, updates, lines };
}
