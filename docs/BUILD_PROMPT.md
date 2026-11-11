# NOVA Brawl: Build Prompt

Paste everything below the line into a fresh Claude Code session started in the root of this repository, on the branch `build-prep`.

---

Build NOVA Brawl completely, in this one session, from the spec in this repository. Work through to the end without stopping to ask me questions. When something is ambiguous, pick the option that best fits the spec, note the choice in `docs/DECISIONS.md`, and continue.

## What this is and who it is for

NOVA Brawl is a university team project for an introductory programming course. It is a browser party fighter: a laptop shows the game, and 2 to 4 players use their phones as controllers. It is graded by teaching staff who will open the public URL, watch a live demo with real phones (iPhones and Android phones), and then open the repository and ask any team member to explain any part of it. **Quality and function come first.** The game has to feel good and hold up in a live demo with real phones on an unknown network: responsive controls, stable frame rate, no crashes, no stuck states. Choose the design that works best, even where it is more involved: proper netcode handling (input buffering, latency smoothing, clean reconnects), a robust state machine for rooms and matches, well-tuned physics and hit detection, polished animation and feedback. Do not simplify a system to make the code easier to read if that makes the game worse. The team does not need to follow every line; they rely on `docs/WALKTHROUGH.md` to explain how it is built, so make that document good.

## Read first

1. `docs/GAME_SPEC.md`: the authoritative spec. Where older docs disagree, it wins.
2. `design/final/characters.js` and `design/final/stages.js`: the final art, as working code. Open `design/final/reference.html` in a browser to see it. Port this code into the client; keep the looks, colours, platform layouts and trim exactly. The fighters there are single standing poses, so you will extend the generator with poses (see below).
3. `docs/CONCEPT.md` §3 for voice, signature lines and humour rules. `docs/DECISIONS.md` for history.

## What to build

Everything in `docs/GAME_SPEC.md`. **Do not build demo mode**: it comes later and is described in `docs/DEMO.md`. Keep all match settings (lives, hazard interval, an optional time cap that stays off) in one settings object so it can be added without touching the rules. The points below are the ones where a build most easily goes wrong.

**Structure.** One Node 22 server (`server/`) that serves the static client, runs the WebSocket relay with rooms, and exposes the account, result and leaderboard API. Client in `public/` as ES modules: `public/host/` (the big screen), `public/play/` (the phone), and `src/game/` for the pure game logic that both the host page and the Node tests import. The game logic must not touch the DOM, the network or the clock directly: it takes inputs and a time step and returns state and events. That is what makes it testable. Runtime dependencies are `ws` and `qrcode` only, pinned to exact versions, with a committed lockfile.

**Phones.** They must work in iOS Safari and Android Chrome. Build both control modes from `docs/GAME_SPEC.md` §6, the D-pad and the floating joystick, behind one input interface with a toggle in the header, and remember the player's choice on the phone. Use Pointer Events with multi-touch so holding ▶ while tapping Jump or Attack works. Give the joystick a dead zone and make its thresholds tuning values. Prevent zoom, text selection, scroll and the long-press menu on the gamepad. Request a screen wake lock and tolerate refusal. Show a rotate hint in portrait. Send input on every change plus a heartbeat, and make sure a tap shorter than one frame still registers once. iPhone browsers have no vibration API, so feedback is always three things together: `navigator.vibrate` where it exists, a full-screen colour flash, and a short Web Audio sound that is unlocked on the player's first tap. Never let a missing API throw.

**Accounts and the Google Sheet.** Write the Apps Script web app (`apps-script/Code.gs`) that the server calls: it checks the shared secret, validates input again, uses `LockService` around every read-then-write, and returns JSON. Write `docs/SETUP_SHEETS.md` with click-by-click steps for creating the sheet, pasting the script, deploying it and setting the four environment variables. Put all sheet access behind one module with two implementations, the real one and an in-memory one. The in-memory one is used when the environment variables are missing and in every test. The server must start and be fully playable without any sheet configured.

