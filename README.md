# NOVA Brawl

> **Scan. Pick. Brawl.** A party platform fighter set at Nova SBE. Your phone is the controller.

Team project for **Introduction to Programming**.

Two to four players scan a QR code, their phones turn into controllers, and they fight on the **Nova SBE Campus**, at **Carcavelos Beach** and in **Bairro Alto**. Every hit raises your damage %, and the higher it gets, the further you fly. Get knocked off the screen or reach 200 % and you lose a life. The last player standing wins.

## Deployed app

**URL:** <https://nova-brawl.onrender.com> (how it is deployed: [`docs/DEPLOY.md`](docs/DEPLOY.md))

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

- Without any configuration the server keeps accounts and scores in memory (they are gone when it stops). To use the Google Sheet, follow [`docs/SETUP_SHEETS.md`](docs/SETUP_SHEETS.md).
- **Phones** must be able to reach the laptop. Either use the deployed URL, or put laptop and phones in the same Wi-Fi and open the page through the laptop's network address (for example `http://192.168.1.20:3000`) instead of `localhost`, so the QR code points to an address the phones can open.
- Every fighter is played from a phone; there are no keyboard players. Two browser tabs on a computer can stand in for phones while developing: open `/play` in each.

## Run the tests

```bash
npm test                          # game rules and server (about 400 tests, a few seconds)
npx playwright install chromium   # once, for the browser test
npm run test:browser              # host page + emulated iPhone + emulated Android phone
npm audit --audit-level=high      # dependency check
```

The same commands run on every push in GitHub Actions (`.github/workflows/ci.yml`).

## How to play

1. **Laptop:** open the URL, click *Open a room*. A QR code and a 4-letter room code appear.
2. **Phones:** scan the QR code. New players choose a gamertag (3 to 12 letters, numbers or `_`) and a 4-digit PIN; returning players are logged in automatically.
3. **Pick a fighter** by swiping, tap **Ready!**
4. **Laptop:** leave the stage on **Vote** (the default) or pick one, choose the number of lives, then press *Start*. With Vote, every phone shows the three stages: swipe, tap **Vote!**; the vote ends when everyone has voted or after 10 s.
5. **Fight.** Turn the phone sideways.

The left half of the phone is a joystick: put your thumb down anywhere there and drag.

| Control | What it does |
|---|---|
| Joystick left / right | Move |
| Joystick up | Look up: attacks and specials then go upward |
| Joystick down | Drop through a platform, fall faster |
| **Jump** | Jump; press again in the air for one double jump |
| **Attack** | Normal attack in the direction you look |
| **Special** | Your fighter's special; the yellow strip shows when it is ready again |

Watch the top right corner of the big screen: every hazard is announced with its name and a 3, 2, 1. `P` or `Esc` pauses and resumes the match on the laptop (the line at the bottom of the big screen says so); phones cannot pause.

## Documentation

| Document | What's inside |
|---|---|
| [`docs/WALKTHROUGH.md`](docs/WALKTHROUGH.md) | **How the project is built, why, its limits and how it could change** |
| [`docs/GAME_SPEC.md`](docs/GAME_SPEC.md) | The spec: rules, controls, fighters, stages, security, screens |
| [`docs/CRITERIA_CHECK.md`](docs/CRITERIA_CHECK.md) | The grading criteria and the evidence for each |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Every decision in one log |
| [`docs/DEPLOY.md`](docs/DEPLOY.md), [`docs/SETUP_SHEETS.md`](docs/SETUP_SHEETS.md) | Deploying, and connecting the Google Sheet |
| [`docs/TEAM_TASKS.md`](docs/TEAM_TASKS.md) | Small follow-up tasks for each member |
| [`docs/DEMO.md`](docs/DEMO.md) | Demo mode: planned, not built |
| [`docs/SPECS.md`](docs/SPECS.md), [`docs/CONCEPT.md`](docs/CONCEPT.md), [`docs/BRAINSTORM.md`](docs/BRAINSTORM.md) | Technical overview, brand and voice, ideas that were not built |
| [`design/`](design/) | The final art reference and the option rounds the team chose from |
| [`CREDITS.md`](CREDITS.md) | Logo, fonts and software credits |

## Tech

- **JavaScript** everywhere: a small Node.js server (static files, rooms, WebSocket relay, accounts) and plain browser pages drawing on a Canvas. No framework, no build step.
- The **match runs in the host page**; the server only passes messages on. The rules are pure code in `src/game/` and are tested without a browser.
- A **Google Sheet** stores players and results, reached only by the server through an Apps Script web app.
- Two runtime dependencies, pinned: `ws` and `qrcode`.
