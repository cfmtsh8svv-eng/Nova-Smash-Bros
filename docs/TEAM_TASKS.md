# Team tasks after the build

The course asks that every member commits code and can explain every part. These are small, real tasks, three per package owner. Each one touches a few lines, comes with a test, and makes the owner read the part they will explain. Do them on a branch, run `npm test`, open a pull request.

How to work on one:

```bash
git checkout main && git pull
git checkout -b my-task-name
# ... edit, then:
npm test
git add -A && git commit -m "What I changed and why"
git push -u origin my-task-name      # then open a pull request on GitHub
```

Rule from [`AGENTS.md`](../AGENTS.md): never change a test just to make it pass. If you change a rule on purpose, change the test for that rule in the same commit and say so.

## Owner of the game rules (`src/game/`, `tests/game/`)

| # | Task | Where | Test to add or change |
|---|---|---|---|
| G1 | **Tune one fighter.** After playtesting, change one number of one special (for example Bass Drop's radius or Wave Rider's cooldown) and write down why in `docs/DECISIONS.md`. | `SPECIAL_TUNING` in `src/game/config.js` | The matching "reach of ..." case in `tests/game/exact.test.js` (the inside and outside distances) |
| G2 | **A new KO text.** Add one more line to the launch texts or the burnout texts, in the game's voice (`docs/CONCEPT.md` §3.4). | `LAUNCH_TEXTS` / `BURNOUT_TEXTS` in `src/game/combat.js` | A test in `tests/game/rules.test.js` that over many seeds every text in the list shows up at least once |
| G3 | **Make the Custard Tart rarer.** Items are picked evenly at random. Give each item a weight so the tart appears half as often as the others. | `spawnRandomItem` in `src/game/items.js`, weights in `config.js` | A test that counts item types over a few thousand spawns and checks the tart's share |

## Owner of the server (`server/`, `apps-script/`, `tests/server/`)

| # | Task | Where | Test to add or change |
|---|---|---|---|
| S1 | **A new achievement: "Marathon"** for finishing a match that lasted five minutes or longer. | `ACHIEVEMENTS` and `newAchievements` in `server/results.js` (the duration is in the checked result; pass it in) | In `tests/server/results.test.js`: earned at 300 s, not at 299 s, not earned twice. Update the two tests that count eight achievements (in `results.test.js` and `http.test.js`) to nine |
| S2 | **Friendlier lockout message.** Show the remaining time in minutes *and* seconds when less than two minutes are left ("Try again in 1 min 20 s"). | `lockedReply` in `server/app.js` | In `tests/server/accounts.test.js`: move the clock to 80 s before the lock ends and check the text |
| S3 | **Show wins on the leaderboard.** The API already returns `wins`; add it to the text the host page shows, and add a test that the API returns it for every row. | `fillBoard` in `public/host/main.js`, `tests/server/strict.test.js` | A test on `/api/leaderboard` that every row has `rank`, `gamertag`, `points`, `wins`, `matches` and nothing else |

## Owner of the client (`public/`, `tests/browser/`)

| # | Task | Where | Test to add or change |
|---|---|---|---|
| C1 | **Choose the default control mode.** After playtesting with real phones, decide between D-pad and joystick as the default for new players, and write the decision into `docs/DECISIONS.md`. | Near the end of `public/play/main.js`, the line that calls `setMode(...)` | In `tests/browser/smoke.test.js`: a fresh phone starts in the chosen mode |
| C2 | **Tune the joystick.** Try the dead zone and the up/down thresholds on a real phone until looking up does not happen by accident while running. | `STICK` in `public/play/controls.js` | In the smoke test: a small drag inside the dead zone does not move the fighter |
| C3 | **A copy pass on the phone.** Read every message a player can see on the phone and make each one shorter or clearer where you can (keep the meaning; errors must still say what to do). | Texts in `public/play/main.js` and `public/play/index.html`; error texts in `server/rooms.js` and `server/app.js` belong to the server owner, so agree on those together | Update the texts the smoke test checks (for example "Room not found", "too short") |

## For everyone

- Before the demo, on a real iPhone: hold a direction for three seconds and check that the fighter keeps running (Safari was not tested in the build; everything was checked in Chromium).
- Things the game-feel review noticed that were left for you to judge on real phones: the two arrows ◀ and ▶ are far apart (`public/play/play.css`); the D-pad/joystick switch sits just above Attack and can be hit in a fight; every hit freezes the whole game for a moment (`hitPauseMs` in `src/game/config.js`), which is a lot with four players; getting back to the stage after being launched is hard with one air jump (`doubleJumpSpeed`); Bass Drop and the up-attack launch too steeply to ever knock anyone out (`upAngleDeg`).
- Play five matches on real phones and write down what felt wrong. Each note is either a tuning value (see G1, C2) or a row for `docs/DECISIONS.md`.
- Read your section of [`WALKTHROUGH.md`](WALKTHROUGH.md) out loud once. If a sentence is hard to say, rewrite it in your own words and commit that.
- Demo mode is described in [`DEMO.md`](DEMO.md). It is a good bigger task if there is time: the settings and the time-cap rule already exist; the lobby toggle, sending the cap to the server and letting the server accept a time-capped result are what is left.
