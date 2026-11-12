# NOVA Brawl: Build Prompt, round 4 part 2 (bot levels)

Paste everything below the line into a fresh Claude Code session (local or cloud) started in the root of this repository, on the branch `build_v4`, which holds this file. The bots of round 4 are already built on `build_v4`. The spec and the decisions for this part are already written: GAME_SPEC §5a and DECISIONS D-175 to D-178 (and O-13 for the God level, which is **not** part of this build).

---

Add the bot levels Easy and Hard to NOVA Brawl as described below, in this one session.

**Git rules for this session.** Work and commit on the branch `build_v4` and push only `build_v4`. Never push to `main`, never merge into `main`, never force-push, never enable auto-merge. Commit with the git identity configured for this repository (author Bastian Volkery); if the configured identity is anything else, set the repository's `user.name` and `user.email` to the ones of the existing commits by Bastian Volkery before the first commit. Add no `Co-Authored-By` lines and no "Generated with" or other attribution to commits, to the pull request or to its description; if a tool adds such a line, remove it. Work through to the end without stopping to ask questions. Where something is open, pick what fits the spec best, add a row to `docs/DECISIONS.md` (continue after D-178, status "Decided, team to confirm") and carry on.

## Read first

1. `AGENTS.md`: commands and repository rules. They apply in full. The spec for this part is **already** in `docs/GAME_SPEC.md` (§5a, and the lobby line in §10) and in `docs/DECISIONS.md` (D-175 to D-178; D-156 to D-174 for the bots as they are). Build to it. If you have to change a rule, change the spec and the decisions first, then the tests, then the code, and say so in the commit message.
2. `docs/WALKTHROUGH.md`, section "Bots (`src/game/bot.js`)", and the bot rows in the server and host page sections.
3. `src/game/bot.js` and `bots.medium` in `src/game/config.js`, `tests/game/bot.test.js` and `tests/helpers/bots.js` (the scripted simple human), `server/rooms.js` (the `bots` message, `placeBots`, `settleBots`, the roster), `tests/server/bots.test.js`, `public/host/main.js` (bot cards, `addBot`, `removeBot`, `cycleBot`, `beginMatch`), `public/host/game.js` (`createBot` in `start`), `tests/browser/bots.test.js`.

Keep the existing quality bar: the game runs in a live demo on real iPhones and Android phones. No inline scripts or styles (CSP). Player-facing text in English. `npm test`, `npm run test:browser` and `npm audit --audit-level=high` must be green at the end. No new dependencies.

Work in small commits, one topic each, in the order below.

## 1. The numbers (`src/game/config.js`)

- Add `bots.easy` and `bots.hard` with **exactly the keys** of `bots.medium` (D-176). No new code paths in `bot.js`: the levels differ only in their numbers. Leave `bots.medium` as it is (D-167).
- Every level keeps the human limits (D-163, D-176): `reactionFrames` at least 6, `pressHold` 2 and `pressGap` 8 for all levels, and no level reads anything a player cannot see.
- Starting points (tune from there): Easy about `reactionFrames` 20, `aimError` 45, `attackChance` 0.08, `specialChance` 0.01, `stompChance` 0.02, `hesitateChance` 0.03, `hesitateFrames` 30, `climbDelay` 20. Hard about `reactionFrames` 7, `aimError` 10, `attackChance` 0.35, `specialChance` 0.04, `stompChance` 0.06, `hesitateChance` 0.003, `hesitateFrames` 12, `climbDelay` 8.
- `createBot` already takes `level`; make an unknown level fall back to medium (it does today) and export the list of levels in order (`BOT_LEVELS` = `['easy', 'medium', 'hard']`) so the server and the host page use the same list.

## 2. Bot tests (`tests/game/bot.test.js`)

Keep every existing test. Add, for **each** level (Easy, Medium, Hard):

- Alone on each stage, the bot does not fall off by itself in 60 s (the existing test, run per level).
- Recovery from beside the main ground, below its level, on each stage.
- It beats a standing opponent (1 life) on each stage: within 30 s for Medium and Hard, within 60 s for Easy.
- Two bots of that level, 1 life, items and hazards on, end the match within 3 minutes on each stage (Easy: 4 minutes).
- The reaction delay test with that level's `reactionFrames`.
- The numbers: every level has the keys of `bots.medium`, `reactionFrames` ≥ 6, `pressHold` 2, `pressGap` 8.
- **Tuning** (D-176): the scripted simple human of `tests/helpers/bots.js`, on the same seeds for all three levels (15 matches, 2 lives, items and hazards on), wins at least 11 against Easy, between 3 and 13 against Medium (as now), and between 1 and 8 against Hard, and it wins strictly more often against Easy than against Medium, and against Medium than against Hard.

