# NOVA Brawl: Decision Log

The **single source of truth** for every decision about NOVA Brawl. [`SPECS.md`](SPECS.md) and [`CONCEPT.md`](CONCEPT.md) implement what is decided here.

## How to use this file

1. **New decision** → add a row with the next ID (`D-0xx`), today's date and who decided.
2. **Changed decision** → never delete or rewrite the old row. Set its status to **Superseded by D-0xx** and add a new row.
3. **Open question** → add it to [Open decisions](#open-decisions) (`O-xx`). Once it's decided, move it up as a `D-0xx` row and mark the `O-xx` row **Closed → D-0xx**.
4. Then update `SPECS.md` / `CONCEPT.md` to match.

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
| D-046 | Demo mode | 1 life, hazards every 15 s, hard cap **120 s**, lowest damage wins at the cap | | Fits the presentation slot | Team | Decided |
| D-047 | Controls | Move, drop, **Jump, Attack, Special**. Attacks go in the facing direction. **No shield**, no directional attacks. | Medium moveset with shield and dodge (D-006, D-007) | Understandable in 10 seconds | Team | Decided |
| D-048 | Art style | **HD pixel fighters** (81 px, shaded, outlined) on **detailed, realistic drawn stages** | Flat vector (D-011), 8-bit, 16-bit, photos | Team picked from visual options | Team | Decided |
| D-049 | Roster | **8 fighters**: Finance Bro, Maastricht Blondie, Bairro Chad, Surfer Girl, Wannabe Influencer, House DJ, Lisboa OG, Carcavelos Gang Member. Archetype names, no first names. | Six named archetypes (D-010, D-028) | | Team | Decided |
| D-050 | Attacks | One normal and one **unique special** per fighter. Specials hit only within a range and trigger vibration, flash and a message on the hit player's phone. During a special the fighter shows the special's item. | | | Team | Decided |
| D-051 | Colours | Name tags in the player colour, above the fighter and on the phone. Fighters keep their own colours; with a duplicate pick the later player's top takes the player colour. Items are held in the hand. | Whole fighter in player colour | | Team | Decided |
| D-052 | Hazards | **Two per stage**: Campus train + Bad Wi-Fi, Beach wave + seagulls, Bairro Alto tram + drinks | Eleven hazards (D-013 to D-015) | Quality over quantity | Team | Decided |
| D-053 | Items | **Four**: Custard Tart, Espresso, Sardine, Book | Nine items (D-017) | | Team | Decided |
| D-054 | Accounts and storage | **Registration required**: gamertag + 4-digit PIN, stored with scores in a **Google Sheet** (no database) | Guest play, SQLite | Team decision | Team | Decided |
| D-055 | Team | **Three members** | 2 to 3 (D-022) | Course requires 3 to 4 | Team | Decided |
| D-056 | Stages | Platforms are part of the scenery, roofs are playable, the campus shows Nova lettering. Campus and beach by day, Bairro Alto by night. | Floating platforms | | Team | Decided |
| D-057 | Burnout | Instant KO at 200 % stays | | | Team | Decided |
| D-058 | Phone haptics | Vibration on Android; flash + sound on every phone | Vibration only | iPhone browsers cannot vibrate | Claude | Decided |
| D-059 | Official Nova logo | Lettering only in the art; the official logo file is added by the team if the school allows | | Trademark | Claude | Proposal |
| D-060 | Hazard warnings | Every hazard is announced with **text only**: its name, then a large animated 3, 2, 1. It can always be escaped by moving or jumping. | | Fairness | Team | Decided |
| D-061 | Bairro Alto hazard | **Drunk Crowd** that drags players along the street replaces Tram 28. No tram rails or wires in the map. Lisboa OG keeps his mini-tram special. | Tram 28 (D-052) | Team idea | Team | Decided |
| D-062 | Real places in the stages | Campus: Pingo Doce & Go, CTT Student Hall, Nova logo. Beach: fort on the left, Ponte 25 de Abril, Cristo Rei on a hill, açaí kiosk, open ocean on the right. Bairro Alto: Erasmus Corner with a "BEER €1.50" sign, The Spot. | Generic scenery | True to the real places | Team | Decided |
| D-063 | Nova logo | The **real Nova SBE logo**, redrawn from the official mark, on the campus roof. Credited in `CREDITS.md`. | Lettering only (D-059) | Team request | Team | Decided |
| D-064 | Stage choice | Host picks a stage or **Vote** on the phones; a tie is random between the tied stages | | | Team | Decided |
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

### Proposals made by Claude while writing the docs

These are **not confirmed by the team yet**. Confirm them (status → `Decided`) or replace them.

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
| D-036 | Libraries | `aiohttp` (server + WebSocket), `qrcode` + `Pillow`, `pytest` | SPECS §5.1 |
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
| O-05 | Music & SFX | Make our own, CC0 packs, or a mix | CC0 packs + a few signature sounds of our own | Week 2 | Open |
| O-06 | Stage select | Host picks, phone vote, always random | Host picks + a "Random" option | Week 2 | Open |
| O-07 | Who is the host? | Laptop keyboard, the P1 phone, or both | Both | Week 1 | Open |
| O-08 | **Login / profiles** | None (guest only) · nickname + 4-digit PIN stored on the laptop · real accounts (email) | Nickname + PIN in a local SQLite database, guest mode always available (see BRAINSTORM §1.1) | Week 1 (affects storage design) | Closed → D-054 |
| O-09 | **Gamification scope for v1** | Stats only · + leaderboard · + achievements · + XP, levels and skins | v1: match stats + all-time leaderboard + 3–6 achievements. XP and skins only if time allows (see BRAINSTORM §1.3) | Week 1 | Closed → D-054 |
| O-10 | **Football-star skin** (the team's Cristiano Ronaldo idea) | Real person (needs permission) · original "Football Legend" homage skin · drop it | Original homage skin (see BRAINSTORM §1.7) | Before any art is made | Open |
| O-11 | Pause rules | Only the host can pause · every player can pause from the phone (with a limit) | Host always. Players get 1 pause per match from the phone (see BRAINSTORM §1.5) | Week 2 | Open |
| O-12 | Fighter suggestions at select | No suggestions · "Suggested for you" based on stats · random "Try this one!" | "Try this one!" for new players, stats-based once profiles exist (see BRAINSTORM §1.6) | Week 2 | Open |
