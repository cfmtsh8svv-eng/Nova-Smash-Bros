# NOVA Brawl: Game Spec v2.0

**This file is the authoritative spec for the build.** It records the team decisions of 2026-11-11 ([DECISIONS.md](DECISIONS.md), D-042 onwards) and the round 2 changes of 2026-11-12 (D-132 onwards). Where `CONCEPT.md` or `SPECS.md` say something different, this file wins. Brand voice, signature lines and humour rules in `CONCEPT.md` §3 still apply.

Sound: music per stage and effects are synthesised in the browser, with separate volume controls on the host. There are no bots and no keyboard players: every fighter is played from a phone (D-132). The rules still accept players that do not come from a phone, so bots can be added later.

Final art reference: [`design/final/`](../design/final/) (`reference.html`, `characters.js`, `stages.js`).

---

## 1. What it is

A party platform fighter for **2 to 4 players**. One laptop or projector shows the game. Each player scans a QR code and uses their **phone as the controller**, in the browser, on iOS and Android, with no install. Text in the game is English only.

## 2. Course constraints (from the team-project wiki)

| Constraint | Consequence |
|---|---|
| Deadline **2026-11-23 23:59**, commits after it do not count | `main` must hold the deployed code before then |
| Must run at a **public URL**, shown live | Deployed on a free host, see §9 |
| README: deployed URL, member names + student numbers, run and test commands | See `README.md` |
| Every member commits code and can explain every part | `docs/WALKTHROUGH.md`, `docs/TEAM_TASKS.md` |
| JavaScript instead of Python | Approved by the teaching staff (team, 2026-11-11) |

Grading: it works 20 %, UI/UX 20 %, scope 20 %, verification 10 %, security 10 %, repository walkthrough 20 %. §11 maps each criterion to what we build.

## 3. Architecture

```
Phones (controller page)  ──wss──┐
                                 ├──  Node server  ──https──  Apps Script web app  ──  Google Sheet
Laptop (host page, runs game) ───┘    (static files, rooms, relay, accounts, results)
```

| Part | Choice | Why |
|---|---|---|
| Server | Node.js 22, one process: static files + WebSocket + small JSON API | Works on every network (plain HTTPS/WSS on 443). Holds the secrets. |
| Runtime dependencies | `ws`, `qrcode`, exact versions pinned | Security criterion: minimal and pinned |
| Client | JavaScript ES modules, Canvas 2D, no framework | Quality and function come before simplicity; few moving parts to break in the demo |
| Simulation | Runs in the **host page** at a fixed 60 Hz. The server only relays inputs and events. | Smooth rendering, tiny server |
| Game logic | Pure modules in `src/game/` with no DOM access | Runs headless in Node for tests |
| Storage | **Google Sheet** through an Apps Script web app. No database. | Team decision |
| Tests | `node:test` (built in). Playwright as a dev dependency for one browser smoke test. | No test framework to learn |

**Rooms.** The host page asks the server for a room and gets a 4-letter code. The QR code encodes `https://<host>/play?room=ABCD`. A room holds at most 4 players; a fifth phone sees "Room full".

**Messages** are small JSON objects over WebSocket. The server validates every message (type, size, fields, sender role) and drops anything invalid without crashing. Phone → server → host: `input` (button state, sent on every change plus a heartbeat). Host → server → one phone: `status`, `phase`, `feedback` (vibrate pattern, flash colour, text).

**Reconnect.** A phone that locks or drops keeps its slot for 30 s and rejoins with its session token.

**Known limits** (to state in the walkthrough): the host page is trusted to report match results, so the server only checks plausibility (see §8). The free host sleeps when idle. Google Sheets is slow and rate-limited, so it is never used during a match.

## 4. Accounts and the Google Sheet

- **Registration is required.** Gamertag (3 to 12 characters, `A-Z a-z 0-9 _`, unique ignoring case) plus a **4-digit PIN**, entered twice when registering.
- Returning players log in with the same gamertag and PIN. The phone keeps a signed session token, so a returning player is normally logged in automatically.
- The server hashes the PIN with `scrypt`, a per-player salt and a server-side pepper. The sheet stores only salt and hash.
- Gamertags are not filtered for bad words (team decision).
- Wrong PIN five times within 10 minutes locks that gamertag for 10 minutes.

