# NOVA Brawl

> **Scan. Pick. Brawl.** A party platform fighter set at Nova SBE. Your phone is the controller.

Team project for **Introduction to Programming**. The game is written in JavaScript instead of the course's Python; the teaching staff approved this ([D-042](docs/DECISIONS.md)).

One to four players scan a QR code, their phones turn into controllers, and they fight on the **Nova SBE Campus**, at **Carcavelos Beach** and in **Bairro Alto**. Every hit raises your damage %, and the higher it gets, the further you fly. Get knocked off the screen or reach 200 % and you lose a life. The last player standing wins. Short of players? The host fills free places with **bots** (Freshman, Intern, Erasmus), so even one person can play a full match.

## Objectives

- Build a party fighter that one to four people in the same room play together: the laptop is the shared screen and every player's phone is the controller, with no app to install.
- Let one person play a full match alone, by filling free places with bots at three levels (Easy, Medium, Hard).
- Keep player accounts and match results between sessions in a Google Sheet that only the server can reach, so a leaderboard builds up over time.
- Keep the game rules separate from the browser so they can be tested automatically: 551 tests for the rules and the server and five browser tests, run on every push.

## Deployed app

**URL:** <https://nova-brawl.onrender.com> (how it is hosted: [`docs/GAME_SPEC.md`](docs/GAME_SPEC.md) §9)

The free host sleeps when nobody uses it. Open the URL two minutes before playing.

## Team

| Name | Student number |
|---|---|
| Benedikt Heuser | 75868 |
| Valentina Larissa Brocar | 80832 |
| Bastian Volkery | 80448 |

## Run it locally

