# Notes for coding agents (and humans in a hurry)

NOVA Brawl: a browser party fighter. A laptop shows the game, phones are the controllers. Read `docs/GAME_SPEC.md` before changing behaviour and `docs/WALKTHROUGH.md` to find your way around.

## Commands

```bash
npm ci                         # install exactly what package-lock.json says
npm start                      # http://localhost:3000 (host page), /play (phone page)
npm test                       # game rules + server tests (node:test), must stay green
npm run test:browser           # the five browser tests; once before: npx playwright install chromium
npm audit --audit-level=high   # must report nothing
```

Node 22 or newer. No build step: the browser loads the ES modules as they are.

## Where things are

| Folder | What |
|---|---|
| `src/game/` | Pure game rules. No DOM, no network, no clock, no `Math.random`. All tuning values in `config.js`. |
| `server/` | HTTP, WebSocket rooms, accounts, results, store. Limits in `config.js`. |
| `google-sheet/` | `Code.gs`, the script that runs inside the Google Sheet (Apps Script) and reads and writes its cells. Pasted into the sheet by hand: `docs/SETUP_SHEETS.md`. |
| `public/host/`, `public/play/`, `public/shared/` | Big screen, phone, shared art/sound/connection. |
| `tests/game/`, `tests/server/`, `tests/browser/` | Tests per package. Shared helpers in `tests/helpers/`. |
| `docs/` | The spec (`GAME_SPEC.md`), the decision log, the walkthrough, setup and deploy guides. `docs/archive/` holds the build prompts and the first brainstorm: history, not rules. |
| `design/` | Art reference (`final/`), the option rounds the team chose from (`options/`) and the first mock-up (`mockup/`). Not served and not used by the game. |

## Rules

1. **Branches.** Never commit to `main` directly. Work on a branch named `type/topic` (`feature/`, `fix/`, `docs/` or `chore/`, then a few words in lower case with hyphens, for example `fix/sheet-bot-winner`) and open a pull request. Only a team member merges, because `main` is what gets graded and deployed.
2. **Secrets.** Never commit a secret. Real values live only in `.env` (git-ignored) and on the host. `.env.example` lists names only. Do not print secrets in logs or tests.
3. **Never edit a test to make it pass.** If a test fails, the code is wrong or the rule changed. If the rule changed, change `docs/GAME_SPEC.md` and `docs/DECISIONS.md` first, then the test, and say so in the commit.
4. **Dependencies.** Runtime dependencies are `ws` and `qrcode`, pinned to exact versions. Do not add one without a decision in `docs/DECISIONS.md`.
5. **No inline scripts or styles** in the HTML: the server's Content-Security-Policy blocks them.
6. **Text shown to players is English**, without Portuguese slang. Text from other players is always written with `textContent`, never `innerHTML`.
7. **Game rules stay pure.** Anything random uses `src/game/rng.js`, so a match can be replayed in a test.
8. Keep commits small, with a message that says what changed and why.
