# NOVA Brawl: Demo Mode

Demo mode is a preset for the course presentation: a match of at most two minutes, one life, faster hazards and four fighters. It is a host's tool. Nothing on the screen offers it, and the phones never mention it. The decisions behind it are D-187 to D-207 in [`DECISIONS.md`](DECISIONS.md).

## Switching it on and off

On the host page, in the **lobby**, press **Shift+D**. The lobby then shows `DEMO MODE (to quit press Shift + D)` in its bottom right corner; nothing else appears. Press Shift+D again in the lobby to switch it off: the line goes away and nothing else is shown.

Shift+D does nothing anywhere else: not on the title screen, not during the stage vote, the intro, the match or the results. It is ignored while a text field has the focus. Nothing is stored, so a reload of the host page switches demo mode off.

## What changes

| | Normal game | Demo mode |
|---|---|---|
| Lives | 1, 2 or 3, chosen in the lobby | 1 (the lives buttons are locked; switching demo mode off brings back the earlier choice) |
| End of the match | When one player is left | When one player is left, or after **120 s** of fighting |
| At the time cap | | Among the fighters still in the match: more lives left wins, then the lower current damage %, then more damage dealt. The fighters freeze and **TIME!** appears, then the podium as usual. |
| Hazards | Next warning 10 to 15 s after a hazard ends | 5 to 8 s |
| Big screen, bottom centre | `Press P or Esc to pause` | The time left as `m:ss`. P and Esc still pause, and the clock stops while paused. |
| Fighters | All eight | Maastricht Blondie, Lisboa OG, Finance Bro, Surfer Girl. The phones show only these; a phone on another fighter is moved to Maastricht Blondie and has to tap Ready again. Bots play only these. Two players may pick the same one. |
| Result | Saved (with at least two logged-in players) | **Never saved**: no sheet row, no points, no achievements, no crowns, no count towards the hourly limit. The big screen and the phones say "Demo match: not saved." |

The stage vote, the intro, the fighter select and the items and hazards switches work as in the normal game.

## Changing the values

Every demo value is in one object, `DEMO_SETTINGS` in `src/game/config.js`:

```js
export const DEMO_SETTINGS = {
  lives: 1,
  timeCapS: 120,
  hazardMinS: 5,
  hazardMaxS: 8,
  fighters: ['maastricht_blondie', 'lisboa_og', 'finance_bro', 'surfer_girl'],
};
```

Change a value there and nothing else: the server, the host page, the phones and the tests read it from there. For example `lives: 2` gives two lives per player, and the server then expects two lives in a demo start. Fighter ids are the keys of `FIGHTER_STATS` in the same file. A value that cannot be used falls back safely: lives other than 1, 2 or 3 become 3, an unusable `timeCapS` means no time cap, unusable hazard times become 10 to 15 s, unknown fighter ids are dropped, and an empty list means all eight (D-206).

Run `npm test` after a change. The test that pins the agreed values (`tests/game/demo.test.js`, "the demo values agreed on 2026-11-13") fails on purpose until it is updated with the new value.

## Presenter's checklist

1. Open the deployed URL **two minutes before** presenting: the free host sleeps when idle and takes up to a minute to wake.
2. Click **Open a room**, then press **Shift+D** in the lobby.
3. Check the line `DEMO MODE (to quit press Shift + D)` in the bottom right corner and that the lives show 1 life.
4. Let the players scan the QR code and pick a fighter. Start when the hint says everyone is ready.

## What was agreed on 2026-11-11

The first agreement, kept for the history. The rows marked "replaced" were changed by the team's decisions of 2026-11-13.

| Topic | Agreement | Now |
|---|---|---|
| Purpose | A host toggle in the lobby that makes a match fit the presentation | Replaced by D-187: Shift+D in the lobby, no button |
| Length | About 2 minutes of gameplay (hard cap 120 s) | Kept (D-190) |
| Lives | 1 life per player | Kept (D-189) |
| Hazards | More frequent: every 15 s instead of every 25 to 40 s | Replaced by D-191: 5 to 8 s (the normal game has 10 to 15 s since D-143) |
| End at the cap | The player with the lowest damage % wins; a tie goes to the most damage dealt | Replaced by D-190: more lives left first, then lowest damage %, then damage dealt |
| Normal mode | Unchanged: lives 1, 2 or 3, no time limit, ends when one player is left | Kept |
| Fighter select | Left open by the team for the demo version | Replaced by D-193: four fighters |