You need [Node.js](https://nodejs.org) 22 or newer.

```bash
npm ci        # install the exact dependency versions
npm start     # start the server
```

Then open **http://localhost:3000** on the laptop and click **Open a room**.

- Without any configuration the server keeps accounts and scores in memory (they are gone when it stops). To use the Google Sheet, follow [`google-sheet/README.md`](google-sheet/README.md).
- **Phones** must be able to reach the laptop. Either use the deployed URL, or put laptop and phones in the same Wi-Fi and open the page through the laptop's network address (for example `http://192.168.1.20:3000`) instead of `localhost`, so the QR code points to an address the phones can open.
- Every human plays from a phone; there are no keyboard players. Two browser tabs on a computer can stand in for phones while developing: open `/play` in each, or open one and add bots in the lobby.

## Run the tests

```bash
npm test                          # game rules and server (551 tests, about 15 seconds)
npx playwright install chromium   # once, for the browser test (on a fresh Linux: add --with-deps)
npm run test:browser              # five browser tests: host page + emulated iPhone and Android phones
npm audit --audit-level=high      # dependency check
```

The same commands run on every push in GitHub Actions (`.github/workflows/ci.yml`).

### What the tests cover and what they do not

Covered by automated tests:

- **Game rules** (`tests/game/`): movement, ledge grab, combat and knockback, every special, every item, every hazard, the stomp, KOs and the end of a match, scoring, the tutorial and the bots (including the measured strength of the three levels). Every rule runs without a browser, and randomness comes from a seed, so each match can be replayed exactly.
- **Server** (`tests/server/`): registration, login, the PIN lock, sessions, rooms, the map vote, bots on the server, the intro, reconnects, the crown, the result checks (accepted and refused results), malformed and oversized messages, rate limits, HTTP headers, and a sheet outage with recovery. The Apps Script `google-sheet/Code.gs` runs in Node against a stand-in spreadsheet.
- **Browser** (`tests/browser/`, five tests): a real Chromium with the host page and emulated iPhone and Android phones plays whole matches: register, pick, vote, play, results, bots, the tutorial, a host page that loses its connection, removing a player and logging out.

Not covered by automated tests, checked by hand when playing:

- **Real phones.** The browser tests emulate phones in Chromium. Safari on a real iPhone, vibration on Android, touch on a real screen and the rotation lock are only tried by hand.
- **The real Google Sheet.** Tests never touch it (GAME_SPEC §4). The server's sheet client runs against a stand-in, and `Code.gs` against a stand-in spreadsheet, so Google's own limits and delays are not tested.
- **The deployment.** Render, its sleep after 15 minutes and the backup on the Mac mini are checked by hand with `/healthz` (GAME_SPEC §9).
- **Real network conditions.** The tests cover connections that drop or go silent (a phone or host page that stops talking, then reconnects), but not real latency or packet loss. How the game feels on campus Wi-Fi is checked by playing.
- **Look and sound.** Whether the art, the animations and the synthesised sound look and sound right is judged by people, not by tests.

## How to play

1. **Laptop:** open the URL, click *Open a room*. A QR code and a 4-letter room code appear.
2. **Phones:** scan the QR code. New players choose a gamertag (3 to 12 letters, numbers or `_`) and a 4-digit PIN; returning players are logged in automatically.
3. **Pick a fighter** by swiping, tap **Ready!**
4. **Laptop:** add bots if you like (*Add bot*, *Remove bot*; a click on a bot's card changes its fighter, and its ◀ ▶ arrows set it to Easy, Medium or Hard), leave the stage on **Vote** (the default) or pick one, choose the number of lives, then press *Start*. Everyone in the lobby must be Ready, and a match needs at least two fighters, bots included. A match with only one person in it is a practice match and gives no points. With Vote, every phone shows the three stages: swipe, tap **Vote!**; the vote ends when everyone has voted or after 10 s.
5. **Fight.** Turn the phone sideways. When someone plays their first match, a short guide comes first: everyone tries the joystick and the three buttons, then the match begins.

The left half of the phone is a joystick: put your thumb down anywhere there and drag. The right half has three buttons, labelled **A** (Attack), **J** (Jump) and **S** (Special).

| Control | What it does |
|---|---|
| Joystick left / right | Move |
| Joystick up | Look up: attacks and specials then go upward |
| Joystick down | Drop through a platform, fall faster |
| **Jump** (J) | Jump; press again in the air for one double jump. Falling next to the main ground while facing it, you grab its corner: Jump climbs up, down lets go |
| **Attack** (A) | Normal attack in the direction you look. In the air without up: the **stomp**, a straight drop with a shockwave on landing |
| **Special** (S) | Your fighter's special; the yellow strip shows when it is ready again |

**Items** appear on the platforms every few seconds: walk into them. Pastel de Nata heals, Bifana makes you heavier, the Lucky Rooster makes you invincible for 5 s; Sardine, Book, Megaphone, Cork Shield and Azulejo are held and change your next attacks. Whoever touches the **Group Project** is stuck with it: hit someone to pass it on before its 5 s fuse runs out.

Each stage has three **hazards**: the Cascais Line train (sometimes late!), Bad Wi-Fi and Sudden Rain on the campus; the Big Wave, Seagulls and the Midday Sun at the beach; the Drunk Crowd, Drinks and Fireworks in Bairro Alto. Watch the top right corner of the big screen: every hazard is announced with its name and a 3, 2, 1. `P` or `Esc` pauses and resumes the match on the laptop (the line at the bottom of the big screen says so); phones cannot pause.

## Documentation

| Document | What's inside |
|---|---|
| [`docs/GAME_SPEC.md`](docs/GAME_SPEC.md) | The spec: rules, controls, fighters, stages, security, hosting, screens, brand |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Every decision in one log, with the alternative not taken and the reason |
| [`google-sheet/README.md`](google-sheet/README.md) | Connecting the Google Sheet |
| [`CREDITS.md`](CREDITS.md) | Logo, fonts and software credits |
| [`AGENTS.md`](AGENTS.md) | Commands, folder layout and the rules for every change (branches, secrets, tests) |

## How it was built

The team decided what to build in planning sessions; every decision is in [`docs/DECISIONS.md`](docs/DECISIONS.md) and the result is [`docs/GAME_SPEC.md`](docs/GAME_SPEC.md). Claude, Anthropic's AI model, wrote most of the code in Claude Code sessions, in three packages: the rules, the server and the client (D-094). After each package, separate reviewer agents that had not written the code checked it against the spec, looked for bugs and security problems and tried to break the tests; every finding was reproduced before it was fixed, and each fixed defect in the rules and the server has a regression test (D-121).

The commits of the first build and many later ones are authored by Claude or carry a `Co-Authored-By: Claude` line. Later build rounds, for example the bots and the bot levels, were also written in Claude sessions but committed under Bastian Volkery's name without that line. Decisions Claude made while building are marked "Claude" in the Who column of `DECISIONS.md`; the team confirmed them.

## Tech

- **JavaScript** everywhere: a small Node.js server (static files, rooms, WebSocket relay, accounts) and plain browser pages drawing on a Canvas. No framework, no build step.
- The **match runs in the host page**; the server only passes messages on. The rules are pure code in `src/game/` and are tested without a browser.
- A **Google Sheet** stores players and results, reached only by the server through an Apps Script web app.
- Two runtime dependencies, pinned: `ws` and `qrcode`.

## Where things are

| Folder | What |
|---|---|
| `src/game/` | The rules: movement, combat, specials, items, hazards, bots, scoring. No DOM, no network. All tuning values in `src/game/config.js`. |
| `server/` | The server: HTTP, WebSocket rooms, accounts, result checks. Its limits are in `server/config.js`. |
| `server/store/` | Storage: `sheets.js` talks to the Google Sheet, `memory.js` keeps everything in memory (used without a sheet and in every test). |
| `google-sheet/` | `Code.gs`, the script that runs inside the Google Sheet. |
| `public/host/` | The big screen (laptop): lobby, map vote, match, results. |
| `public/play/` | The phone: login, fighter select, gamepad. |
| `public/shared/` | Art, sound and the connection code used by both pages. |
| `tests/game/`, `tests/server/`, `tests/browser/` | The tests for the rules, the server and the whole app in a browser. |

## Known limits and how it could change

Known limits:

- **The host page is trusted with the result.** The match runs in the laptop's browser, so the server cannot see what happened. It only checks that a result is possible (players, duration, damage, KOs; `server/results.js`, D-111, D-122). A tampered host page could still report a plausible fake result.
- **The Google Sheet is slow and rate-limited** (one to three seconds a request). The game never waits for it: results are queued and written in the background, and the leaderboard is cached for 60 s.
- **Rooms, the result queue and the login lock live in memory** (D-118). A restart of the server ends open rooms and loses results that were still waiting for the sheet. Accounts and saved results are in the sheet and survive.
- **The free host sleeps** after 15 idle minutes, so the first visit after a pause waits until it has woken up.
- **Real phones are only tested by hand** (see "What the tests cover and what they do not").

How it could change:

- **A database instead of the sheet.** Storage sits behind one interface (`server/store/`); a new store class with the same methods as `memory.js` replaces the sheet without touching rooms, rules or pages.
- **Results the server can trust.** Running the rules (`src/game/`, which has no DOM) on the server instead of the host page would remove the trusted host. The rules already run headless in the tests.
- **More fighters, stages, items or hazards.** Their numbers are in `src/game/config.js`, their platforms in `src/game/stages.js`, their behaviour in `src/game/` and their look in `public/shared/art/`.
- **A stronger bot level.** Bot levels are number sets in `config.js` (`bots.easy`, `medium`, `hard`) for the same code (D-176).
