# Grading criteria check

Written at the end of the build, on the branch `build`. For each of the six criteria: what in the repository answers it, the evidence, and what is still missing. Nothing is claimed here that was not run.

## What was run, and what was not

Run on the build machine (macOS, Node 26.13.0; the unit and server tests also under Node 22.23.4, the version the project targets) and by GitHub Actions:

| Command | Result |
|---|---|
| `npm test` | 410 tests, 410 pass, 0 fail (about 7 seconds). Same result under Node 22.23.4 |
| `npm run test:browser` | 3 tests, 3 pass, 0 fail (Chromium through Playwright, about 30 seconds) |
| `npm audit --audit-level=high` | `found 0 vulnerabilities` |
| GitHub Actions on the pushed branch (commit `1c6eac0`, Ubuntu, Node 22), for the push and for the pull request | Both runs succeeded: `npm test` 410 of 410, `npm audit --audit-level=high` 0 vulnerabilities, `npm run test:browser` 3 of 3 |
| `PORT=3987 node server/index.js`, then played with two emulated phones | A match from the title screen to the results, 60 pictures a second, no console errors |

**Not run by anyone yet.** These are the honest gaps, and they matter for criterion 1:

- **No deployment.** There is no public URL. The README has an empty slot for it. Deploying needs the team's accounts ([`DEPLOY.md`](DEPLOY.md)).
- **The real Google Sheet.** `apps-script/Code.gs` has never been executed. The server side of the sheet connection is tested against a stand-in that speaks the same protocol (`tests/server/outage.test.js`), and all other tests use the in-memory store.
- **Real phones.** Everything was checked in Chromium with emulated iPhone and Android screens and touch events. Safari on a real iPhone, a real Android phone, the demo room's Wi-Fi and a projector were not tested.
- **`main`.** The work is on `build` with an open pull request. The tests pass on `build`; they pass on `main` only after the team merges.

## 1. It works (20 %)

> "The deployed app runs all workflows without errors, including invalid input."

**Not at the top level yet: the app is not deployed.** Everything below is evidence that it works when run locally.

- **Every workflow, in a real browser.** `tests/browser/flow.test.js`, "a whole match from the stage vote to the results, a second match, removing a player, logging out", plays the complete loop twice with the real pages and the real server and fails on any console error or broken file.
- **What a player would notice.** `tests/browser/smoke.test.js` uses an emulated iPhone and an emulated Android phone: the fighter follows the phone and stops when the thumb lifts, a real hit shows as damage on the victim's phone only, the stage and the sprites are really drawn (pixels are read back from the canvas), every pad button can be reached by a finger, a held button stays held, pause really freezes the match, and a phone that reloads or loses its connection gets its pad back.
- **Invalid input.** In the same browser test: a gamertag that is too short, two PINs that do not match, a room that does not exist, a taken gamertag, a wrong PIN, a closed room. Each shows its message next to the field. On the server: `tests/server/accounts.test.js` ("login is refused for an unknown gamertag and for malformed input", "the API refuses bodies that are not JSON, not an object, or too large"), `tests/server/rooms.test.js` ("starting is refused with too few players, unready players or bad settings", "an implausible result is refused and nothing is stored") and `tests/server/strict.test.js`.
- **When things go wrong.** `tests/server/outage.test.js` ("with the store down the server stays up", "a result is queued, the players see their points, and it is written later exactly once"), `tests/server/reconnect.test.js` (phones and the host page dropping and coming back in every phase), and `tests/browser/regressions.test.js` (the host page losing its connection around Start, in mid-match and at the end).
- **Four players end to end.** `tests/server/e2e.test.js`: "four phones register, join, pick, play a full match to a winner; the result reaches the store and the leaderboard".
- **A robustness pass with a simulated bad network** (delay, jitter, stalls, a host or phone cut off for 5 to 40 seconds) and nine matches in a row found no lost or doubled button presses, no memory growth, and a result saved exactly once in every case. The problems it did find were fixed (D-129 to D-131 in [`DECISIONS.md`](DECISIONS.md)).