| Sheet tab | Columns |
|---|---|
| `players` | gamertag, gamertag_lower, salt, pin_hash, created_at, matches, wins, points, kos, falls, damage_dealt, damage_taken, achievements |
| `matches` | match_id, ended_at, stage, mode, lives, duration_s, winner, players_json |

The **leaderboard** ranks players by **points**. Each match gives placement points (1st 100, 2nd 60, 3rd 40, 4th 20) plus 1 point per 10 % damage dealt. It is read from `players`, cached on the server for 60 s, and shown on the host's results screen and lobby.

**Achievements** belong to a player, are stored in the sheet and have no effect on gameplay. They show on the results screen and on the phone when earned. First set: First Win, Hat-Trick (3 wins), Heavy Hitter (1,000 % damage dealt in total), Untouchable (win without losing a life), Comeback (win on the last life above 150 %), Globetrotter (win on all three stages), Regular (10 matches), Special Delivery (KO with a special).

**One phone per account.** If a gamertag logs in on a second phone, the first phone is signed out with a clear message.

**If the sheet is unreachable:** logins of players already cached this session still work, new registrations show a clear error, match results are queued and retried, and the game itself keeps running.

**Local development and tests** use an in-memory store with the same interface. Tests never touch the real sheet.

## 5. Match rules

| Rule | Value |
|---|---|
| Players | 2 to 4 |
| Lives | **1, 2 or 3**, chosen by the host in the lobby (default 3) |
| End of match | When only **one player is left**. No time limit. |
| Damage | Starts at 0 %. Every hit adds damage. Higher damage means more knockback. |
| KO "LAUNCHED!" | Crossing the blast zone around the screen |
| KO "BURNOUT!" | Reaching **200 %** |
| After a KO | Lose a life, respawn after 2 s at the top centre at 0 %, 2 s of invincibility |
| Eliminated | Phone shows "You're out!" and a **vote for the next hazard** |
| Stage choice | The host picks on the laptop: **Vote** (the default) or one fixed stage. With a fixed stage the host presses Start as before. With Vote, Start opens the **map vote** (§10a); a tie or no vote at all is decided at random between the tied stages. |
| Starting | Only the laptop starts the match, once at least 2 players are logged in and have picked a fighter. The host can **close the room** so nobody else joins, and start with 2 or 3 players. |
| Leaving | If a player leaves or loses connection, the match **keeps running**. Their fighter stands idle, **can still be hit**, and they can rejoin at any time until the match ends. |
| Pause | Only on the laptop: **P** or **Esc** pauses and resumes. Phones cannot pause. |

**Knockback**

```
launch_speed = (base_kb + kb_growth * target.percent / 100) * (100 / target.weight)
hitstun_frames = round(launch_speed * 2.5)
```

**Ledge grab** (D-138). Getting back after a fall takes some skill:

- Only the two outer corners of the **solid main ground** of each stage can be grabbed.
- A grab happens only when the fighter is **falling** (moving down), **faces the wall**, is **not in hitstun or stun** (and not in a special, a stomp dive or a lasso pull), and the fighter's hand point (the top of the hurtbox, on the wall side) comes within **20 px** of the corner.
- **Once per airtime:** after letting go, there is no new grab until the fighter has stood on a platform again or respawned.
- Hanging lasts at most **1.5 s**, then the fighter drops. **Jump** climbs up onto the ground (standing on it, 30 px from the edge). **Down** lets go, and so does pushing left or right **away from the wall**. Attack and Special do nothing while hanging.
- **No invincibility** while hanging: any hit knocks the fighter off as usual.
- The fighter is drawn in a hanging pose (arms up) at the corner.

Coordinates are a 1280×720 space at 60 Hz. Gravity 0.6 px/f². A single jump reaches about 160 px, so every platform level (130 px apart) is reachable; one double jump. All tuning values live in one `config.js`.

## 6. Controls (phone, landscape)

Almost the whole screen is touch surface. There is **one control mode** (D-133): the floating joystick. There is no D-pad and no mode toggle.

| Left half | Right half |
|---|---|
| A floating **joystick** that appears where the thumb lands: left/right to move, hold up to look up, down to drop through a platform, fast fall or let go of a ledge | Three rectangular buttons: **Attack**, **Jump**, **Special** |

The joystick produces the input state `left, right, up, down, attack, jump, special`; the game logic only sees that state.

