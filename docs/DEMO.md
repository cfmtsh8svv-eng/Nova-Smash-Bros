# NOVA Brawl: Demo Mode (planned, not built yet)

Demo mode is a preset for the course presentation. It is **not part of the first build**. This file keeps everything the team agreed on 2026-11-11 so it can be added later.

## Why

The presentation slot is short. A normal match runs until one player is left and can take longer than the slot allows.

## What was agreed

| Topic | Agreement |
|---|---|
| Purpose | A host toggle in the lobby that makes a match fit the presentation |
| Length | About **2 minutes of gameplay** (hard cap 120 s) |
| Lives | **1 life** per player |
| Hazards | More frequent: every 15 s instead of every 25 to 40 s |
| End at the cap | The player with the **lowest damage %** wins; a tie goes to the most damage dealt |
| Normal mode | Unchanged: lives 1, 2 or 3, no time limit, ends when one player is left |
| Fighter select | Left open by the team for the demo version |

## Notes for whoever builds it

- Match settings already live in one settings object (lives, hazard interval, time cap), and the time-cap rule exists in `src/game/match.js` with a test. In the rules, demo mode only has to set those values.
- Outside the rules three small things are needed: a toggle in the lobby (`public/host/main.js`), the cap in the `match_start` message, and the server's result check (`server/results.js`) accepting a match that ended at the cap. Today it refuses those on purpose, because the normal game has no time limit.
- Tests to add: the match ends at 120 s; lowest damage wins; the tie-break; a normal match is unaffected.
- Open the deployed URL two minutes before presenting, because the free host sleeps when idle.
