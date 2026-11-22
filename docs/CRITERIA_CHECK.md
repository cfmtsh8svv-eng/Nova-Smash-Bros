# Grading criteria check

Updated on 2026-11-19 on the branch `chore/remove-demo-and-refresh-docs`, after demo mode was removed (D-212). For each of the six criteria: what in the repository answers it, the evidence, and what is still missing. Nothing is claimed here that was not run. Older runs (410, 474, 536 and 562 tests on earlier branches) are in the git history of this file.

## What was run, and what was not

| What | Result |
|---|---|
| `npm test` (Linux, Node 22.23.5) | 547 tests, 547 pass, 0 fail, about 20 seconds |
| `npm run test:browser` (Chromium through Playwright 1.65.0) | 5 tests, 5 pass, 0 fail, 0 skipped |
| `npm audit --audit-level=high` | `found 0 vulnerabilities` |
| GitHub Actions on `main` before this branch (pull request #19, commit `d8f6667`) | `npm test`, `npm audit` and `npm run test:browser` succeeded for the push and the pull request |
| The deployed app at <https://nova-brawl.onrender.com>, running `main` before this branch, with the real Google Sheet, driven from a script with an emulated iPhone 13 and an emulated Pixel 7 | Passed every step: a room opens; a gamertag that is too short and two PINs that differ are refused with a message; the iPhone registers a new player; the Pixel 7 gets "Wrong PIN, 4 tries left." and then logs in with the right PIN, and the iPhone is told the account was opened on another phone; the player picks a fighter and is Ready, the host adds an Easy bot and starts on Campus with one life; the first-game guide (joystick left and right, Jump, Attack, Special) runs to its end; the phone is reloaded in mid-match and gets its pad back; the match ends against the bot with "Practice match: points need at least two logged-in players."; back in the lobby the player logs out. No page crashed and no request failed with a server error; the only console line was the 401 answer to the wrong PIN. `/healthz` before and after: `"store":"sheets"`, `"storeReachable":true`, `"pendingResults":0`, `"droppedResults":0` |
| The real Google Sheet, with the server running locally (2026-11-11): two test players registered, wrong and right PIN, one match result sent, server restarted, login again | Registration takes 3 to 5 seconds (the sheet is slow); the result was stored after 2.5 seconds with the right points and achievements; after the restart the login was answered from the sheet; the sheet holds a salt and a hash, no PIN |
| The deployed app on 2026-11-11, emulated phones, from Lisbon | From a button press on the phone to the fighter moving on the big screen: median 52 and 55 ms in two runs |

**What was not run.** These are the honest gaps, and they matter for criterion 1:

- **A real Android phone.** Nobody in the team has one. Android was only checked as an emulated Pixel 7 in Chromium, on the deployed app and in `tests/browser/smoke.test.js`.
- **The presentation room.** Its Wi-Fi and its projector were not tried before the deadline.
- **Real iPhones.** The team tested the deployed app with iPhones in Safari after the deployment on 2026-11-11 and reports that it works. That is the team's own test; the scripted runs above use Chromium.
- **A saved match on the deployed app since the tutorial.** The scripted run above was a practice match (one human and a bot), so nothing was written to the `matches` tab. After the deployment a team member played a saved match between two registered players.
- **The automated tests do not use the real sheet.** They use the in-memory store and a stand-in that speaks the same protocol (`tests/server/outage.test.js`).

## 1. It works (20 %)

> "The deployed app runs all workflows without errors, including invalid input."

**Deployed from `main` at <https://nova-brawl.onrender.com>, checked there on 2026-11-19 with every workflow and with invalid input (see the table at the top), and tested by the team with iPhones in Safari.** The list below is the evidence from the automated tests.

- **Every workflow, in a real browser.** `tests/browser/flow.test.js`, "a whole match from the stage vote to the results, a second match, removing a player, logging out", plays the complete loop twice with the real pages and the real server and fails on any console error or broken file.
- **What a player would notice.** `tests/browser/smoke.test.js` uses an emulated iPhone and an emulated Android phone: the fighter follows the phone and stops when the thumb lifts, a real hit shows as damage on the victim's phone only, the stage and the sprites are really drawn (pixels are read back from the canvas), every pad button can be reached by a finger, a held button stays held, pause really freezes the match, and a phone that reloads or loses its connection gets its pad back.
- **Invalid input.** In the same browser test: a gamertag that is too short, two PINs that do not match, a room that does not exist, a taken gamertag, a wrong PIN, a closed room. Each shows its message next to the field. On the server: `tests/server/accounts.test.js` ("login is refused for an unknown gamertag and for malformed input", "the API refuses bodies that are not JSON, not an object, or too large"), `tests/server/rooms.test.js` ("starting is refused with too few players, unready players or bad settings", "an implausible result is refused and nothing is stored") and `tests/server/strict.test.js`.
- **When things go wrong.** `tests/server/outage.test.js` ("with the store down the server stays up", "a result is queued, the players see their points, and it is written later exactly once"), `tests/server/reconnect.test.js` (phones and the host page dropping and coming back in every phase), and `tests/browser/regressions.test.js` (the host page losing its connection around Start, in mid-match and at the end).
- **Four players end to end.** `tests/server/e2e.test.js`: "four phones register, join, pick, play a full match to a winner; the result reaches the store and the leaderboard".
- **A robustness pass with a simulated bad network** (delay, jitter, stalls, a host or phone cut off for 5 to 40 seconds) and nine matches in a row found no lost or doubled button presses, no memory growth, and a result saved exactly once in every case. The problems it did find were fixed (D-129 to D-131 in [`DECISIONS.md`](DECISIONS.md)).

Not checked: a real Android phone and the presentation room (see the gaps at the top).

## 2. User interface and experience (20 %)

> "The interface fits the problem; workflows are direct, and results and errors are clearly shown to the user."

- **The interface fits the problem.** The laptop shows the game, each phone is a gamepad. Joining is one QR scan (`public/host/main.js`, `/api/qr` in `server/app.js`), then gamertag and PIN, pick a fighter, Ready. The host page needs the mouse only for Start.
- **A floating joystick** that appears where the thumb lands, with a dead zone and a centre that follows the thumb (`public/play/controls.js`).
- **Results are shown where the player looks.** Damage, lives, held item and the special's cooldown are on the player's own phone (`status` in `public/play/main.js`); every hit and KO gives a vibration, a flash and a sound together, because iPhones cannot vibrate in the browser (`public/play/feedback.js`). The big screen shows the damage cards, the final-KO slow motion and the end sequence on the podium with points and new achievements; the all-time leaderboard is in the lobby (D-155).
- **Errors say what to do.** Messages are written for the player ("That gamertag is taken. Log in with 'I have an account'.", "Wrong PIN, 4 tries left.", "The host closed the room.") and are checked word for word in `tests/browser/smoke.test.js`. Connection trouble is always visible: "Weak connection", "Connection lost, reconnecting…", "The big screen lost its connection…".
- **Checked by looking.** Every screen of the host page and the phone page was captured at laptop size and at iPhone and Android sizes and reviewed; long names, the landscape fighter select and overlapping banners were fixed after that.

The team has played it on iPhones in Safari and reports that it works. Readability on the projector can only be judged in the room.

## 3. Scope and ambition (20 %)

> "Substantial features that go well beyond a solo project, implemented consistently."

- **A real-time multiplayer game across devices**: one host page, two to four phones, a relay server with rooms, and reconnection in every phase.
- **Game content**: 8 fighters with different weight, speed and a special each (`src/game/fighters.js`, `specials.js`), 3 stages with 3 hazards each (`stages.js`, `hazards.js`), 9 items (`items.js`), a map vote with stage previews, a hazard vote for eliminated players, lives, the 200 % burnout.
- **Bots** at three levels (Easy, Medium, Hard) that play with the same buttons a phone sends and keep human limits (`src/game/bot.js`, D-156 to D-181), so one person can play a full match.
- **A first-game guide** for new players: a full-screen phone diagram on the laptop and the real control lit up on each phone, gated by real inputs, with the completion saved per account (`src/game/tutorial.js`, `public/host/tutorial.js`, `public/play/tutorial.js`, D-211).
- **Accounts and persistence**: gamertag and PIN, session tokens, points, 8 achievements, an all-time leaderboard, stored in a Google Sheet through Apps Script (`server/store/sheets.js`, `google-sheet/Code.gs`) with an in-memory store for development and outages.
- **Original art and sound made in code**: all sprites and stages are drawn from SVG at start-up (`public/shared/art/`), all sounds and the music are synthesised (`public/shared/audio.js`). No downloaded assets except two open fonts ([`CREDITS.md`](../CREDITS.md)).
- **Consistent**: one configuration file holds every number of the rules (`src/game/config.js`); the stage art draws exactly the platforms the rules use; the joystick and the buttons produce the seven buttons the rules read.

## 4. Verification (10 %)

> "Tests cover accepted and rejected actions and edge cases, and all pass on `main`."

- **552 automated tests**: 547 with `node:test` for the rules, the server and the sheet script, 5 browser tests. None is skipped. See the table at the top for what was run where.
- **Accepted actions**: each rule (`tests/game/rules.test.js`, `movement.test.js`), each of the eight specials inside its range (`specials.test.js`), each item (`items.test.js`), each hazard with its safe platform (`hazards.test.js`), registration, login, rooms, a full match (`tests/server/`).
- **Rejected actions**: specials and items out of range, votes from the wrong player or for the wrong stage, wrong PINs and the lockout, tampered and expired tokens, a player trying host actions, a host touching another host's room, forged and implausible results, oversized and malformed messages (`tests/server/rooms.test.js`, `strict.test.js`, `results.test.js`, `accounts.test.js`).
- **Edge cases**: a tap shorter than one frame, presses bunched by a network hiccup, simultaneous hits, the last player standing, a KO in the same step as a burnout, exact boundaries of every limit (`tests/game/exact.test.js`, `input.test.js`, `tests/server/strict.test.js`), and a regression test for every defect the reviews found (`tests/*/regressions.test.js`).
- **Were the tests themselves checked?** Yes. For each package a reviewer agent changed the code on purpose in many small ways and looked at which changes the tests missed; tests were added for those. For the client the last count before the final additions was 57 of 80 breakages caught; the smoke test was then rewritten to catch the remaining kinds that matter to a player (a dead button, an empty canvas, a pause that does not freeze).
- **CI**: `.github/workflows/ci.yml` runs `npm ci`, `npm test`, `npm audit --audit-level=high` and the browser tests on every push and pull request. It passed on `main` (see the table at the top).

Known gaps in the tests: the Apps Script file inside Google itself (it is tested in Node against a stand-in spreadsheet, `tests/server/sheets-script.test.js`), Safari, and parts of the client that only a person can judge (how the game looks and sounds).

## 5. Security (10 %)

> "Access control and input validation are enforced; dependencies are minimal, pinned, and without known vulnerabilities."

- **Access control.** Every WebSocket message is handled by a table for the sender's role (new, phone, host), so a phone cannot send a host message at all (`server/rooms.js`; test: "a player cannot start a match, submit a result, close the room or talk to other phones"). A host is tied to its room by a secret key (test: "a host cannot touch another host's room"). Joining needs a signed session token (test: "joining is refused without a token, with a tampered one and with an expired one").
- **PINs.** Hashed with scrypt, a salt per player and a server-side pepper; the sheet never sees a PIN (test: "the sheet never sees the PIN: only a salt and a hash are stored"). Five wrong PINs within ten minutes lock a gamertag for ten minutes, and there are at most twenty wrong tries per gamertag in 24 hours (`server/accounts.js`, `tests/server/accounts.test.js`).
- **Input validation.** Type, size and every field of every message and API body are checked; anything else is dropped without crashing (`server/validate.js`, `tests/server/strict.test.js`). Match results are checked for plausibility before a point is given (`server/results.js`).
- **Limits against abuse.** Message rates, sizes, rooms and sockets per address, join-code guessing, registrations, results per hour (`LIMITS` in `server/config.js`).
- **Browser side.** A strict Content-Security-Policy on every response, HSTS where the request came over https (`server/security.js`); the pages never build HTML from player text.
- **Secrets.** Only in environment variables; `.env` is ignored by git and `.env.example` has names only. With a sheet configured, missing or weak secrets stop the server from starting (test: "with a sheet configured, missing or weak secrets stop the server from starting").
- **Dependencies.** Two at run time, pinned to exact versions with a lock file: `ws` 8.22.2 and `qrcode` 1.5.4. One for development: `playwright` 1.65.0. `npm audit --audit-level=high` reports 0 vulnerabilities, and CI repeats the audit on every push.

Open point, stated in [`WALKTHROUGH.md`](WALKTHROUGH.md) section 8: the host page runs the match, so a host who changes the code of their own page can still invent a believable result. The plausibility checks limit how much that is worth; they cannot rule it out.

## 6. Repository walkthrough (20 %)

> "Members explain how the project is built, why, what its limits are, and how it could change."

This criterion is about the people, so the repository can only prepare them.

- [`WALKTHROUGH.md`](WALKTHROUGH.md): the big picture, five questions every member should be able to answer, one part per package with "what it does", "why it was built this way" and "limits", then security, tests, known limits, how it could change, and the likely questions for each package owner.
- [`DECISIONS.md`](DECISIONS.md): every decision with the alternative that was not taken and the reason. The team confirmed the build decisions (D-098 to D-131), the bot round (D-156 to D-165), D-181 and D-182 on 2026-11-13, D-125 and the tutorial details of D-211 on 2026-11-17, and decided D-212 (demo mode removed) on 2026-11-19. No decision waits for the team.
- The commit history is split by package, so each member can follow their own part with `git log`.

Not at the top level until each member has read the walkthrough and can answer the questions without the document.
