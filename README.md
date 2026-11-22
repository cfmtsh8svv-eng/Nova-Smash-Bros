# NOVA Brawl

> **Scan. Pick. Brawl.** A party platform fighter set at Nova SBE. Your phone is the controller.

Team project for **Introduction to Programming**. The game is written in JavaScript instead of the course's Python; the teaching staff approved this ([D-042](docs/DECISIONS.md)).

One to four players scan a QR code, their phones turn into controllers, and they fight on the **Nova SBE Campus**, at **Carcavelos Beach** and in **Bairro Alto**. Every hit raises your damage %, and the higher it gets, the further you fly. Get knocked off the screen or reach 200 % and you lose a life. The last player standing wins. Short of players? The host fills free places with **bots** (Freshman, Intern, Erasmus), so even one person can play a full match.

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
npm test                          # game rules and server (547 tests, about 20 seconds)
npx playwright install chromium   # once, for the browser test
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
