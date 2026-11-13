# NOVA Brawl: Build Prompt, round 4 (bots)

Paste everything below the line into a fresh Claude Code session (local or cloud) started in the root of this repository, on the branch `build_v4`, which holds this file. The spec and the decisions for this round are already written: GAME_SPEC §5a and DECISIONS D-156 to D-165.

---

Add bots to NOVA Brawl as described below, in this one session.

**Git rules for this session.** Work and commit on the branch `build_v4` and push only `build_v4`. Never push to `main`, never merge into `main`, never force-push. Commit with the git identity already configured (author Bastian Volkery) and add no `Co-Authored-By` lines or other attribution to commits or the pull request. Work through to the end without stopping to ask questions. Where something is open, pick what fits the spec best, add a row to `docs/DECISIONS.md` (continue after D-165, status "Decided, team to confirm") and carry on.

## Read first

1. `AGENTS.md`: commands and repository rules. They apply in full. The spec for this round is **already** in `docs/GAME_SPEC.md` (§5a and the lines that mention bots in §1, §4, §5, §10, §10a, §10b, §11) and in `docs/DECISIONS.md` (D-156 to D-165). Build to it. If you have to change a rule, change the spec and the decisions first, then the tests, then the code, and say so in the commit message.
2. `docs/WALKTHROUGH.md` to find your way around.
3. `src/game/` (pure rules, all tuning in `config.js`, randomness only through `rng.js`; `match.js` `step(state, inputs)` takes one input per slot), `public/host/game.js` (`getInputs()` builds the inputs from the phones' `InputBuffer`s), `public/host/main.js` (lobby), `server/rooms.js` (validates every message field by field, so new messages and fields need validators there too) and `server/results.js`.

Keep the existing quality bar: the game runs in a live demo on real iPhones and Android phones. No inline scripts or styles (CSP). Player-facing text in English. `npm test`, `npm run test:browser` and `npm audit --audit-level=high` must be green at the end. No new dependencies.

Work in small commits, one topic each, in the order below.

## 1. The bot brain (`src/game/bot.js`)

- `createBot({ slot, level, seed })` and `botInput(bot, state) → input`. The input has the same shape a phone's `InputBuffer.consume()` returns (`left, right, up, down, attack, jump, special` plus `attackP, jumpP, specialP`), so `step()` needs no change. The bot must not change `state`.
- Pure: no DOM, no clock, no `Math.random`. Its own random stream comes from `rng.js`, seeded from the match seed and the slot, so a match with bots replays exactly in a test.
- Behaviour as in GAME_SPEC §5a and D-163: target choice (nearest, leader counted nearer), moving between platforms (jump, double jump, Down to drop through), attacking in reach (Up for a target above), special in its range when ready, occasional stomp, getting back to the stage (double jump towards the main ground, ledge grab, Jump to climb), items on its way, passing the Group Project, hazards only once announced.
- Human limits: the bot decides on a copy of what it saw `reactionFrames` ago (keep a short history inside the bot), misjudges distances by a random amount, and holds each button press for at least two frames with a minimum gap between presses, like a thumb on a phone.
- All numbers in `config.js` under `bots.medium` (for example `reactionFrames`, `aimError`, `attackChance`, `specialChance`, `stompChance`, `leaderBias`, `itemReach`). Shape it so `bots.easy` and `bots.hard` can be added later as other number sets. Only `medium` is used now.
- Hazards: read only what is shown to players (the announced hazard and its countdown, the visible train or wave). Never read hidden timers such as the late train's delay or the next hazard's start.

## 2. Bot tests (`tests/game/bot.test.js`)

Use the real rules (`createMatch`, `step`) with bots in some slots, items and hazards as stated per test:

- Same seed, same match: two runs with bots give identical states after 3,000 frames.
- Alone on each stage (one bot and one opponent that stands still in a far corner, hazards and items off), a bot does not fall off by itself in 60 s.
- Recovery: a bot placed off the stage beside the main ground, below its level, gets back onto the stage on each stage.
- A bot beats a standing opponent (1 life) within 30 s on each stage.
- Two medium bots, 1 life, items and hazards on, end the match within 3 minutes on each stage (they do not circle each other forever).
- Reaction delay: when a target appears, the bot's first move towards it comes no sooner than `reactionFrames`.
- Hazards: before a hazard is announced, the bot's input is the same with and without the hazard queued; once it is announced, a bot on the hazard's level leaves it.
- `botInput` never changes the state it gets.

Run a few hundred simulated bot-vs-bot frames per stage in a helper and print nothing; keep the whole file under about 10 s.

## 3. Server: bots in the room

As in D-165 and GAME_SPEC §5a:

- The room keeps `bots`: an ordered list of `{ name, fighter }`, and a bench. Names in order: Freshman, Intern, Erasmus.
- New host message `bots` (lobby phase only) with the list of bot fighters (each a valid fighter id, at most 3). Validate it like every other message; a bad one is a strike. Humans plus active bots may never exceed 4: the server refuses a `bots` list that is too long for the humans in the room.
- Bench rules: when a human joins the lobby and humans plus active bots would exceed 4, the last active bot moves to the bench. When a human leaves the lobby (or their held slot runs out) and a place is free, the bot that went to the bench last comes back. Joining during the vote, intro, match or results never touches the bots of the running match; settle the bench when the room returns to the lobby.
- The roster lists the active bots with `bot: true`, name, fighter and the slot they will get.
- Start rule (`vote_start` and `match_start`): at least 1 Ready human, every human in the lobby Ready, and at least 2 fighters with the active bots. At the start, bots get the free slots 0 to 3 in ascending order; remember them with the match (`room.match.bots`).
- A phone that joins during a running match may get a slot number that a bot uses in that match. Its inputs must not reach that bot: the host ignores input for slots it has no phone for (check it, and add a test).
- Results: a result line for a bot names its slot from `room.match.bots`, has no account and gets no points, achievements or crown. A match with fewer than two humans is a practice match (the existing note). Placement points for humans count bots in the places (D-161). Extend the plausibility checks so a bot line is checked like any other.

Server tests (`tests/server/`): the `bots` message (valid, too many, wrong phase, bad fighter), bench and return (join and leave in the lobby, join during a match), start rules (one human plus one bot starts; one human alone does not; an un-Ready human blocks the start), slots of bots at the start, results with bots (saved with two humans, practice with one, bots never in the store or leaderboard, no crown).

## 4. Host page

- Lobby: **Add bot** and **Remove bot** under the player cards, enabled only when allowed. A bot's card shows its sprite, nickname and a small BOT tag at once, with the usual entrance effect when it is added or comes back from the bench. A click on a bot's card cycles its fighter. A new bot's fighter is random, if possible one no human has picked (`Math.random` is fine here: it is cosmetic and not part of the match).
- Match: `getInputs()` asks each bot of the match for its input every step (`botInput`). Bots keep their state for the whole match. Pausing pauses the bots too.
- BOT tag next to the name on the name pill above the fighter, the HUD card, the podium and the stat card. No crown on a bot. A bot's stat card shows no points.
- Map vote view: bots have no voter sprite and the vote does not wait for them. Intro: no Skip pip for bots, the intro does not wait for them.
- Nothing is sent to any phone for a bot (`feedback`, `status`).

## 5. Phone page

- No new screens. Where the phone lists the other players (vote, results), a bot shows its nickname with the BOT tag. Make sure nothing on the phone breaks with 1 human and up to 3 bots.

## 6. Browser test

Extend `tests/browser/`: one phone joins, the host adds two bots, removes one, starts a match with a fixed stage and 1 life; the match runs to the end (let the phone stand still or play; the bot must win or lose, the match must end), the results show "Practice match", and the lobby still shows the bot afterwards. Then a second phone joins a room with one human and three bots: the last bot goes to the bench; the second phone leaves; the bot comes back.

## 7. Docs

- `docs/WALKTHROUGH.md`: where the bot lives, how it gets its input into the match, the human limits, and how to tune `bots.medium`.
- `README.md`: one line on bots in the feature list.
- `docs/DECISIONS.md`: every detail you had to choose, as new rows after D-165.

## Tuning

Medium should feel like a first-time player: a person new to the phone controls wins about every second one-on-one (D-157). You cannot measure that alone. Tune the numbers so that the bot is clearly beatable by a human who plays sensibly (for example, a scripted "simple human" in a test helper that walks to the bot and attacks with a quarter-second reaction should win some of its matches against it, but not all), and write the numbers you settled on and why into the PR description, so the team can tune them by playing.

## Done means

- Spec, decisions, walkthrough and README match the game.
- All tests green, including the new bot, server and browser tests above.
- The existing browser runs of a whole match with two phones still work.
- Push `build_v4` and open a pull request from `build_v4` to `main` with a short list of what changed and the tuning numbers. Do not merge it: only Bastian decides when it goes into `main`.
