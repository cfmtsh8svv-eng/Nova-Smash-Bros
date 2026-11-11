# NOVA Brawl

> **Scan. Pick. Brawl.** A party platform fighter set at Nova SBE. Your phone is the controller.

Team project for **Introduction to Programming**.

Two to four players scan a QR code, their phones turn into controllers, and they fight on the **Nova SBE Campus**, at **Carcavelos Beach** and in **Bairro Alto**. Every hit raises your damage %, and the higher it gets, the further you fly. Get knocked off the screen or reach 200 % and you lose a life. The last player standing wins.

## Deployed app

**URL:** *added after the first deployment*

## Team

| Name | Student number |
|---|---|
| Benedikt Heuser | 75868 |
| Valentina Larissa Brocar | 80832 |
| Bastian Volkery | 80448 |

## Run it locally

*Implementation has not started. The commands below are the planned ones and are confirmed by the build.*

```bash
npm ci
npm start        # then open http://localhost:3000 on the laptop
npm test         # runs the test suite
```

## Documentation

| Document | What's inside |
|---|---|
| [`docs/GAME_SPEC.md`](docs/GAME_SPEC.md) | **The spec the build follows**: rules, controls, fighters, stages, architecture, security, hosting |
| [`docs/BUILD_PROMPT.md`](docs/BUILD_PROMPT.md) | The prompt that builds the game in one session, including tests and the grading-criteria check |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Every decision in one log |
| [`design/final/`](design/final/) | Final art for the 8 fighters and 3 stages (open `reference.html` in a browser) |
| [`design/options/`](design/options/) | The option rounds the team chose from |
| [`docs/CONCEPT.md`](docs/CONCEPT.md), [`docs/SPECS.md`](docs/SPECS.md), [`docs/BRAINSTORM.md`](docs/BRAINSTORM.md) | Earlier concept work, historical in parts |

## Tech

- **JavaScript**: a small Node.js server (static files, rooms, WebSocket relay, accounts) and plain browser clients drawing on Canvas
- **Google Sheet** for players and high scores, reached only by the server
- Tests with Node's built-in test runner