Keep the whole file under about 15 s.

## 3. Server

As in D-178:

- The `bots` message becomes `{ t: 'bots', bots: [{ fighter, level }, ...] }`: at most 3 entries, `fighter` a valid fighter id, `level` one of the bot levels, no other field in the message or in an entry. A malformed message is a strike, as before; the old `fighters` field is now a malformed message. Wrong phase or too many bots for the humans: refused with `bad_bots`, as before. The bench rules of D-170 stay the same (the same length changes fighters or levels and keeps the bench; a shorter list empties it).
- The room's bot list keeps each bot's level, also on the bench. The roster, `match_started`, `room.match.bots` and the `room` message after a host reconnect carry `level` for each bot.
- Results and the sheet do not change. A bot's level is not part of a result.

Server tests (`tests/server/bots.test.js`): adapt the existing tests to the new message, and add: a level is set and comes back in the roster; a bad level, a missing level, an extra field in an entry and the old `fighters` form are strikes; a benched bot keeps its level when it comes back; `match_started` carries the levels.

## 4. Host page

- A new bot starts on **Medium** (D-177).
- The bot card gets a level row under the fighter name: **◀ Medium ▶**. ◀ goes one level down, ▶ one level up; at Easy the ◀ is disabled, at Hard the ▶ (no wrap-around). The arrows are real `<button>`s with an `aria-label` ("Freshman: easier", "Freshman: harder"); a click on them changes only the level and must not reach the card's own click (which still cycles the fighter). The card itself can no longer be a `<button>` if it holds buttons: make it an element that reacts to a click and to Enter and Space, with `role="button"` and `tabindex="0"`, so the fighter still cycles with the keyboard.
- Every change sends the full `bots` list with fighters and levels.
- `game.start` creates each bot with its own level (`createBot({ slot, level, seed })`).
- The level is shown **only in the lobby** (D-175): nothing changes on the name pill, HUD card, podium, stat card or phones.
- Check the card at the real lobby size: the name pill, the BOT tag, the fighter name and the level row must all be readable and nothing may be cut off, for every fighter name and every bot name.

## 5. Browser test

Extend `tests/browser/bots.test.js`: the host adds a bot, it shows "Medium"; ▶ makes it "Hard" and the ▶ is then disabled; ◀ twice makes it "Easy" and the ◀ is then disabled; a click on an arrow does not change the fighter; the match starts and the bot in `window.novaBrawl.state` was created with the level that was chosen (expose what you need through `window.novaBrawl`, read-only); back in the lobby the level is still the chosen one. The existing browser runs must still pass.

## 6. Docs

- `docs/WALKTHROUGH.md`: the levels in the bots section (the three number sets, how to tune each, the human limits every level keeps), the new `bots` message in the message table and the server's bot paragraph, the level arrows in the lobby paragraph, the tests.
- `README.md`: the levels in "How to play" (one short sentence).
- `docs/DECISIONS.md`: every detail you had to choose, as new rows after D-178, and the numbers you settled on for Easy and Hard with how the simple human did against each (like D-167 for Medium).
- `docs/GAME_SPEC.md` only if a rule had to change (say so in the commit).

## Tuning

Use the scripted simple human (`simpleHuman` in `tests/helpers/bots.js`) on a larger set of seeds than the test (for example 20 per stage) to settle the numbers: it should win about 85 to 90 % against Easy and about 25 to 35 % against Hard (D-176), with Medium unchanged at about 63 %. Watch that Easy still recovers and does not fall off by itself, and that Hard still looks like a person: no reaction below 6 frames, no faster presses. Write the numbers you settled on and the win rates into the PR description, so the team can tune them by playing.

## Done means

- Spec, decisions, walkthrough and README match the game.
- All tests green, including the new and extended bot, server and browser tests above.
- The existing browser runs of a whole match with two phones, and the round 4 bots browser test, still work.
- Push `build_v4`. A pull request from `build_v4` to `main` is already open (round 4: bots); add a short section to its description with what this part changed and the Easy and Hard numbers and win rates. Do not merge it: only Bastian decides when it goes into `main`.