**Jump** jumps; pressing it again in the air is the **double jump** (one per airtime). It triggers on the press, so holding it does not repeat.

**Facing.** A fighter faces left or right (the last direction pressed) or **up while up is held**. **Attack and Special go where the fighter looks**, so holding up hits or reaches an opponent who is above or jumping over. A yellow strip in the Special button shows the cooldown.

**Attack in the air** (D-137): **Up + Attack** is the normal upward attack. **Attack without Up is the stomp**: the fighter stops moving sideways and drops straight down fast (18 px per frame); on landing a ring-shaped **shockwave** hits every opponent within **130 px** (centre to centre): 9 %, base_kb 6, kb_growth 9, 45° away from the stomper. Then the fighter needs **14 frames** to recover. It is a normal attack, not a special, so it has no cooldown; the recovery is its cost. If the fighter has not landed after **60 frames** (they fell past the stage), the stomp ends without a shockwave. Items: a held Book is still thrown in the air (no stomp); a held Sardine powers the stomp (it uses one swing, and the Sardine's damage and knockback apply). Attack on the ground is unchanged.

Reference: `design/options/round9-phone-final.html`.

There is no shield.

The phone header shows the player's **name tag in their player colour**, damage % and lives. Player colours: P1 red `#e63946`, P2 blue `#2f7fe0`, P3 green `#22a36b`, P4 yellow `#f6c343`, always with the "P1" to "P4" label.

**Feedback on the phone** when something happens to its player: a vibration pattern (Android), a full-screen colour flash and a short sound (all phones, because iPhone browsers do not vibrate), and a one-line message such as "You're drunk! Drink water!". Every special that hits a player triggers this on that player's phone only.

**Demo mode is not part of this build.** It comes later; everything agreed about it is kept in [`DEMO.md`](DEMO.md). Match settings live in one settings object so it can be added without touching the rules.

## 6a. What is on the big screen during a match

| Where | What |
|---|---|
| **Top left** | One card per player in a row: name and hearts in the player colour, damage % large. An eliminated player's card turns grey and shows **OUT**. |
| **Above each fighter** | A pill in the player colour with the name and hearts, and under it a thin damage bar |
| **Top right** | The hazard countdown (name, then 3, 2, 1) |
| Centre | KO texts and the final-KO sequence only |
| **Bottom centre** | A small, semi-transparent line `Press P or Esc to pause`, in the strip under the main ground so it never covers a platform. It shows during the countdown and the fight and is hidden from the final KO on. |

Whether the special is ready is shown **only on the phone** (a ring on the Special button). The phone header shows name, damage % and hearts, with no points and no placement.

**Damage colour** is a smooth gradient used for the % number and the damage bar: white at 0 %, **yellow at 100 %**, then orange, red, and dark red at 200 %.

**KO moments.** Each KO shows one of several short texts on the big screen ("LAUNCHED!", "SEE YA!", "DROPPED OUT!", "OUT OF OFFICE!"; for the 200 % rule "BURNOUT!", "NEEDS A GAP YEAR!") and a matching line with the lives left on that player's phone, with a long, strong vibration pattern and a red flash. An elimination vibrates longest.

**Final KO.** The last KO of the match is the big moment: the game drops to slow motion for **2 s**, the camera zooms in on the hit, the screen flashes, "FINAL KO!" appears, then "{name} graduates with honours!". All phones vibrate.

## 7. Content

### 7.1 Fighters (8)

Pixel sprites, 81 px tall, three tones per colour, dark outline (style "HD pixel"). Each fighter has its own colour and holds its item **in the hand**. During the special the fighter pulls out the special's own item. A **name tag in the player colour** floats above every fighter. If two players pick the same fighter, the later player's top is drawn in their player colour.

**Normal attacks are identical for every fighter**: 8 % damage, 90 px range in the facing direction, base_kb 4, kb_growth 9, same timing. Only the look differs (a swing, a poke, or a short throw animation of the named item). Specials hit only inside their stated range, never the whole screen.

| Fighter | Weight | Speed | Normal | Special | Special effect | Phone message |
|---|---|---|---|---|---|---|
| Finance Bro | 100 | 3 | Laptop Swing | **Cash Rain** | Banknotes in a 220 px radius: 6 %, opponents slip and slide away for 1.5 s | "You slipped on cash!" |
| Maastricht Blondie | 85 | 4 | Tote Bag Swing | **Padel Smash** | Hits a ball forward: 18 % and strong knockback on the first opponent hit | "Smashed!" |
| Bairro Chad | 120 | 2 | Beer Throw | **Round's On Me** | 200 px radius: 4 %, tipsy (left and right swapped) for 4 s | "You're drunk! Drink water!" |
| Surfer Girl | 85 | 5 | Board Swipe | **Wave Rider** | Surfs 360 px forward on a wave: 10 % and pushes opponents along | "Wipeout!" |
| Wannabe Influencer | 90 | 4 | Selfie Stick Poke | **Ring Light Flash** | Only the **nearest** opponent within 320 px: 5 %, stunned 1 s, phone flashes white | "Blinded! No filter can save you." |
| House DJ | 100 | 3 | Vinyl Throw | **Bass Drop** | Jump and slam, 180 px radius: 12 %, launched upward | "BASS DROP!" |
| Lisboa OG | 115 | 2 | Sardine Slap | **Ding-Ding** | A mini Tram 28 rolls along the ground: 12 %, sideways knockback | "Run over by the 28!" |
| Carcavelos Gang Member | 100 | 3 | Pizza Throw | **Spaghetti Lasso** | 380 px forward: pulls the first opponent hit to him, 6 %, 0.4 s stun | "Caught in the pasta!" |

Special cooldown: 6 to 8 s. Looks and colours are defined in `design/final/characters.js`.

### 7.2 Stages (3)

Detailed illustration, drawn in code, true to the real places. Platforms are **part of the scenery** (roofs, canopies, balconies, a lifeguard tower) and every playable surface carries the stage's striped trim. Layouts are in `design/final/stages.js`.

| Stage | Time | Platforms | Hazards |
|---|---|---|---|
| **Nova SBE Campus** | Day | Terrace, CTT Student Hall canopy, Pingo Doce & Go roof, main roof, tower roof | **Cascais Line Train** across the terrace level (25 % chance: "STRIKE! Train cancelled.") · **Bad Wi-Fi**: inputs delayed 200 ms for 6 s |
| **Carcavelos Beach** | Day | Sandbank, surf-bar roof, açaí kiosk roof, lifeguard deck, lifeguard roof. Fort, Ponte 25 de Abril and Cristo Rei in the background. | **Big Wave** sweeps the sand level · **Seagulls** steal an item |
| **Bairro Alto** | Night | Street without tram rails or overhead wires (with Erasmus Corner and its "BEER €1.50" sign), two balconies, the roof terrace of the bar The Spot, two roofs | **Drunk Crowd** pushes along the street and drags players with it · **Drinks** that make you tipsy for 8 s |

One hazard at a time, every 25 to 40 s. Every hazard is **announced as animated text only**: the hazard's name, then a large **3, 2, 1** where each number pops in on its own, on the big screen and on every phone. No box and no bar. On the big screen it sits in the **top right corner**, over open sky, so it never covers a platform or a fighter. **Every hazard can be escaped** by moving or jumping: each one only affects one level or zone, and at least one platform is always safe.

The campus roof carries the **Nova SBE logo**, redrawn from the official mark (source: Wikimedia Commons, `Nova_logo.png`, author Nova SBE, CC BY-SA 4.0). It is credited in `CREDITS.md` and stays the school's trademark.

### 7.3 Items (4)

Spawn every 12 to 20 s, at most 3 at once.

| Item | Effect |
|---|---|
| Custard Tart | Heals 20 % on touch |
| Espresso | +30 % speed for 8 s on touch |
| Sardine | Picked up on touch. The next 5 normal attacks do 6 % with very high knockback. |
| Book | Picked up on touch. The next normal attack throws it: 14 %. |

## 8. Security

- No secrets in the repository. `.env.example` lists the names; real values live on the host. `.env` is git-ignored before the first commit.
- Secrets: `SHEETS_WEBAPP_URL`, `SHEETS_SHARED_SECRET`, `PIN_PEPPER`, `SESSION_SECRET`.
- Input validation on the server for every HTTP body and WebSocket message: types, lengths, allowed characters, maximum message size, rate limits.
- Gamertags cannot start a spreadsheet formula (allowed characters exclude `= + - @`). The Apps Script also validates and rejects requests without the shared secret.
- Access control: only the socket that created a room is its host. Only that host may start a match or submit a result, and only for players who logged in to that room. One result per match id. Results outside plausible bounds (duration, damage, KOs) are rejected.
- Login throttling as in §4. Session tokens are HMAC-signed and expire after 30 days.
- HTTP security headers (CSP, `X-Content-Type-Options`, `Referrer-Policy`), no inline scripts.
- `npm audit` runs in CI and must report no high or critical issue.

## 9. Hosting

| Where | Role |
|---|---|
| **Render free web service** | The public URL in the README. Sleeps after 15 idle minutes; open it two minutes before the demo. |
| **Mac mini + Tailscale Funnel** | Free backup URL running the same server. Never sleeps. |

Both are free. `docs/DEPLOY.md` has the steps for each.

## 10. Screens

**Host (laptop):** Title (no team names) → Lobby (QR code, room code, player cards, stage choice: Vote or one of the three stages, close room, lives 1/2/3, items and hazards on/off, **separate volume sliders for music and effects**, leaderboard) → Map vote (with Vote only, §10a) → Countdown → Match (HUD with one card per player at the top) → Results (winner, per-player stats, points, new achievements, leaderboard) → back to the lobby. There is no rematch button.

**Phone:** Register / log in → Fighter select (swipe through the 8 fighters one at a time, with the neighbours peeking in at the sides; each card shows the sprite, the two attacks and **Speed and Weight as five-step bars, without numbers**) → Ready → Map vote (with Vote only, §10a) → Gamepad → KO'd → Eliminated + hazard vote → Results.

### 10a. Map vote

Voting is the default; the host can still pick one fixed stage in the lobby (D-135).

- **Start.** With Vote chosen, the host's Start button opens the vote as soon as at least 2 players are Ready (the same rule as starting a match). The fighter select has no stage buttons.
- **Phone vote screen.** It looks and works like the fighter select: a swipe carousel of the three stages with the neighbours peeking in, dots under it, and a big **Vote!** button. Each card shows a preview picture of the stage (the stage art drawn small), the stage name, day or night, and the stage's hazards by name. A player may change the vote until the vote ends.
- **Big screen vote view.** The three stage previews side by side, large, each with its live vote count and the small sprites of the players who voted for it, and a 10 s countdown.
- **End.** When every player in the vote has voted, or after **10 s**, whichever comes first. A tie or no votes is decided at random between the tied stages. The winning stage is shown for about 1.5 s on both screens, then the match starts on it with the players of the vote.
- Players who join during the vote sit it out and play in the next match. A player who disconnects during the vote no longer counts: their vote is dropped and the vote does not wait for them.
- **Server.** The room has a `vote` phase between `lobby` and `match`. Stage votes are accepted only in that phase and only from players in the vote; a second vote replaces the first. The match that follows must use one of the stages with the most votes.

Every error is shown in plain words next to where it happened ("That gamertag is taken", "Wrong PIN, 3 tries left", "Room not found", "Connection lost, reconnecting…").

**Lobby.** When a player joins, their slot appears on the big screen with a short entrance effect (flash and pop in the player colour, with a sound). Until that player has picked a fighter, the slot shows a **grey silhouette**; picking a fighter reveals the sprite.

**Results screen.** The stage stays visible, dimmed, behind the results. A **podium for places 1, 2 and 3** shows the fighters with their name tags; a fourth player lies flat on the ground beside it. Under each: damage dealt, damage taken, KOs, falls, points earned and new achievements. Then the leaderboard, then back to the lobby.

## 11. How each grading criterion is covered

| Criterion | Coverage |
|---|---|
| It works | Deployed, health check, reconnects, every invalid input handled, sheet outage handled |
| UI and UX | One-scan join, auto-login, clear errors, hazard warnings, phone feedback, rotate hint |
| Scope | Real-time multiplayer over the network, phones as controllers, accounts, leaderboard, achievements, 8 fighters, 3 stages, hazards, items |
| Verification | Unit tests for rules, combat, specials, items, hazards; rejected actions and edge cases; server and protocol tests; one browser smoke test; CI on `main` |
| Security | §8 |
| Walkthrough | `docs/WALKTHROUGH.md`: how it is built, why, limits, what could change |
