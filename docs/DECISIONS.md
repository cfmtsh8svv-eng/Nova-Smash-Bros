# NOVA Brawl: Decision Log

The **single source of truth** for every decision about NOVA Brawl. [`GAME_SPEC.md`](GAME_SPEC.md) is the spec that follows from it; [`WALKTHROUGH.md`](WALKTHROUGH.md) explains how it was built.

## How to use this file

1. **New decision** → add a row with the next ID (`D-0xx`), today's date and who decided.
2. **Changed decision** → never delete or rewrite the old row. Set its status to **Superseded by D-0xx** and add a new row.
3. **Open question** → add it to [Open decisions](#open-decisions) (`O-xx`). Once it's decided, move it up as a `D-0xx` row and mark the `O-xx` row **Closed → D-0xx**.
4. Then update `GAME_SPEC.md` (and `WALKTHROUGH.md` if the way it is built changes) to match.

**Status values:** `Decided` · `Proposal` (suggested by Claude, not yet confirmed by the team) · `Superseded by D-0xx` · `Open`

**Who:** `Team` = the team decided (Q&A or chat) · `Claude` = Claude proposed it while writing the docs

---

## Decided

### Kick-off Q&A (2026-11-03)

| ID | Topic | Decision | Alternatives considered | Why | Who | Status |
|---|---|---|---|---|---|---|
| D-001 | Tech stack | **Python + Pygame** | JavaScript + Phaser, Godot / Unity | Fits the Intro to Programming course | Team | Superseded by D-042 |
| D-002 | Player count | **Up to 6 players** | 1 vs 1, 2–4, up to 8 | Big party rounds, still manageable | Team | Superseded by D-043 |
| D-003 | Setup | **Shared big screen + phones as controllers** | Phones with extra info only, everyone plays on their own phone | Party feeling, simple to build | Team | Decided |
| D-004 | Timeline | **3 weeks** (heavy use of AI assistance, so time is not the bottleneck) | 1–2 months, a full semester | Course deadline | Team | Decided |
| D-005 | KO system | **Hybrid**: % increases knockback, plus an instant KO ("BURNOUT!") at **200 %** | Pure knockback, fixed KO at 100 % | Genre feel plus a clear upper limit | Team | Decided |
| D-006 | Moveset | **Medium**: attack, special, double jump, shield, dodge, directional attacks | Simple (attack, special, jump, block), Complex (+ combos, grabs, ultimate) | Enough depth without too much animation work | Team | Superseded by D-047 |
| D-007 | Controller layout | **D-pad + buttons** (A, B, Jump, Shield) | Virtual joystick, tilt controls | Easier to build, clear retro feel | Team | Superseded by D-047 |
| D-008 | Game modes | **Stock mode with 3 lives only** | Time mode, bots, tournament | Focus on one mode and do it well | Team | Superseded by D-045 |
| D-009 | Brand / setting | **Nova SBE (Carcavelos campus)** | NOVA University Lisbon in general, a fictional brand | Campus + beach fit perfectly | Team | Decided |
| D-010 | Fighters | **Fictional student archetypes** | The team members themselves, Lisbon icons as fighters, a mix | Relatable, no consent issues | Team | Superseded by D-049 |
| D-011 | Art style | **Flat cartoon / vector** | Pixel art, photo collage, hand-drawn | Clean, modern look | Team | Superseded by D-048 |
| D-012 | Humour | **Cheeky but presentable** | Full party, completely harmless | Fun at parties, safe in the course demo | Team | Decided |
| D-013 | Campus hazards | **Bad Wi-Fi, Exam Season, Pop-Quiz Professor, Train (with strike chance)** | (all four were picked) | Shared student pain | Team | Superseded by D-052 |
| D-014 | Beach hazards | **Big Wave, Surfboard, Sunburn, Seagulls** | (all four were picked) | | Team | Superseded by D-052 |
| D-015 | Bairro Alto hazards | **Drinks, Tram 28, Steep Alleys** | Crowd pushing players (rejected) | | Team | Superseded by D-052 |
| D-016 | Tipsy effect | **Short effect (8 s) with an explanation on the phone** ("You're tipsy! ...") | Stage-based (3 drinks = KO), risk vs. reward | Funny without being frustrating | Team | Decided |
| D-017 | Universal items | **Custard Tart (heal), Book / Laptop (throw), Espresso (speed), Sardine (melee)** | | | Team | Superseded by D-053 |
| D-018 | Phone extras | **Vibration on hits, fighter select on the phone, own % and lives on the phone** | Emotes / taunts (not picked) | | Team | Decided |
| D-019 | Language | **English** for docs and game | German docs + English game, everything in German | International student body | Team | Decided (sharpened by D-023) |
| D-020 | Title | **NOVA Brawl** | Pancadaria na Nova, Carcavelos Clash, keep "Nova Smash Bros" | Own name, avoids the Nintendo trademark | Team | Decided |
| D-021 | Course requirements | **OOP (classes), tests, docs / README, live demo**, more to follow | | Course rules | Team | Decided (list may grow, see O-03) |
| D-022 | Team size | **2–3 people** | 4–5, 6+ | | Team | Superseded by D-055 |

### Follow-up (2026-11-03)

| ID | Topic | Decision | Alternatives considered | Why | Who | Status |
|---|---|---|---|---|---|---|
| D-023 | Language rule | **English only. No Portuguese slang or words** in the game or the docs | English with Portuguese slang ("Bora!", "Fixe!"; this was in concept v0.1) | Team request | Team | Decided |
| D-024 | Item & place names | Translated to English: **Custard Tart** (was Pastel de Nata), **Espresso** (was Bica / Galão), **Beer** (was Imperial), **Cherry Shot** (was Ginjinha), **Carcavelos Beach** (was Praia de Carcavelos), **Cascais Line** (was Linha de Cascais). **Bairro Alto** keeps its name because it's the stage name the team chose. | Keep the Portuguese food names | Follows from D-023 | Claude | Proposal (follows D-023, easy to revert) |
| D-025 | Fighter 6 | **Busker Bruno** (student musician with cape and guitar) replaces "Tuna Tomás" | Keep Tuna Tomás ("tuna" is a Portuguese student music group) | Follows from D-023 | Claude | Proposal |
| D-026 | Documentation set | `CONCEPT.md` (what & why), `SPECS.md` (how), `DECISIONS.md` (this file), `BRAINSTORM.md` (ideas not yet decided), `mockup/index.html` (visual mock-up) | Everything in one file | Clear roles, decisions in one place | Team | Decided |
| D-027 | Brainstorm ideas | Login, gamification, leaderboard, stats, achievements, skins and pause ideas are **collected in `BRAINSTORM.md`** and are **not in scope yet** | Put them straight into the specs | They need a scope decision first (O-08, O-09) | Team | Decided |

### Build-prep session (2026-11-11)

Decided by the team in the grilling session before the build. Full detail: [`GAME_SPEC.md`](GAME_SPEC.md). These rows also replace the Claude proposals D-025 and D-028 to D-041 wherever they conflict.

| ID | Topic | Decision | Alternatives considered | Why | Who | Status |
|---|---|---|---|---|---|---|
| D-042 | Tech stack | **JavaScript**: Node server + browser clients (Canvas), no framework | Python + Pygame (D-001) | Must run at a public URL on iOS and Android browsers. Approved by the teaching staff. | Team | Decided |
| D-043 | Player count | **2 to 4 players** | Up to 6 (D-002) | Readable on one screen | Team | Decided |
| D-044 | Connection | **Small Node server with rooms and WebSocket relay**, hosted free on Render, Mac mini + Tailscale Funnel as backup | Serverless WebRTC (risk on university Wi-Fi), Mac mini only | "No risk" and no cost | Team | Decided |
| D-045 | Match end and lives | Lives **1, 2 or 3** (host setting). Match ends when **one player is left**. No time limit. | Fixed 3 lives (D-008), 3-minute timer | | Team | Decided |
| D-046 | Demo mode | 1 life, hazards every 15 s, hard cap **120 s**, lowest damage wins at the cap | | Fits the presentation slot | Team | Deferred by D-096 |
| D-047 | Controls | Move, drop, **Jump, Attack, Special**. Attacks go in the facing direction. **No shield**, no directional attacks. | Medium moveset with shield and dodge (D-006, D-007) | Understandable in 10 seconds | Team | Changed by D-091 |
| D-048 | Art style | **HD pixel fighters** (81 px, shaded, outlined) on **detailed, realistic drawn stages** | Flat vector (D-011), 8-bit, 16-bit, photos | Team picked from visual options | Team | Decided |
| D-049 | Roster | **8 fighters**: Finance Bro, Maastricht Blondie, Bairro Chad, Surfer Girl, Wannabe Influencer, House DJ, Lisboa OG, Carcavelos Gang Member. Archetype names, no first names. | Six named archetypes (D-010, D-028) | | Team | Decided |
| D-050 | Attacks | One normal and one **unique special** per fighter. Specials hit only within a range and trigger vibration, flash and a message on the hit player's phone. During a special the fighter shows the special's item. | | | Team | Decided |
| D-051 | Colours | Name tags in the player colour, above the fighter and on the phone. Fighters keep their own colours; with a duplicate pick the later player's top takes the player colour. Items are held in the hand. | Whole fighter in player colour | | Team | Decided |
| D-052 | Hazards | **Two per stage**: Campus train + Bad Wi-Fi, Beach wave + seagulls, Bairro Alto tram + drinks | Eleven hazards (D-013 to D-015) | Quality over quantity | Team | Changed by D-061 |
| D-053 | Items | **Four**: Custard Tart, Espresso, Sardine, Book | Nine items (D-017) | | Team | Decided |
| D-054 | Accounts and storage | **Registration required**: gamertag + 4-digit PIN, stored with scores in a **Google Sheet** (no database) | Guest play, SQLite | Team decision | Team | Decided |
| D-055 | Team | **Three members** | 2 to 3 (D-022) | Course requires 3 to 4 | Team | Decided |
| D-056 | Stages | Platforms are part of the scenery, roofs are playable, the campus shows Nova lettering. Campus and beach by day, Bairro Alto by night. | Floating platforms | | Team | Decided |
| D-057 | Burnout | Instant KO at 200 % stays | | | Team | Decided |
| D-058 | Phone haptics | Vibration on Android; flash + sound on every phone | Vibration only | iPhone browsers cannot vibrate | Claude | Decided |
| D-059 | Official Nova logo | Lettering only in the art; the official logo file is added by the team if the school allows |  | Trademark | Claude | Superseded by D-063 |
| D-060 | Hazard warnings | Every hazard is announced with **text only**: its name, then a large animated 3, 2, 1. It can always be escaped by moving or jumping. | | Fairness | Team | Decided |
| D-061 | Bairro Alto hazard | **Drunk Crowd** that drags players along the street replaces Tram 28. No tram rails or wires in the map. Lisboa OG keeps his mini-tram special. | Tram 28 (D-052) | Team idea | Team | Decided |
| D-062 | Real places in the stages | Campus: Pingo Doce & Go, CTT Student Hall, Nova logo. Beach: fort on the left, Ponte 25 de Abril, Cristo Rei on a hill, açaí kiosk, open ocean on the right. Bairro Alto: Erasmus Corner with a "BEER €1.50" sign, The Spot. | Generic scenery | True to the real places | Team | Decided |
| D-063 | Nova logo | The **real Nova SBE logo**, redrawn from the official mark, on the campus roof. Credited in `CREDITS.md`. | Lettering only (D-059) | Team request | Team | Decided |
| D-064 | Stage choice | Host picks a stage or **Vote** on the phones; a tie is random between the tied stages | | | Team | Changed by D-135 |
| D-065 | Lobby | Only the laptop starts. The host can **close the room** and start with 2 or 3 players. | | | Team | Decided |
| D-066 | Special cooldown | Recharges over time (6 to 8 s) | Charging by damage dealt | | Team | Decided |
| D-067 | Leaderboard | **Points**: placement plus damage dealt | Wins only | | Team | Decided |
| D-068 | Sound | Synthesised music and effects, separate volume controls | | No licences | Team | Decided |
| D-069 | Achievements | Per player, stored in the sheet, **no effect on gameplay** | Per-match fun awards | | Team | Decided |
| D-070 | Leaving and pausing | Pause only on the laptop. A player who leaves can rejoin; the match keeps running. | | | Team | Decided |
| D-071 | One phone per account | A second login signs out the first phone | Reject the second | | Team | Decided |
| D-072 | Bots | None | Practice bot | | Team | Decided |
| D-074 | Hazard warning look | Text only: hazard name, then a large animated **3, 2, 1** | Striped banner with bar | Team request | Team | Decided |
| D-075 | Bairro Alto scenery | No tram rails or overhead wires. Lisboa OG keeps the mini-tram special. | | Tram is no longer a hazard | Team | Decided |
| D-076 | After a match | Back to the lobby, **no rematch button** | Rematch | Basic version | Team | Decided |
| D-077 | Absent player | Their idle fighter can still be hit | Invulnerable while away | | Team | Decided |
| D-078 | Gamertag filter | None | Bad-word list | | Team | Decided |
| D-079 | Fighter select | Cards show **Speed and Weight bars** | Name and attacks only | | Team | Decided |
| D-080 | Normal attacks | **Same damage and same range for every fighter**; only the animation differs | Melee vs. thrown normals with different values | Fair and simple | Team | Decided |
| D-081 | Countdown position | Top right corner of the big screen, never over the map's platforms | Top centre | | Team | Decided |
| D-082 | Stat bars | Speed and Weight as five-step bars, no numbers | | | Team | Decided |
| D-083 | Title screen | No team names | | | Team | Decided |
| D-084 | Match screen layout | Player cards in a row **top left**, name + hearts + damage bar above each fighter, hazard countdown **top right** | All at the fighter; cards at the bottom | Team picked from visual options | Team | Decided |
| D-085 | Damage colour | Gradient white (0 %) → yellow (100 %) → orange → red → dark red (200 %) | Three fixed colours | | Team | Decided |
| D-086 | Special-ready indicator | Phone only | Also on the big screen | | Team | Decided |
| D-087 | KO moments | Varied texts on screen and phone, strong vibration on a KO. The **final KO** gets slow motion and a zoom. Eliminated cards turn grey with "OUT". | Single text | | Team | Decided |
| D-088 | KO and winner texts | "LAUNCHED!", "SEE YA!", "DROPPED OUT!", "OUT OF OFFICE!", "BURNOUT!", "NEEDS A GAP YEAR!"; winner "{name} graduates with honours!". Final-KO slow motion lasts 2 s. | | | Team | Decided |
| D-089 | Lobby | A joining player appears with an entrance effect; grey silhouette until a fighter is picked | | | Team | Decided |
| D-090 | Results screen | Dimmed stage behind a podium for places 1 to 3, with damage dealt, damage taken and the other stats | Plain table | | Team | Decided |
| D-091 | Phone controls | Two modes ship, **D-pad** and **joystick**, switchable on the phone; the team picks the default after playtesting. Three rectangular buttons: **Attack, Jump (with double jump), Special**; nearly the whole screen is touch surface. | Three round buttons (D-047); no jump button (tried and reverted the same day) | Team picked from visual options | Team | Superseded by D-133 |
| D-092 | Fighter select | Swipe through fighters with the neighbours peeking in | Grid of eight | | Team | Decided |
| D-093 | Fourth place | Lies flat on the ground beside the podium | Standing, or hidden | | Team | Decided |
| D-094 | Build process | Built with Claude Fable, with independent reviewer agents after each package. If Fable usage runs too high, subagents move to Opus or Sonnet. | | Team request | Team | Decided |
| D-095 | Aiming | Attack and Special go **where the fighter looks**: left, right, or up while up is held | Left and right only | Hit someone jumping over you | Team | Decided |
| D-096 | Demo mode | **Built later.** Everything agreed is kept in `DEMO.md`; the first build is the full game without it. | Build it now (D-046) | Team decision | Team | Decided |
| D-097 | Code priorities | **Quality and function before simplicity.** The code may be complex; the walkthrough document explains it. | Beginner-readable code first | Team decision | Team | Decided |

### Decisions made during the build (2026-11-11)

Made by Claude while building, wherever the spec left something open. **The team should confirm or change them**; each one is small and local.

| ID | Topic | Decision | Alternatives considered | Why | Who | Status |
|---|---|---|---|---|---|---|
| D-098 | Hazard zones | Train, Big Wave and Drunk Crowd touch only the main ground level. Bad Wi-Fi hits one random half of the campus: the roofs (main roof, tower roof) or the ground floor. Seagulls fly over one random half of the beach: the sand or the roofs. Drinks stand on one random platform. The announced name says where: "BAD WI-FI ON THE ROOFS". | Whole-stage hazards | GAME_SPEC §7.2 asks that every hazard can be escaped and leaves a safe platform | Claude (build) | Decided, team to confirm |
| D-099 | Seagulls | The flock takes what each fighter in its zone holds, plus one item lying there. A fighter with empty hands gets a 3 % peck and a very short stun. | Stealing only | Otherwise the hazard does nothing when nobody holds an item | Claude (build) | Decided, team to confirm |
| D-100 | Hazard numbers the spec left open | Train 20 %, Big Wave 12 %, Drunk Crowd 5 % and it carries fighters along. The warning is the name for 1 s, then 3, 2, 1 (4 s in total). "Every 25 to 40 s" is the pause between the end of one hazard and the warning of the next. |  | All values are in `src/game/config.js` | Claude (build) | Decided, team to confirm |
| D-101 | Where ranges are measured | From the middle of the attacker's body to the nearest edge of the target: 90 px for the normal attack, 380 px for the lasso; radius specials from middle to middle. Aimed up, the same distance goes straight up. | From the body's edge | One rule for all attacks, easy to test | Claude (build) | Decided, team to confirm |
| D-102 | Ranges the spec does not state | Padel ball flies 510 px, the mini tram rolls 600 px, a thrown book flies about 600 px. The tram lands on any platform and rolls along it. Nothing reaches through the solid ground. |  | "Specials hit only inside their stated range, never the whole screen" | Claude (build) | Decided, team to confirm |
| D-103 | Specials aimed up | Padel ball and book fly up; Wave Rider rises 360 px and carries opponents up; the lasso reaches 380 px up and lifts its target above the caster; the tram is tossed up and rolls where it lands; the four radius specials ignore the direction. | Left and right only | GAME_SPEC §6: attack and special go where the fighter looks | Claude (build) | Decided, team to confirm |
| D-104 | KO details | Blast zone: 170 px beyond the left and right edge, 230 px above the top, 180 px below the bottom. Respawn point is the top centre (640, 60) on every stage. A KO counts for the last attacker for 8 s. If several players leave in the same frame, the one with more damage goes first; the last player standing cannot be knocked out, so there is always exactly one winner. |  | Needed for a result the server can check | Claude (build) | Decided, team to confirm |
| D-105 | Time cap | The settings object has `timeCapS` (0 = off, the normal game). The rule behind it exists in the rules and is tested, so in the rules demo mode only has to set values. No demo toggle was built (D-096), and the server refuses time-capped results until demo mode is added. | Leaving it out | BUILD_PROMPT: keep all match settings in one object so demo mode can be added without touching the rules | Claude (build) | Decided, team to confirm |
| D-106 | Final KO and hit pause | Both are done by `src/game/loop.js`, which only changes when the next step of the rules happens (quarter speed for 2 s; a short freeze on hits). The camera zooms on the place where the last player was knocked out. | Slowing the physics | An effect must never change the result; tested with and without effects | Claude (build) | Decided, team to confirm |
| D-107 | Keyboard players | Up to two on the host page (W A S D + F G H, arrows + I O P). They have no account and earn no points. A match with fewer than two logged-in players is a practice match: it is played normally but not stored. | Letting keyboard players earn points | Points belong to accounts; this also stops a host from farming points alone | Claude (build) | Superseded by D-132 |
| D-108 | Host page reconnect | The socket that created a room gets a secret host key. If the host page loses its connection or is reloaded, it takes the room back with that key within 60 s. The spec's sentence "only the socket that created a room is its host" is kept in spirit: only the page that created the room has the key. | Losing the room on any Wi-Fi blip | A live demo on an unknown network | Claude (build) | Decided, team to confirm |
| D-109 | One phone per account, in detail | The newest login wins; the older phone is signed out with a message. The same login opened twice on one phone (two tabs) only replaces the older tab, without signing out. After a server restart the phone that logged in last still wins. |  | GAME_SPEC §4 | Claude (build) | Decided, team to confirm |
| D-110 | Achievements column | Stores achievement ids separated by commas, plus hidden notes `won_campus`, `won_beach`, `won_bairro` that Globetrotter needs. The notes are never shown. | A separate tab | One row per player stays enough | Claude (build) | Decided, team to confirm |
| D-111 | Which results are refused | A result must fit the match the server saw start: same stage and lives, the same players, a duration not longer than the time since the start, exactly one winner who has a life left, falls and KOs that add up, damage within what the lives allow. The exact list is in `server/results.js`. |  | The host page is trusted for the result (known limit), so only possibility is checked | Claude (build) | Decided, team to confirm |
| D-112 | Limits | HTTP body 1 KB; phone message 512 bytes, host message 4 KB; 80 messages a second per phone, 200 per host; 120 logins, 40 registrations, 40 failed join attempts and 600 API calls a minute per address; 10 new rooms a minute and 12 open rooms per address, 200 rooms and 3,000 connections in total (400 per address); a room nobody uses for 3 h is removed; a connection that never opens or joins a room is closed after a minute. |  | All in `server/config.js` | Claude (build) | Decided, team to confirm |
| D-113 | Join link | The QR code encodes the address the host page itself was opened with (https on the public URL, http on a home network). | Always https | So the same server also works on a laptop in the same Wi-Fi | Claude (build) | Decided, team to confirm |
| D-114 | Ready | A player's fighter appears on the big screen as soon as they swipe to it; they count as in once they tap Ready. The host can start as soon as two players are ready; players who are not ready sit that match out. New players can join while a match runs and play in the next one. | Everyone must be ready | GAME_SPEC §5: start with 2 or 3 players | Claude (build) | Decided, team to confirm |
| D-115 | Extra phone feedback | Normal hits give a short vibration and flash without text; landing a KO shows "Nice hit!"; picking up an item shows what it does. | Feedback for specials only | D-018 (vibration on hits) and the signature lines in CONCEPT §3.4 | Claude (build) | Decided, team to confirm |
| D-116 | Input over the network | The phone sends all seven buttons as one number with a running counter, on every change and ten times a second as a heartbeat. The host lets go of a phone's buttons if nothing arrived for 0.6 s, so a locked phone or a network hiccup cannot leave a fighter running off the stage. A button that is still held when the phone is heard again carries on as a hold; it does not count as a new press. | Sending single button events | Nothing can get out of step | Claude (build) | Decided, team to confirm |
| D-117 | Visitor address behind the proxy | With `TRUST_PROXY=cloudflare` (set on Render) the address for rate limits is taken from `CF-Connecting-IP`, which Render's front door sets itself. Headers a visitor can choose (`X-Forwarded-For`) are never used. Behind Tailscale Funnel the setting stays off and the server listens on `127.0.0.1` only (`HOST`). The limits are roomy because a whole lecture hall can share one address; PIN guessing is stopped by the lock on the gamertag. | The first or last forwarded entry | Otherwise all visitors share one limit on Render | Claude (build) | Decided, team to confirm |
| D-118 | What lives only in memory | Rooms, the result queue, the lockout counters and "who logged in last" are kept in the server's memory. They are lost when the server restarts (the free host sleeps when idle). Accounts and saved results are in the sheet and survive. | A second store | Keeps the server small; stated as a limit in the walkthrough | Claude (build) | Decided, team to confirm |
| D-119 | Fonts and sound | Bungee and Nunito are bundled (SIL Open Font License). All sound is synthesised. | Loading fonts from Google; sound files | No outside requests, no licences to manage | Claude (build) | Decided, team to confirm |
| D-120 | Debug hook | The host page exposes `window.novaBrawl` (current screen, match state, roster) for the browser test and for debugging. It gives no power the host page does not already have. | Hiding it | The browser test needs to see that fighters move | Claude (build) | Decided, team to confirm |
| D-121 | Reviews | After each package (game rules, server, client) independent reviewer agents checked the spec, hunted bugs, checked security and ran mutation checks on the tests. Their findings were reproduced and fixed. Every fixed defect in the rules and the server has a regression test (`tests/*/regressions.test.js`, `exact.test.js`, `strict.test.js`); client fixes are covered by the browser tests where those can reach them. |  | D-094 | Claude (build) | Decided, team to confirm |
| D-122 | Results, hardened | Beyond D-111: a result is refused if it arrives sooner than the match could have been played (3 s countdown, 2 s per respawn), if one player has more KOs than the others have falls, ends with more damage than they took, or dealt more than 80 % per second. A player's matches count for the leaderboard at most 120 times an hour, and at most 200 results wait for the sheet. | Trusting the host fully | The security review showed that a made-up host could otherwise collect unlimited points in seconds | Claude (build) | Decided, team to confirm |
| D-123 | Wrong PINs per day | On top of "five wrong PINs within 10 minutes lock the gamertag for 10 minutes" (GAME_SPEC §4): at most 20 wrong PINs per gamertag in 24 hours. Logins for one gamertag are checked one after the other. | The short lock only | With the short lock alone, all 10,000 PINs can be tried in two weeks; with the daily cap it takes more than a year | Claude (build) | Decided, team to confirm |
| D-124 | What the host may send to phones | Only three kinds of message (`phase`, `status`, `feedback`), each with a fixed list of fields and value ranges; anything else is refused by the server. The phone additionally ignores feedback that comes faster than a person could take in (at most three flashes a second). | Passing host messages on unchecked | A hostile host page must not be able to crash or strobe a phone | Claude (build) | Decided, team to confirm |
| D-125 | Removing a player, logging out | The host can remove a player from the room (the × on the lobby card); that gamertag cannot rejoin that room. The phone has "Log out", which makes every copy of that login useless. |  | A room code can be guessed by trying; the host needs a way to deal with a stranger | Claude (build) | Decided, team to confirm |
| D-126 | Room codes | Still 4 letters (GAME_SPEC §3). Guessing is slowed down instead: only a logged-in player learns whether a room exists, failed join attempts are limited per address (a phone that reconnects with a good login never counts), and a connection is closed after ten misses. | Longer codes | Four letters are quick to type on a phone | Claude (build) | Decided, team to confirm |
| D-127 | In-world hints during a hazard warning | While the name and 3, 2, 1 are shown as text, the place where the hazard will strike glows softly (and Bad Wi-Fi shows a small crossed-out Wi-Fi symbol in its zone). It is part of the scene, not a box or a bar. | Text only, with no hint where | GAME_SPEC §7.2: every hazard must be escapable; a player has to see where it comes from | Claude (build) | Decided, team to confirm |
| D-128 | Look of the normal attack | Swing: an arc in front of the fighter. Poke: a stick with a phone at its tip. Throw: the fighter's own thing (beer, vinyl, pizza) flies to the end of the reach. All three have exactly the same reach, timing and damage (D-080). | One look for all | GAME_SPEC §7.1 | Claude (build) | Decided, team to confirm |
| D-129 | A connection that hangs without closing | Each page asks the server "are you there?" once a second. No answer for 2.5 s: the page says "Weak connection" at once; no answer for 6.5 s: it reconnects. The server tells the phones "The big screen lost its connection" when the host page has been silent for 5 s, without waiting for the socket to time out. | Waiting for the socket to close (6.5 to 20 s in which buttons did nothing and nobody knew why) | Found by the game-feel review with a simulated bad network | Claude (build) | Decided, team to confirm |
| D-130 | Padel Smash and the train | Padel Smash: base knockback 6, growth 9 (was 7 and 12). Train: base 8, growth 7 (was 9 and 10). In a rules simulation the old numbers knocked out a fresh fighter (0 %) near the edge; now Padel Smash knocks out from the middle of the stage at about 112 % (a normal attack: 156 %). Still "strong knockback" (GAME_SPEC §7). | Keeping the first numbers | Game-feel review; the numbers are in `src/game/config.js` for the team to tune on real phones | Claude (build) | Decided, team to confirm |
| D-131 | Final-KO slow motion and the joystick | In the two seconds of slow motion the fighters are drawn between two steps of the rules, so the flight is smooth; only the picture changes, never the result. The joystick's centre follows a thumb that drifts past its rim, so turning back is always a short move. |  | Game-feel review | Claude (build) | Decided, team to confirm |

### Round 2: gameplay and UI (2026-11-12)

The team agreed the changes in [`BUILD_PROMPT_ROUND2.md`](BUILD_PROMPT_ROUND2.md) point by point. Rows marked "Team" record those decisions; rows marked "Claude (round 2)" are details the build prompt left open and the team should confirm.

| ID | Topic | Decision | Rejected alternative | Why / source | Who | Status |
|---|---|---|---|---|---|---|
| D-132 | Keyboard players | Removed completely: no keyboard guests in the lobby, no `guests` or `guestSlots` in `match_start`, every fighter belongs to a logged-in phone. `createMatch` still takes any list of players, so bots can be added later without touching the rules. A `match_start` that still carries `guests` or `guestSlots` is refused as a bad message. | Keeping them as a hidden developer option | Bots will replace them; fewer paths to test | Team | Decided |
| D-133 | Phone controls | **Joystick only.** The D-pad, the `modeToggle` button and the stored mode (`nb_mode`) are removed; the floating joystick is the only control. | Keeping both modes (D-091) | Round 2 decision of the team; one mode is less to explain and to test | Team | Decided |
| D-134 | Pause hint | During a match the big screen shows `Press P or Esc to pause` at the bottom centre (y 704, under the main ground), white at 55 % opacity, hidden from the final KO on. P and Esc both pause and resume; the pause screen says "Press P or Esc to resume". | Hint in a corner | Nobody knew how to pause; P is free now that keyboard players are gone | Team | Decided |
| D-135 | Map vote | **Vote is the default**, the host can still pick one fixed stage. With Vote, Start opens a vote screen on the phones (a carousel of the three stages with a preview, name, day or night and hazards, and a Vote! button) and a vote view on the big screen (previews, live counts, voters' sprites, 10 s countdown). It ends when everyone voted or after 10 s; a tie or no vote is random among the tied stages; the winner shows for about 1.5 s, then the match starts. The stage buttons on the fighter select are removed. | Vote buttons on the fighter select (D-064 as built) | Team decision of 2026-11-12 | Team | Decided |
| D-136 | Map vote, protocol details | The host sends `vote_start` with the ready slots; the server checks them like a match start, sets the room's phase to `vote` and answers `vote_started`. Stage votes are accepted only in that phase and only from slots in the vote; a second vote replaces the first. `match_start` in the vote phase must name one of the stages with the most votes and only players of the vote. `vote_cancel` goes back to the lobby (the host uses it when a vote cannot finish, for example after the host page reloaded). A player who disconnects, leaves or is removed during the vote loses their vote, and the vote no longer waits for them; if they are still in the room when it ends (their slot is held for 30 s), they play the match. During the vote the fighter select is frozen, as during a match. | Counting votes on the host only | The server can then check that the match really starts on a winning stage | Claude (round 2) | Decided, team to confirm |
| D-137 | Stomp | Attack in the air without Up is the stomp: no sideways movement, dive at 18 px/frame, shockwave on landing within 130 px (centre to centre, like the other radius attacks, D-101): 9 %, base 6, growth 9, 45° away from the stomper; 14 frames of recovery, no cooldown; no landing within 60 frames = no shockwave. Up + Attack in the air stays the upward attack. A held Book is thrown instead; a Sardine powers it (one swing, Sardine numbers). Jumping is not possible while diving (the dive cannot be cancelled into a double jump). | A sideways air attack | Team decision of 2026-11-12; the jump lock is Claude's detail | Team | Decided |
| D-138 | Ledge grab | Only the two outer corners of the solid main ground. Grab when falling, facing the wall, not in hitstun or stun, with the hand point (top of the hurtbox, wall side) within 20 px of the corner; once per airtime (reset by standing on a platform or respawning). Hang at most 1.5 s; Jump climbs up (standing 30 px from the edge), Down or away from the wall lets go. No invincibility: any landed hit knocks the fighter off. Details Claude added: no grab during a special, a stomp dive or a lasso pull; Attack and Special do nothing while hanging; the double jump is not given back by a grab. | Ledges on every platform; invincibility while hanging | Team decision of 2026-11-12: getting back after a fall was almost impossible | Team | Decided |
| D-139 | Held items in the hand | A held item is drawn in the hand, not above the head. The sprite generator computes a hand anchor for every pose (`handPoint` in `public/shared/art/characters.js`) and the renderer draws the item there, mirrored with the facing. It is the back (left) hand, because the front hand already holds the fighter's own item (D-051). A hanging fighter is drawn so that this hand is on the corner. | Above the head (as built); hiding the fighter's own item while holding one | Team decision of 2026-11-12; the choice of hand is Claude's | Team | Decided |
### Proposals made by Claude while writing the docs

**Historical.** These were proposals from the first concept phase. Wherever they conflict with the build-prep decisions (D-042 onwards) they are superseded, and the documents they point to (`CONCEPT` §4, the old `SPECS`) were rewritten after the build. They are kept so the history stays complete.

| ID | Topic | Proposal | Where |
|---|---|---|---|
| D-028 | Fighter roster | Excel Eddie, Sofia Swell, Erasmus Erik, Bookworm Bea, Founder Filipa, Busker Bruno (names are placeholders) | CONCEPT §4.3 |
| D-029 | MVP fighters | Excel Eddie + Sofia Swell first | SPECS §3.5 |
| D-030 | Colour palette & fonts | Atlantic Blue, Tile Blue, Tile White, Sunset Orange, Beach Sand, Bairro Night, Tram Yellow · Bungee + Nunito | CONCEPT §3.5 |
| D-031 | Logo | "NOVA BRAWL" wordmark, the "O" is a custard tart seen from above | CONCEPT §3.5 |
| D-032 | Burnout wording | The 200 % KO is called **"BURNOUT!"**, the winner "graduates with honours" | CONCEPT §4.1 |
| D-033 | Hazard rhythm | One hazard at a time, every 25–40 s, always with a 3 s warning | CONCEPT §4.4, SPECS F-STG-03 |
| D-034 | Tipsy details | 8 s, no stacking. Beer = wobble, Blue Drink = left/right swapped, Cherry Shot = up/down swapped | CONCEPT §4.4, SPECS F-ITM-08 |
| D-035 | Item values | Tart +20 % heal, Book 14 %, Laptop 10 % + stun, Espresso +30 % speed, Sardine 5 swings | SPECS F-ITM |
| D-036 | Libraries | Superseded by D-042: the libraries of the earlier plan no longer apply. Runtime dependencies are `ws` and `qrcode`. | GAME_SPEC §3 |
| D-037 | Resolution & timing | Internal 1280×720, fixed 60 Hz simulation | SPECS F-UI-07, F-CMB-01 |
| D-038 | Knockback formula | `(base_kb + kb_growth × % / 100) × (100 / weight)` with the starting values in SPECS §6 | SPECS §6 |
| D-039 | HUD position | Player cards with % at the **top** of the screen (the team mentioned "the % is shown at the top") | SPECS F-UI-02 |
| D-040 | Host & controls on the laptop | `Enter` start, `Esc` pause, `F11` fullscreen, `F3` debug, `M` mute | SPECS §3 |
| D-041 | Team roles | A: Gameplay · B: Phone & network · C: Stages & look | SPECS §9 |

---

## Open decisions

| ID | Question | Options | Recommendation | Decide by | Status |
|---|---|---|---|---|---|
| O-01 | **Networking**: how do the phones connect? | A) laptop as local server · B) cloud relay · C) both | Build A first, test on the real demo network in week 1, then decide | End of week 1 | Closed → D-044 |
| O-02 | **Global catastrophe events** | Blackout, earthquake, heat wave, storm, or none | Pick 1–2 at most, only after all stage hazards work | Week 2 | Open |
| O-03 | **More course requirements** | (the team announced that more will follow) | Add them to SPECS §8 as soon as they're known | When announced | Closed → GAME_SPEC §2 |
| O-04 | Final fighter names, looks and colours | Keep the D-028 placeholders or rename | | Week 1 | Closed → D-049 |
| O-05 | Music & SFX | Make our own, CC0 packs, or a mix | CC0 packs + a few signature sounds of our own | Week 2 | Closed → D-068 |
| O-06 | Stage select | Host picks, phone vote, always random | Host picks + a "Random" option | Week 2 | Closed → D-064 |
| O-07 | Who is the host? | Laptop keyboard, the P1 phone, or both | Both | Week 1 | Closed → D-065 |
| O-08 | **Login / profiles** | None (guest only) · nickname + 4-digit PIN stored on the laptop · real accounts (email) | Nickname + PIN in a local SQLite database, guest mode always available (see BRAINSTORM §1.1) | Week 1 (affects storage design) | Closed → D-054 |
| O-09 | **Gamification scope for v1** | Stats only · + leaderboard · + achievements · + XP, levels and skins | v1: match stats + all-time leaderboard + 3–6 achievements. XP and skins only if time allows (see BRAINSTORM §1.3) | Week 1 | Closed → D-054 |
| O-10 | **Football-star skin** (the team's Cristiano Ronaldo idea) | Real person (needs permission) · original "Football Legend" homage skin · drop it | Original homage skin (see BRAINSTORM §1.7) | Before any art is made | Open |
| O-11 | Pause rules | Only the host can pause · every player can pause from the phone (with a limit) | Host always. Players get 1 pause per match from the phone (see BRAINSTORM §1.5) | Week 2 | Closed → D-070 |
| O-12 | Fighter suggestions at select | No suggestions · "Suggested for you" based on stats · random "Try this one!" | "Try this one!" for new players, stats-based once profiles exist (see BRAINSTORM §1.6) | Week 2 | Open |
