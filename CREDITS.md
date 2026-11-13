# Credits

NOVA Brawl is original work by the team named in the [README](README.md), built with the help of Claude (see the commit history). It uses no characters, names, art, music or sounds from any existing game.

## Nova SBE logo

The campus stage shows the Nova SBE logo on the roof. It was **redrawn in code** (`public/shared/art/stages.js`, function `novaLogo`) from the official mark.

- Source: Wikimedia Commons, file `Nova_logo.png`
- Author: Nova SBE
- Licence of the source file: CC BY-SA 4.0
- The logo is a **trademark of Nova School of Business and Economics**. It is used here only to show the real place in a student project and does not suggest that the school publishes or endorses the game.

## Fonts

Both fonts are bundled in `public/shared/fonts/` and served from our own server. Their licence texts are next to them.

| Font | Authors | Licence |
|---|---|---|
| Bungee | The Bungee Project Authors | SIL Open Font License 1.1 (`OFL-Bungee.txt`) |
| Nunito | The Nunito Project Authors | SIL Open Font License 1.1 (`OFL-Nunito.txt`) |

## Software

| Package | Use | Licence |
|---|---|---|
| [ws](https://github.com/websockets/ws) 8.22.2 | WebSocket server | MIT |
| [qrcode](https://github.com/soldair/node-qrcode) 1.5.4 | QR code for the join link | MIT |
| [Playwright](https://playwright.dev) 1.65.0 | Browser tests (development only) | Apache 2.0 |

## Sound and art

All sound effects and music are synthesised in the browser (`public/shared/audio.js`); there are no sound files. All fighters and stages are drawn in code (`public/shared/art/`). Real places shown in the stages (Nova SBE campus, Carcavelos Beach, Bairro Alto and the landmarks behind them) are drawn from scratch; shop names appear only as scenery.