Missing for the top level: deploy, connect the real sheet, and play on real phones in the demo room ([`TEAM_TASKS.md`](TEAM_TASKS.md)).

## 2. User interface and experience (20 %)

> "The interface fits the problem; workflows are direct, and results and errors are clearly shown to the user."

- **The interface fits the problem.** The laptop shows the game, each phone is a gamepad. Joining is one QR scan (`public/host/main.js`, `/api/qr` in `server/app.js`), then gamertag and PIN, pick a fighter, Ready. The host page needs the mouse only for Start.
- **Two ways to steer**, a D-pad and a floating joystick, chosen on the pad and remembered (`public/play/controls.js`).
- **Results are shown where the player looks.** Damage, lives, held item and the special's cooldown are on the player's own phone (`status` in `public/play/main.js`); every hit and KO gives a vibration, a flash and a sound together, because iPhones cannot vibrate in the browser (`public/play/feedback.js`). The big screen shows the damage cards, the final-KO slow motion and the results with points, new achievements and the all-time leaderboard.
- **Errors say what to do.** Messages are written for the player ("That gamertag is taken. Log in with 'I have an account'.", "Wrong PIN, 4 tries left.", "The host closed the room.") and are checked word for word in `tests/browser/smoke.test.js`. Connection trouble is always visible: "Weak connection", "Connection lost, reconnecting…", "The big screen lost its connection…".
- **Checked by looking.** Every screen of the host page and the phone page was captured at laptop size and at iPhone and Android sizes and reviewed; long names, the landscape fighter select and overlapping banners were fixed after that.

Not at the top level until: someone has held a real phone. Thumb reach, the feel of the buttons and readability on the projector can only be judged in the room. The game-feel review left five tuning notes for the team in [`TEAM_TASKS.md`](TEAM_TASKS.md).

## 3. Scope and ambition (20 %)

> "Substantial features that go well beyond a solo project, implemented consistently."

- **A real-time multiplayer game across devices**: one host page, two to four phones, a relay server with rooms, reconnection in every phase, and optional keyboard players on the laptop.
- **Game content**: 8 fighters with different weight, speed and a special each (`src/game/fighters.js`, `specials.js`), 3 stages with 2 hazards each (`stages.js`, `hazards.js`), 4 items (`items.js`), a stage vote, a hazard vote for eliminated players, lives, the 200 % burnout.
- **Accounts and persistence**: gamertag and PIN, session tokens, points, 8 achievements, an all-time leaderboard, stored in a Google Sheet through Apps Script (`server/store/sheets.js`, `apps-script/Code.gs`) with an in-memory store for development and outages.
- **Original art and sound made in code**: all sprites and stages are drawn from SVG at start-up (`public/shared/art/`), all sounds and the music are synthesised (`public/shared/audio.js`). No downloaded assets except two open fonts ([`CREDITS.md`](../CREDITS.md)).
- **Consistent**: one configuration file holds every number of the rules (`src/game/config.js`); the stage art draws exactly the platforms the rules use; both control modes produce the same seven buttons.

Left out on purpose: demo mode ([`DEMO.md`](DEMO.md) describes what is prepared and what is missing).

## 4. Verification (10 %)

> "Tests cover accepted and rejected actions and edge cases, and all pass on `main`."