**Art and animation.** Extend the fighter generator so each fighter has poses: idle, run (2 frames), jump, fall, attack, special (holding the special's item), hurt, KO. Do this by parameterising arm and leg angles and the held item, then render every pose through the same pixel pipeline once at load into cached canvases. Add squash and stretch, hit pause, screen shake on strong hits and damage numbers in code. Draw each stage once into a cached canvas; animate hazards, items and effects on top. Sound effects are synthesised with Web Audio so there are no asset licences to manage.

**Hazards.** Announce every hazard as animated text only: the hazard's name, then a large 3, 2, 1 with each number popping in, on the host and on every phone. No box, no bar. Each hazard affects one level or zone only, so a player can always escape by moving or jumping; write a test per hazard that a fighter on a safe platform takes no effect.

**Final KO.** Implement the slow motion as a time scale on the fixed-step simulation (the rules still run at the same step, just fewer steps per rendered frame), and the zoom as a camera transform on the canvas, so neither changes game results. Test that a match ends with the same winner with and without the effect.

**Host fallback.** Keyboard controls for two players on the host page, so the game can be developed and demonstrated without phones.

**Docs the graders and the team need.**
- `README.md`: the deployed URL, the three members with student numbers (already in the file, keep them), exact commands to run the app and the tests locally, how to play.
- `docs/WALKTHROUGH.md`: for each part of the system, what it does, why it was built that way, its limits, and how it could change. Include direct answers to: where is the data stored, what do the tests cover and not cover, what happens if Google Sheets is unavailable, why does the host page run the simulation, how are PINs protected. Write it so a beginner can say it out loud, even where the code behind it is complex: explain the idea, not the lines.
- `docs/DEPLOY.md`: Render (free web service, `render.yaml` in the repo, health check at `/healthz`) and the Mac mini backup with Tailscale Funnel.
- `docs/TEAM_TASKS.md`: six to nine small, real follow-up tasks (tuning values, a new award, copy changes, one more test each) split across the three members, so each of them commits code of their own before the deadline.
- `AGENTS.md` with the run and test commands, the branch rule, the secrets rule and "never edit tests to make them pass"; `CLAUDE.md` that points to it.
- Rewrite `docs/SPECS.md` and `docs/CONCEPT.md` so they match what was built, or mark them as historical at the top. Remove the Python instructions everywhere.

## How to work: Fable only, with independent reviewers

Use Claude Fable for everything. Every subagent you start must run on the Fable model; do not use a smaller model for any step.

Build in three packages, in this order: game logic, then server, then client. After each package is written and its tests pass, start **independent reviewer agents** that did not write the code and give them the code and the spec, not your own summary of it:

1. **Spec reviewer:** reads `docs/GAME_SPEC.md` and the package, and lists every rule, value or screen that is missing or differs.
2. **Bug reviewer:** hunts for real defects: wrong edge cases, race conditions between phone messages and the game loop, state that survives a reconnect wrongly, anything that can throw.
3. **Security reviewer** (server and client packages): checks input validation, access control, secrets, the sheet integration and the HTTP headers against §8.
4. **Test reviewer:** checks that the tests would actually fail if the behaviour were wrong, that rejected actions and edge cases are covered, and that no test was weakened to pass.

Treat their findings as claims to verify, not as facts: reproduce each one, fix the real ones, and say which you rejected and why. After the last package, run one final review over the whole repository with fresh reviewers, including a **game-feel and robustness reviewer** who plays the running game in a browser with emulated phones, under throttled network and with a phone dropping and rejoining mid-match, and reports anything that stutters, desyncs, gets stuck or feels unresponsive.

## Verification

The course grades tests on whether they cover accepted actions, rejected actions and edge cases, and whether they all pass on `main`. Write tests with `node:test` as you build each part, not at the end.

- **Rules and combat:** knockback grows with damage and shrinks with weight; a hit from 195 % to over 200 % is a burnout; crossing each blast zone is a KO; respawn invincibility; lives 1, 2 and 3; the match ends only when one player is left; jump and exactly one double jump per airtime; attacks and specials go left, right or up according to where the fighter looks.
- **Each of the 8 specials:** hits inside its range, misses outside it, emits the phone feedback event for the hit player only. Ring Light Flash hits exactly one opponent, the nearest.
- **Items and hazards:** each item's effect, the maximum of three, tart never heals below 0 %, sardine breaks after five swings; never two hazards at once, the warning always precedes the effect, the train strike.
- **Rejected actions:** gamertag too short, too long, illegal characters, starting with `=`; duplicate gamertag in a different case; PINs that do not match, are not four digits; wrong PIN, and lockout after five; tampered and expired session tokens; joining a missing room; a fifth player; a non-host starting a match or submitting a result; a result for a player who is not in the room; a duplicate result; an implausible result; malformed, oversized and unknown WebSocket messages.
- **Outage:** with the sheet client failing, the server stays up, results are queued and later written, and the API returns clear errors.
- **End to end:** start the server on a random port, connect one fake host and four fake controllers over real WebSockets, register and log in, run a full match with the real game logic to a winner, and assert the result reaches the store and the leaderboard.
- **Browser smoke test (Playwright, dev dependency):** load the host page, then open the controller in an emulated iPhone and an emulated Android phone, register, pick fighters, ready up, start, press buttons, and assert the fighters move on the host and no page logs a console error.

Add a GitHub Actions workflow that runs `npm ci`, `npm test` and `npm audit --audit-level=high` on every push and pull request.

Before you finish, start the real server locally and play it yourself in a browser with the host page and at least two emulated phones. Look at screenshots of every screen on host and phone, in both an iPhone and an Android viewport, and fix what looks wrong: clipped text, overlapping buttons, unreadable name tags, sprites that float above or sink into platforms. A test suite that passes while the game looks broken is not done.

## Grading criteria check

When everything is built, write `docs/CRITERIA_CHECK.md`. For each of the six criteria below, state what in the repository satisfies the top level, with the evidence: the test names, the file paths, the command output. If something does not reach the top level, say so plainly and say what is missing. Do not claim anything you did not run.

1. **It works (20 %)**: "The deployed app runs all workflows without errors, including invalid input."
2. **User interface and experience (20 %)**: "The interface fits the problem; workflows are direct, and results and errors are clearly shown to the user."
3. **Scope and ambition (20 %)**: "Substantial features that go well beyond a solo project, implemented consistently."
4. **Verification (10 %)**: "Tests cover accepted and rejected actions and edge cases, and all pass on `main`."
5. **Security (10 %)**: "Access control and input validation are enforced; dependencies are minimal, pinned, and without known vulnerabilities."
6. **Repository walkthrough (20 %)**: "Members explain how the project is built, why, what its limits are, and how it could change."

## Boundaries

- Never commit a secret. Create `.gitignore` with `.env` and `node_modules` before anything else, and commit `.env.example` with names only.
- Original work only: no Nintendo names, characters, sounds or look. The Nova SBE logo on the campus roof is already redrawn in `design/final/stages.js`; keep it, and credit it in `CREDITS.md` (source: Wikimedia Commons `Nova_logo.png`, author Nova SBE, CC BY-SA 4.0, trademark of the school).
- All game and repository text is in English, with no Portuguese slang. Place names stay as they are.
- Work on a new branch named `build` made from the current one, and commit in small, readable steps with clear messages. When everything is built, reviewed and the checks pass, push that branch and open a pull request into `main` with `gh pr create`. The description summarises what was built, the test and audit results as actually run, and what is still open. **Do not merge it**, do not push to `main` directly, and do not deploy: merging decides what gets graded and deploying needs my accounts. Before pushing, check the diff once more for secrets and for anything from `.local/`.

## When you are done

Give me a short report: what was built, the test and audit results as actually run, anything that is not finished or not at the top level of a criterion, the pull request link, and the manual steps left for me in order (create the sheet, set the secrets, deploy on Render, set up the Mac mini backup, put the URL in the README, test with real phones in the demo room, merge to `main`).
