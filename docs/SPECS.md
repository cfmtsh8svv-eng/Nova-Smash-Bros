# NOVA Brawl: Technical Overview

> **Rewritten after the build (2026-11-11).** The earlier version of this file was a plan for a Python and Pygame game for six players. That plan was replaced before the build (decisions D-042 onwards), so it was removed here; it is in the git history. This page is a short map of what was actually built.

| | |
|---|---|
| **The spec** | [`GAME_SPEC.md`](GAME_SPEC.md): rules, controls, fighters, stages, security, screens |
| **How and why it is built** | [`WALKTHROUGH.md`](WALKTHROUGH.md) |
| **Every decision** | [`DECISIONS.md`](DECISIONS.md) |
| **Running and deploying** | [`../README.md`](../README.md), [`DEPLOY.md`](DEPLOY.md), [`SETUP_SHEETS.md`](SETUP_SHEETS.md) |
| **Language** | JavaScript (Node.js 22 on the server, ES modules in the browser) |

## The three packages

| Package | Folder | What it does | Tests |
|---|---|---|---|
| Game rules | `src/game/` | The whole match as pure logic: movement, attacks, the eight specials, items, hazards, KOs, the result. No screen, no network, no clock. | `tests/game/` |
| Server | `server/`, `apps-script/` | Serves the pages, keeps rooms, passes messages between phones and the host page, accounts, results, leaderboard, Google Sheet. | `tests/server/` |
| Client | `public/` | `host/` is the big screen (lobby, match, results), `play/` is the phone (accounts, fighter select, gamepad), `shared/` is art, sound and the connection. | `tests/browser/` |

## How the parts talk

```
phone  --input-->  server  --input-->  host page (runs the match at 60 steps per second)
phone  <--status, phase, feedback--  server  <--  host page
host page  --result-->  server  --https-->  Apps Script web app  -->  Google Sheet
```

- Messages are small JSON objects over one WebSocket per page. `server/rooms.js` lists every message type and who may send it.
- The phone sends its seven buttons as one number (a bit mask) whenever they change, plus a heartbeat four times a second.
- The host page is the only place where the match is simulated. The server never sees positions or hits, only the final result.

## Numbers that matter

| Value | Where |
|---|---|
| 1280 x 720 playing field, 60 steps per second | `src/game/config.js` |
| All tuning values (physics, attacks, specials, items, hazards) | `src/game/config.js` |
| All server limits (sizes, rates, timeouts) | `server/config.js` |
| Joystick dead zone and thresholds | `public/play/controls.js` |

## Commands

```bash
npm ci                  # install the exact dependency versions
npm start               # run the server on http://localhost:3000
npm test                # game rules and server tests
npm run test:browser    # browser smoke test (once: npx playwright install chromium)
npm audit --audit-level=high
```