- **413 automated tests**: 410 with `node:test` for the rules and the server, 3 browser tests. All pass on `build` (see the table at the top).
- **Accepted actions**: each rule (`tests/game/rules.test.js`, `movement.test.js`), each of the eight specials inside its range (`specials.test.js`), each item (`items.test.js`), each hazard with its safe platform (`hazards.test.js`), registration, login, rooms, a full match (`tests/server/`).
- **Rejected actions**: specials and items out of range, votes from the wrong player or for the wrong stage, wrong PINs and the lockout, tampered and expired tokens, a player trying host actions, a host touching another host's room, forged and implausible results, oversized and malformed messages (`tests/server/rooms.test.js`, `strict.test.js`, `results.test.js`, `accounts.test.js`).
- **Edge cases**: a tap shorter than one frame, presses bunched by a network hiccup, simultaneous hits, the last player standing, a KO in the same step as a burnout, exact boundaries of every limit (`tests/game/exact.test.js`, `input.test.js`, `tests/server/strict.test.js`), and a regression test for every defect the reviews found (`tests/*/regressions.test.js`).
- **Were the tests themselves checked?** Yes. For each package a reviewer agent changed the code on purpose in many small ways and looked at which changes the tests missed; tests were added for those. For the client the last count before the final additions was 57 of 80 breakages caught; the smoke test was then rewritten to catch the remaining kinds that matter to a player (a dead button, an empty canvas, a pause that does not freeze).
- **CI**: `.github/workflows/ci.yml` runs `npm ci`, `npm test`, `npm audit --audit-level=high` and the browser tests on every push and pull request. It passed on the pushed branch (see the table at the top); later commits show their own result on the pull request.

Not at the top level until: the pull request is merged, so that the tests pass on `main`. Known gaps in the tests: the Apps Script file, Safari, and parts of the client that only a person can judge (how the game looks and sounds).

## 5. Security (10 %)

> "Access control and input validation are enforced; dependencies are minimal, pinned, and without known vulnerabilities."

- **Access control.** Every WebSocket message is handled by a table for the sender's role (new, phone, host), so a phone cannot send a host message at all (`server/rooms.js`; test: "a player cannot start a match, submit a result, close the room or talk to other phones"). A host is tied to its room by a secret key (test: "a host cannot touch another host's room"). Joining needs a signed session token (test: "joining is refused without a token, with a tampered one and with an expired one").
- **PINs.** Hashed with scrypt, a salt per player and a server-side pepper; the sheet never sees a PIN (test: "the sheet never sees the PIN: only a salt and a hash are stored"). Five wrong PINs within ten minutes lock a gamertag for ten minutes, and there are at most twenty wrong tries per gamertag in 24 hours (`server/security.js`, `tests/server/accounts.test.js`).
- **Input validation.** Type, size and every field of every message and API body are checked; anything else is dropped without crashing (`server/validate.js`, `tests/server/strict.test.js`). Match results are checked for plausibility before a point is given (`server/results.js`).
- **Limits against abuse.** Message rates, sizes, rooms and sockets per address, join-code guessing, registrations, results per hour (`LIMITS` in `server/config.js`).
- **Browser side.** A strict Content-Security-Policy and HSTS on every response (`server/app.js`); the pages never build HTML from player text.
- **Secrets.** Only in environment variables; `.env` is ignored by git and `.env.example` has names only. With a sheet configured, missing or weak secrets stop the server from starting (test: "with a sheet configured, missing or weak secrets stop the server from starting").
- **Dependencies.** Two at run time, pinned to exact versions with a lock file: `ws` 8.22.2 and `qrcode` 1.5.4. One for development: `playwright` 1.65.0. `npm audit --audit-level=high` reports 0 vulnerabilities, and CI repeats the audit on every push.

Open point, stated in [`WALKTHROUGH.md`](WALKTHROUGH.md) section 8: the host page runs the match, so a host who changes the code of their own page can still invent a believable result. The plausibility checks limit how much that is worth; they cannot rule it out.

## 6. Repository walkthrough (20 %)

> "Members explain how the project is built, why, what its limits are, and how it could change."

This criterion is about the people, so the repository can only prepare them.

- [`WALKTHROUGH.md`](WALKTHROUGH.md): the big picture, five questions every member should be able to answer, one part per package with "what it does", "why it was built this way" and "limits", then security, tests, known limits, how it could change, and five likely questions for each package owner.
- [`DECISIONS.md`](DECISIONS.md): every decision with the alternative that was not taken and the reason. D-098 to D-131 were made during the build and are marked "team to confirm".
- [`TEAM_TASKS.md`](TEAM_TASKS.md): one small change for each member in their own package, with the test to write for it, so that each member has changed and tested the code they explain.
- The commit history is split by package, so each member can follow their own part with `git log`.

Not at the top level until: each member has read their part, done their task and can answer the questions without the document.
