Add a hidden demo mode to NOVA Brawl as described below, in this one session.

**Git rules for this session.** Create the branch `feature/demo-mode` from the current `main`, work and commit only on it, and push only it. Push after every commit, so no work is lost if the session stops before the end. If `feature/demo-mode` already exists on the remote with commits of this build, an earlier session was cut off: check it out, read `git log` and the steps below, and continue from there instead of starting again. Never push to `main`, never merge into `main`, never force-push, never enable auto-merge. Commit with the git identity configured for this repository (author Bastian Volkery); if the configured identity is anything else, set the repository's `user.name` and `user.email` to the ones of the existing commits by Bastian Volkery before the first commit. Add no `Co-Authored-By` lines and no "Generated with" or other attribution to commits, to the pull request or to its description; if a tool adds such a line, remove it. Work through to the end without stopping to ask questions. Where something is open, pick what fits the spec and the decisions below best, add a row to `docs/DECISIONS.md` (status "Decided, team to confirm") and carry on.

## Read first

1. `AGENTS.md`: commands and repository rules. They apply in full.
2. `docs/DEMO.md` (what was agreed on 2026-11-11; parts of it are replaced by the decisions below), `docs/GAME_SPEC.md` (§5 lobby and start, §10 screens), `docs/DECISIONS.md` (D-096, D-105, D-111, D-122, D-124, D-134, D-143, D-161).
3. `docs/WALKTHROUGH.md`, the sections on the rules, the server and the host page.
4. Code: `DEFAULT_SETTINGS` and `makeSettings` in `src/game/config.js`; the time cap in `src/game/match.js` (around `timeCapS` and `byTimeCap`); `checkResult` in `server/results.js`; `match_start`, `match_result`, `pick`, `vote_start` and `PHASE_FIELDS` in `server/rooms.js`; in `public/host/main.js` the lobby, `requestStart`, `startMatchOn`, `beginMatch`, `showResults` and the `keydown` handler; the pause hint and the HUD in `public/host/game.js` and its helpers; the fighter carousel in `public/play/main.js`. Tests: `tests/game/rules.test.js` and `tests/game/exact.test.js` (time cap), `tests/server/results.test.js`, `tests/server/rooms.test.js`, `tests/browser/`.

Keep the existing quality bar: the game runs in a live demo on real iPhones and Android phones. No inline scripts or styles (CSP). Player-facing text in English. `npm test`, `npm run test:browser` and `npm audit --audit-level=high` must be green at the end. No new dependencies. Install with `npm ci`. In a cloud session Chromium and Playwright are already installed: do not run `npx playwright install`; if the browser tests cannot find a browser, launch with `executablePath: '/opt/pw-browsers/chromium'`.

Work in small commits, one topic each, in the order below.

## Decisions (team, 2026-11-13)

Add these as new rows in `docs/DECISIONS.md` in a new section "Demo mode (2026-11-13)", continuing after the highest existing ID, "Who: Team", status "Decided". Mark D-046 and the rows of `DEMO.md` they replace accordingly (never delete old rows; see "How to use this file" at the top of `DECISIONS.md`).

| Topic | Decision |
|---|---|
| Hidden switch | Demo mode is switched on and off **only with Shift+D on the host page, in the lobby**. There is no button. A second Shift+D switches it off. It is off after a reload of the host page (nothing is stored). Shift+D does nothing outside the lobby (vote, intro, match, results). |
| Showing it | While it is on, the lobby (the host's home screen) shows in its **bottom left corner** the line **"DEMO MODE (to quit press Shift + D)"**, exactly this text. Switching shows a short toast ("Demo mode on" / "Demo mode off"). The lives selector is locked to the demo value while demo mode is on and returns to the earlier choice when it is switched off. Phones show nothing extra. |
| Settings in one place | All demo values live in **one object in `src/game/config.js`** (for example `DEMO_SETTINGS`), with a comment, so the team can change them later in that file alone: `lives: 1`, `timeCapS: 120`, `hazardMinS: 5`, `hazardMaxS: 8`, and `fighters` (the list below). Nothing else may hard-code these values; the server, the host page, the phones and the tests all read them from there. Changing `lives` to 2 or 3 there must just work. |
| Length | Hard cap **120 s** of fighting. At the cap the existing rule decides among the fighters still in the match: first the one with **more lives left** wins; with equal lives, the one with the **lower current damage %** wins; only if that is also equal, the one with more damage dealt (`src/game/match.js` already does this; keep it and test each step). |
| Hazards | The next hazard warning starts **5 to 8 s** after a hazard ends (normal game: 10 to 15 s, D-143). This replaces "every 15 s" in `DEMO.md`, which is slower than the normal game since D-143. |
| Clock | During a demo match the remaining time is shown **at the bottom centre of the big screen, under the main ground** (where the pause hint sits today, y about 704), as `m:ss`. Nothing else: no clock on the phones, no other new HUD element. Because the clock takes its place, the pause hint "Press P or Esc to pause" is not shown in a demo match; P and Esc still pause, and the clock stops while paused. |
| Fighters | In demo mode only **four fighters** can be picked: **Maastricht Blondie, Lisboa OG, Finance Bro, Surfer Girl** (`DEMO_SETTINGS.fighters`). The phones' carousel shows only these, bots pick only from these, and a match with any other fighter cannot start in demo mode. Two players may still pick the same one (D-051). |
| Flow | Stage vote, intro and fighter select run as in the normal game. |
| Saving | A demo match is **never saved**: no sheet row, no points, no achievements, no crowns, no per-hour count. It is treated like a practice match. The result screen says so on the big screen and on the phones ("Demo match: not saved."). |

Why these four fighters (write this into the decision row): Padel Smash is the strongest special for a KO at 1 life (D-130); the mini Tram 28 is the most visible special and the Lisbon icon; Cash Rain is a radius special that makes everyone around slip; Surfer Girl is the fastest fighter. Four different kinds of special, weights from 85 to 115, four clearly different colours.

## 1. Settings (`src/game/config.js`)

- Add `DEMO_SETTINGS` as above, exported, with a comment that this is the one place to change the demo. Validate it with `makeSettings` where it becomes match settings, so a bad edit falls back safely instead of breaking a match. `fighters` must be valid fighter ids; filter out unknown ones and fall back to all fighters if the list ends up empty.
- Rules tests (`tests/game/`): a match with the demo settings ends at 120 s with `byTimeCap: true`; more lives left wins at the cap (with `lives: 2`); with equal lives the lower current damage % wins; the tie-break on damage dealt; the hazard gap with `hazardMinS: 5`, `hazardMaxS: 8` stays between 5 and 8 s; a normal match (no cap) is unchanged. Reuse the existing time-cap tests where they fit; do not change what they check.

## 2. Server (`server/rooms.js`, `server/results.js`)

- `match_start` and `vote_start` accept an optional `demo: true` (no other value; anything else is a malformed message as today). The room's match remembers it. With `demo: true` the server refuses the start (a clear error, like the other start errors) if `lives` is not `DEMO_SETTINGS.lives` or a human's or a bot's fighter is not in `DEMO_SETTINGS.fighters`. Picks themselves stay as they are: the server does not know about demo mode while in the lobby.
- `match_result` for a demo match: check the result with `checkResult` plus what a time cap needs. Only for a match started with `demo: true`, `byTimeCap: true` is allowed; then several players may end with lives left, the winner is the one with place 1, and the duration may not exceed `DEMO_SETTINGS.timeCapS` plus a small margin. Every other check stays as strict as now. A normal match with `byTimeCap: true` is still refused ("This build has no time limit." stays for that case).
- A demo match is **never stored** and never counted for the per-hour limit, whatever the number of logged-in players. The reply is `result_saved` with `stored: false`, points 0, no achievements and the note "Demo match: not saved.", so the host's end sequence and results screen work unchanged.
- The `phase` message for the lobby gets an optional `fighters` field: a list of at most 8 valid fighter ids (extend `PHASE_FIELDS.lobby` with the same strictness as the other fields, D-124). The host sends it while demo mode is on; without it the phones show all fighters.
- Server tests: `demo: true` is accepted, any other `demo` value is a strike; a demo start with the wrong lives or a fighter outside the list is refused; a demo result that ended at the cap is accepted and not stored (the store is not called, the crowns and the per-hour count do not change), also with two or more logged-in players; a normal match with `byTimeCap: true` is still refused; a demo match that ended normally (one player left) is also not stored; the lobby `fighters` field is relayed when valid and refused when not (unknown id, more than 8 entries, not a list).

## 3. Host page (`public/host/`)

- Shift+D in the lobby toggles demo mode (`event.code === 'KeyD'` with `event.shiftKey`, no other modifier, not while typing in an input). Outside the lobby it does nothing. State is in memory only.
- The bottom-left line "DEMO MODE (to quit press Shift + D)", the toast and the locked lives selector as in the decisions. The line must be readable on a projector and must not cover anything at the real lobby size; it is shown only in the lobby.
- While demo mode is on, the host sends the lobby `phase` message with `fighters`, and again whenever a phone joins or reconnects, so every phone knows. When it is switched off, it sends the lobby phase without `fighters`.
- Bots: in demo mode a new bot picks only from the demo fighters, a click on a bot card cycles only through them, and switching demo mode on moves any bot with another fighter to a demo fighter (send the `bots` message as usual).
- Start: in demo mode, Start (and Vote) is refused on the host with a clear lobby hint while any human's fighter is not a demo fighter ("Waiting for everyone to pick one of the demo fighters"). The start message carries `demo: true`; the match settings are `DEMO_SETTINGS` (lives, `timeCapS`, `hazardMinS`, `hazardMaxS`) together with the lobby's items and hazards switches.
- Clock: as in the decisions, drawn on the canvas at the bottom centre, readable on a projector (the lobby font, white with a dark outline like the other canvas text). It counts the fighting time the rules count (`fightFrames`), so it stops during pause and during the final-KO slow motion exactly as the rules do and reaches 0:00 at the frame the match ends. The pause hint is hidden in a demo match.
- End at the cap: make sure the end sequence (winner zoom, "{NAME} WINS!", podium) runs when the match ends by the cap, where there is no final KO. If it needs a moment that the final KO normally gives, show **TIME!** in the style of the KO texts for that moment; record the choice in `DECISIONS.md`.
- `window.novaBrawl` exposes whether demo mode is on (read-only), for the browser test.

## 4. Phone (`public/play/`)

- When the lobby phase carries `fighters`, the carousel shows only those, in their usual order; without it, all eight. If the phone's current fighter is not in the list, it moves to the first allowed fighter and is no longer Ready (send `pick` with `ready: false`), and the hint says to pick again. Switching demo mode off shows all fighters again and keeps the current pick.
- Nothing else changes on the phone.

## 5. Browser test

Add `tests/browser/demo.test.js` (or extend an existing file if that fits better): the host presses Shift+D in the lobby, the line "DEMO MODE (to quit press Shift + D)" appears bottom left and the lives selector is locked; a phone sees only the four demo fighters; a phone that had another fighter is moved and un-readied; start with one phone and one bot; the match has `timeCapS` 120 and 1 life (`window.novaBrawl`); the clock is shown and the pause hint is not; let the match end at the cap quickly (expose a read-only way to run the test with a short cap, or fast-forward the simulation the way the existing browser tests already do; do not add a production switch for this); the result is not saved and the note says so; back in the lobby a second Shift+D switches demo mode off, the line is gone and the phone shows all eight fighters again. Shift+D during a match does nothing. The existing browser tests must still pass.

## 6. Docs

- `docs/DEMO.md`: rewrite as the description of what is built: how to switch it on (Shift+D in the lobby), what changes, where to change the values (`DEMO_SETTINGS` in `src/game/config.js`, for example the lives), and the presenter's checklist (open the URL two minutes early, Shift+D, check the line bottom left). Remove "(planned, not built yet)" from the title.
- `docs/GAME_SPEC.md`: replace "Demo mode is not part of this build" with a short section on demo mode, and the lobby and HUD lines it touches.
- `docs/DECISIONS.md`: the team rows above, mark D-046 and D-096 as changed by them, and every detail you had to choose as rows with status "Decided, team to confirm".
- `docs/WALKTHROUGH.md`: demo mode in the rules, server and host page sections, the new `demo` and `fighters` fields in the message table, and remove demo mode from the list of possible extensions.
- `README.md`: one line in the docs table changes from "planned, not built"; do not describe the shortcut in the README (it stays a host's tool, documented in `DEMO.md`).
- `docs/CRITERIA_CHECK.md`: remove "Left out on purpose: demo mode".
- Save this prompt, exactly as you were given it, as `docs/archive/BUILD_PROMPT_DEMO.md`, and add a row for it to the table in `docs/archive/README.md` ("Demo mode", with the decision IDs).

## Done means

- Spec, decisions, walkthrough, `DEMO.md` and README match the game.
- All tests green, including the new rules, server and browser tests above, and `npm audit --audit-level=high` reports nothing.
- A normal match behaves exactly as before: no clock, the pause hint, all eight fighters, results saved as before.
- `feature/demo-mode` is pushed (after every commit, and at the end). Open a pull request from `feature/demo-mode` to `main` titled "Demo mode: hidden Shift+D switch, 2 minutes, 1 life, four fighters", with a short description of what changed, how to try it, and the list of "team to confirm" rows. Do not merge it: only the team decides when it goes into `main`.
