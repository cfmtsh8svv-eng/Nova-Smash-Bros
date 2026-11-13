# NOVA Brawl: Game Spec v2.0

**This file is the authoritative spec for the build.** It records the team decisions of 2026-11-11 ([DECISIONS.md](DECISIONS.md), D-042 onwards), the round 2 changes of 2026-11-12 (D-132 onwards), the bots of round 4 (D-156 onwards, bot levels D-175 onwards), the special balance (D-184 to D-186) and demo mode (D-187 onwards, §6b). Where `CONCEPT.md` or `SPECS.md` say something different, this file wins. Brand voice, signature lines and humour rules in `CONCEPT.md` §3 still apply.

Sound: music per stage and effects are synthesised in the browser, with separate volume controls on the host. There are no keyboard players (D-132). Every human plays from a phone; the host can fill free places with **bots** (§5a, D-156 onwards).

Art: the game draws everything with `public/shared/art/`, and the platforms it uses are in `src/game/stages.js`. The art reference and the option rounds the team chose from (the `design/` folder) were removed on 2026-11-13; they are in the git history.

---

## 1. What it is

A party platform fighter for **2 to 4 fighters**, at least one of them a human (the rest can be bots, §5a). One laptop or projector shows the game. Each player scans a QR code and uses their **phone as the controller**, in the browser, on iOS and Android, with no install. Text in the game is English only.

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

**Reconnect.** A phone that locks or drops keeps its slot, for 30 s in the lobby and the map vote and until the end of a running match, and rejoins with its session token.

**Known limits** (to state in the walkthrough): the host page is trusted to report match results, so the server only checks plausibility (see §8). The free host sleeps when idle. Google Sheets is slow and rate-limited, so it is never used during a match.

## 4. Accounts and the Google Sheet

- **Registration is required.** Gamertag (3 to 12 characters, `A-Z a-z 0-9 _`, unique ignoring case) plus a **4-digit PIN**, entered twice when registering.
- Returning players log in with the same gamertag and PIN. The phone keeps a signed session token, so a returning player is normally logged in automatically.
- The server hashes the PIN with `scrypt`, a per-player salt and a server-side pepper. The sheet stores only salt and hash.
- Gamertags are not filtered for bad words (team decision).
- Wrong PIN five times within 10 minutes locks that gamertag for 10 minutes. On top of that, at most 20 wrong PINs per gamertag in 24 hours (D-123).

| Sheet tab | Columns |
|---|---|
| `players` | gamertag, gamertag_lower, salt, pin_hash, created_at, matches, wins, points, kos, falls, damage_dealt, damage_taken, achievements, last_won |
| `matches` | match_id, ended_at, stage, mode, lives, duration_s, winner, players_json |

The **leaderboard** ranks players by **points**. Each match gives placement points (1st 100, 2nd 60, 3rd 40, 4th 20) plus 1 point per 10 % damage dealt. The place counts every fighter of the match, bots included. A match is saved only with **at least two humans** in it; with one human (alone against bots) it is a practice match (D-161). Bots never appear in the sheet, the leaderboard or the achievements. It is read from `players`, cached on the server for 60 s, and shown in the host's lobby (not on the results screen, D-155).

**Achievements** belong to a player, are stored in the sheet and have no effect on gameplay. They show on the results screen and on the phone when earned. First set: First Win, Hat-Trick (3 wins), Heavy Hitter (1,000 % damage dealt in total), Untouchable (win without losing a life), Comeback (win on the last life above 150 %), Globetrotter (win on all three stages), Regular (10 matches), Special Delivery (KO with a special).

**The crown** (D-154) is cosmetic. A player whose last saved match was a win wears a small gold crown: on the fighter during a match (above the head), on the sprite of their lobby card (no text with it) and on the podium. Several players can wear one at the same time (each won the last match they played). It is stored in the `last_won` column (1 or 0) and changes with every saved result: the winner gets it, everyone else in that match loses theirs. A practice match or a result that does not count (§4 limits) changes nothing. Bots never wear one. If the sheet cannot be written, the server still changes its own copy at once, so the crown is right until the server restarts.

**One phone per account.** If a gamertag logs in on a second phone, the first phone is signed out with a clear message.

**If the sheet is unreachable:** logins of players already cached this session still work, new registrations show a clear error, match results are queued and retried, and the game itself keeps running.

**Local development and tests** use an in-memory store with the same interface. Tests never touch the real sheet.

## 5. Match rules

| Rule | Value |
|---|---|
| Players | 2 to 4 fighters: 1 to 4 humans plus bots (§5a). Alone: 1 to 3 bots. Two humans: 0 to 2. Three: 0 or 1. Four: none. |
| Lives | **1, 2 or 3**, chosen by the host in the lobby (default 3) |
| End of match | When only **one player is left**. No time limit (demo mode has a 120 s cap, §6b). |
| Damage | Starts at 0 %. Every hit adds damage. Higher damage means more knockback. |
| KO "LAUNCHED!" | Crossing the blast zone around the screen |
| KO "BURNOUT!" | Reaching **200 %** |
| After a KO | Lose a life, respawn after 2 s at the top centre at 0 %, 2 s of invincibility |
| Eliminated | Phone shows "You're out!" and a **vote for the next hazard** |
| Stage choice | The host picks on the laptop: **Vote** (the default) or one fixed stage. With a fixed stage the host presses Start as before. With Vote, Start opens the **map vote** (§10a); a tie or no vote at all is decided at random between the tied stages. |
| Starting | Only the laptop starts the match, once at least 1 human is Ready (logged in, fighter picked) and there are at least 2 fighters in all, bots included. Every human in the lobby must be Ready. The host can **close the room** so nobody else joins, and start with fewer than 4. |
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

## 5a. Bots

Bots fill places so that one or two people can still play a full match (D-156). Each bot has its own **level: Easy, Medium or Hard** (D-175). The three levels are three number sets in `config.js` (`bots.easy`, `bots.medium`, `bots.hard`) for the same code; they differ only in their numbers, never in what the bot knows or how fast a thumb could press (D-176). A "God" level is not part of this build; the question was dropped for now (D-183).

**Lobby (host page).** Under the player cards: **Add bot** and **Remove bot**. Add bot works only while a place is free (humans plus bots fewer than 4); Remove bot removes the bot added last. A bot gets a **random fighter**, if possible one that no human has picked; a click on the bot's card switches to the next fighter (D-159). A bot is always Ready. Bots can be added and removed only in the lobby, also while the room is closed.

**Level (D-175, D-177).** A new bot starts on **Medium**. Its lobby card has a level row with two arrow buttons, **◀ Medium ▶**, under the fighter name in place of the "Ready!" line; ◀ goes one level down, ▶ one level up, and they stop at Easy and at Hard (the arrow at the end is disabled). A click on the arrows changes only the level; a click anywhere else on the card still switches the fighter. The level belongs to the bot: it stays through matches, on the bench and back, until the bot is removed. The level is shown **only in the lobby** (the level row on the card); the name pill, HUD card, podium, stat card and phones show the BOT tag as before, without the level.

**Names.** Fixed nicknames in the order they are added: **Freshman**, **Intern**, **Erasmus**. Wherever a name is shown (lobby card, name pill, HUD card, podium, stat card) a bot also carries a small **BOT** tag (D-162). Bots never wear a crown.

**When a human joins.** If the room has no free place because bots fill it, the bot added last makes room: it leaves the lobby and waits on a bench. When a human leaves the lobby again, the bot that left last comes back, with the same name and fighter (D-158). Joining during the map vote, the intro or a match works as before (the newcomer plays in the next match); the bots of a running match stay in it until it ends, and the bench is settled when the room is back in the lobby. A human who took a bot's place still has to pick a fighter and press Ready.

**Map vote and intro.** Bots do not vote and have no Skip pip. The vote ends when every human of the vote has voted (alone: their vote decides) or after 10 s; the intro ends when every connected human has skipped or after 20 s (D-160).

**How a bot plays** (D-163; the same for every level, only the numbers differ). The bot is a pure function in `src/game/` that turns the match state into the same input a phone sends (left, right, up, down, attack, jump, special); the rules cannot tell a bot from a phone. Randomness comes only from `rng.js`, so a match with bots can be replayed in a test.

- **Target.** The nearest opponent, human or bot. The leader (most lives left, then the lowest damage) counts as a bit nearer than it is, so bots lean towards stopping whoever is ahead.
- **Moving.** Runs towards the target, jumps or double-jumps to reach a higher platform, drops through a platform (Down) to reach a lower one.
- **Fighting.** Attacks when the target is within reach and in front (holding Up when the target is above). Uses the special when it is ready and the target is in the special's range. Uses the stomp now and then when above a target.
- **Getting back.** Off the stage it steers towards the main ground, uses its double jump and the ledge grab, and climbs up with Jump. A medium bot does not fall off the stage by itself.
- **Items.** Picks up an item that lies on its way (same platform, close by) and uses a held item with its normal attacks. Holding the Group Project, it goes for the nearest opponent to pass it on.
- **Hazards.** Reacts only to what a human can see or read: once a hazard is announced (name and 3, 2, 1), it moves to a safe level, but not sooner. Like a player looking at their phone, it sometimes misses the warning and reacts only once the hazard is active (Easy 30 %, Medium 15 %, Hard 5 % of warnings, D-185). A late train that comes without a warning is a surprise for bots too.
- **Human limits.** A medium bot reacts with a delay of about a fifth of a second (it acts on what it saw a few frames ago), sometimes misjudges a distance and does not press buttons faster than a person on a phone could. **Target strength:** a first-time player on a phone wins about every second one-on-one against it. The numbers are in `config.js` (`bots.medium`) for the team to tune by playing.
- **Tipsy** (D-185). A tipsy bot first steers the wrong way, as a player who has just read "You're drunk!" does, and only after a moment (Easy 1 s, Medium 0.67 s, Hard 0.33 s) steers around the swap. After that it still gets it wrong now and then for a quarter of a second.
- **Easy and Hard** (D-176). Easy reacts later, misjudges more, attacks less and hesitates more often; Hard reacts sooner, misjudges less and attacks more. Every level keeps the human limits: it never reads hidden timers, sees the others with a delay of at least 6 frames (0.1 s) and presses no faster than `pressHold` 2 / `pressGap` 8 allow. **Target strength,** measured with the scripted simple human of the bot tests (the same script that wins about 63 % against Medium): it wins about **85 to 90 %** against Easy and about **25 to 35 %** against Hard.

**Details settled in the build** (D-166 to D-174). The bot sees the other fighters, items and hazards 0.2 s late and itself as it is now. The room keeps the bots as one ordered list whose first ones play and the rest wait on the bench; Remove bot also empties the bench. The roster gives each bot the slot it will get, and the server hands out the final slots at the start (`match_started`). A result line for a bot has no account and no points; the sheet's `matches` row lists only the humans, with `(bot)` as winner when a bot won.

**During a match.** A bot is an ordinary fighter: it can be hit, picks up items, gets the phone-less version of every effect (nothing is sent to any phone for it). A human whose phone disconnects keeps standing still as before; a bot never takes over a human's fighter (D-164).

## 6. Controls (phone, landscape)

Almost the whole screen is touch surface. There is **one control mode** (D-133): the floating joystick. There is no D-pad and no mode toggle.

| Left half | Right half |
|---|---|
| A floating **joystick** that appears where the thumb lands: left/right to move, hold up to look up, down to drop through a platform, fast fall or let go of a ledge | Three rectangular buttons: **Attack**, **Jump**, **Special** |

The joystick produces the input state `left, right, up, down, attack, jump, special`; the game logic only sees that state.

**Jump** jumps; pressing it again in the air is the **double jump** (one per airtime). It triggers on the press, so holding it does not repeat.

**Facing.** A fighter faces left or right (the last direction pressed) or **up while up is held**. **Attack and Special go where the fighter looks**, so holding up hits or reaches an opponent who is above or jumping over. A yellow strip in the Special button shows the cooldown.

**Attack in the air** (D-137): **Up + Attack** is the normal upward attack. **Attack without Up is the stomp**: the fighter stops moving sideways and drops straight down fast (18 px per frame); on landing a ring-shaped **shockwave** hits every opponent within **130 px** (centre to centre): 9 %, base_kb 6, kb_growth 9, 45° away from the stomper. Then the fighter needs **14 frames** to recover. It is a normal attack, not a special, so it has no cooldown; the recovery is its cost. If the fighter has not landed after **60 frames** (they fell past the stage), the stomp ends without a shockwave. Items: a held Book is still thrown in the air (no stomp); a held Sardine powers the stomp (it uses one swing, and the Sardine's damage and knockback apply). Attack on the ground is unchanged.

There is no shield.

The phone header shows the player's **name tag in their player colour**, damage % and lives. Player colours: P1 red `#e63946`, P2 blue `#2f7fe0`, P3 green `#22a36b`, P4 yellow `#f6c343`, always with the "P1" to "P4" label.

**Feedback on the phone** when something happens to its player: a vibration pattern (Android), a full-screen colour flash and a short sound (all phones, because iPhone browsers do not vibrate), and a one-line message such as "You're drunk! Drink water!". Every special that hits a player triggers this on that player's phone only.

Demo mode (a preset for the presentation) is described in §6b.

## 6a. What is on the big screen during a match

| Where | What |
|---|---|
| **Top left** | One card per player in a row: name and hearts in the player colour, damage % large. An eliminated player's card turns grey and shows **OUT**. |
| **Above each fighter** | A pill in the player colour with the name and hearts, and under it a thin damage bar |
| **Top right** | The hazard countdown (name, then 3, 2, 1) |
| Centre | KO texts and the final-KO sequence only |
| **Bottom centre** | A small, semi-transparent line `Press P or Esc to pause`, in the strip under the main ground so it never covers a platform. It shows during the countdown and the fight and is hidden from the final KO on. In a demo match the clock (§6b) stands here instead, and the pause hint is not shown. |

Whether the special is ready is shown **only on the phone** (a ring on the Special button). The phone header shows name, damage % and hearts, with no points and no placement.

**Damage colour** is a smooth gradient used for the % number and the damage bar: white at 0 %, **yellow at 100 %**, then orange, red, and dark red at 200 %.

**KO moments.** Each KO shows one of several short texts on the big screen ("LAUNCHED!", "SEE YA!", "DROPPED OUT!", "OUT OF OFFICE!"; for the 200 % rule "BURNOUT!", "NEEDS A GAP YEAR!") and a matching line with the lives left on that player's phone, with a long, strong vibration pattern and a red flash. An elimination vibrates longest.

**Final KO.** The last KO of the match is the big moment: the game drops to slow motion for **2 s**, the camera zooms in on the hit, the screen flashes and "FINAL KO!" appears. All phones vibrate. Then the end sequence of §10 starts.

## 6b. Demo mode

A preset for the course presentation (D-187 to D-209; the presenter's guide is [`DEMO.md`](DEMO.md)). The host switches it on and off with **Shift+D in the lobby**; there is no button, Shift+D does nothing outside the lobby, and a reload of the host page switches it off. While it is on, the lobby shows in its bottom left corner **DEMO MODE** and, smaller on a second line, **(to quit press Shift + D)** (D-208; no toast, and nothing is shown when it is switched off), and the lives selector is locked to the demo value.

All values are in `DEMO_SETTINGS` in `src/game/config.js`: **1 life**, a hard cap of **120 s** of fighting, the next hazard warning **5 to 8 s** after a hazard ends, and four fighters: **Maastricht Blondie, Lisboa OG, Finance Bro, Surfer Girl**. The phones' carousel shows only these (a phone on another fighter moves to the first of them and is no longer Ready), bots play only these, and a demo match with another fighter cannot start. Stage vote, intro and fighter select are unchanged.

At the cap, among the fighters still in the match, **more lives left** wins, then the **lower current damage %**, then more damage dealt. There is no final KO: the fighters freeze and **TIME!** appears for a moment, then the usual end sequence. During a demo match the fighting time left is shown as `m:ss` at the bottom centre of the big screen in place of the pause hint, large: it fills 80 % of the strip between the main ground (y 600) and the bottom edge (D-209). It stops while paused. A demo match is **never saved** (no sheet row, points, achievements, crowns or hourly count); the results say "Demo match: not saved."

## 7. Content

### 7.1 Fighters (8)

Pixel sprites, 81 px tall, three tones per colour, dark outline (style "HD pixel"). Each fighter has its own colour and holds its item **in the hand**. During the special the fighter pulls out the special's own item. A **held item** (Book, Sardine, Group Project, Megaphone, Cork Shield, Azulejo) is drawn **in the fighter's other hand** (the back hand; the front hand holds the fighter's own item), mirrored with the facing, and follows the arm in every pose: run, jump, attack and hang (D-139). The phone header keeps its label for the held item. A **name tag in the player colour** floats above every fighter. If two players pick the same fighter, the later player's top is drawn in their player colour.

**Normal attacks are identical for every fighter**: 8 % damage, 90 px range in the facing direction, base_kb 4, kb_growth 9, same timing. Only the look differs (a swing, a poke, or a short throw animation of the named item). Specials hit only inside their stated range, never the whole screen.

| Fighter | Weight | Speed | Normal | Special | Special effect | Phone message |
|---|---|---|---|---|---|---|
| Finance Bro | 100 | 3 | Laptop Swing | **Cash Rain** | Banknotes in a 220 px radius: 6 %, opponents slip and slide away for 1.5 s | "You slipped on cash!" |
| Maastricht Blondie | 85 | 4 | Tote Bag Swing | **Padel Smash** | Hits a ball forward: 14 % and strong knockback on the first opponent hit | "Smashed!" |
| Bairro Chad | 120 | 2 | Beer Throw | **Round's On Me** | 200 px radius: 7 %, tipsy (left and right swapped) for 3 s | "You're drunk! Drink water!" |
| Surfer Girl | 85 | 5 | Board Swipe | **Wave Rider** | Surfs 360 px forward on a wave: 10 % and pushes opponents along | "Wipeout!" |
| Wannabe Influencer | 90 | 4 | Selfie Stick Poke | **Ring Light Flash** | Only the **nearest** opponent within 320 px: 5 %, stunned 1 s, phone flashes white | "Blinded! No filter can save you." |
| House DJ | 100 | 3 | Vinyl Throw | **Bass Drop** | Jump and slam, 230 px radius: 12 %, launched up and to the side | "BASS DROP!" |
| Lisboa OG | 115 | 2 | Sardine Slap | **Ding-Ding** | A mini Tram 28 rolls along the ground: 12 %, sideways knockback | "Run over by the 28!" |
| Carcavelos Gang Member | 100 | 3 | Pizza Throw | **Spaghetti Lasso** | 380 px forward: pulls the first opponent hit to him, 6 %, 0.7 s stun | "Caught in the pasta!" |

Special cooldown: 6 to 8 s. Looks and colours are defined in `public/shared/art/characters.js`.

### 7.2 Stages (3)

Detailed illustration, drawn in code, true to the real places. Platforms are **part of the scenery** (roofs, canopies, balconies, a lifeguard tower) and every playable surface carries the stage's striped trim. The platform layouts are in `src/game/stages.js` (the rules and the art both read them).

| Stage | Time | Platforms | Hazards |
|---|---|---|---|
| **Nova SBE Campus** | Day | Terrace, CTT Student Hall canopy, Pingo Doce & Go roof, main roof, tower roof | **Cascais Line Train** across the terrace level · **Bad Wi-Fi**: inputs delayed 200 ms for 6 s · **Sudden Rain**: the whole map is slippery for 6 s |
| **Carcavelos Beach** | Day | Sandbank, surf-bar roof, açaí kiosk roof, lifeguard deck, lifeguard roof. Fort, Ponte 25 de Abril and Cristo Rei in the background. | **Big Wave** rises from the bottom and rolls across the sand · **Seagulls** steal an item · **Midday Sun** burns everyone on the sand |
| **Bairro Alto** | Night | Street without tram rails or overhead wires (with Erasmus Corner and its "BEER €1.50" sign), two balconies, the roof terrace of the bar The Spot, two roofs | **Drunk Crowd** pushes along the street and drags players with it · **Drinks** that make you tipsy for 8 s · **Fireworks** shoot up from five spots in the street |

**Three hazards per stage** (D-143 to D-148):

- **Cascais Line Train.** The train is drawn on the rails at the bottom of the screen (y 678 to 720), tall enough to reach up through the terrace level, where it hits (20 %). It looks like a Linha de Cascais unit: three long, low carriages of ribbed steel with a yellow cab front, **1,260 px** in all (D-150), so it covers most of the terrace while it passes. **25 % of trains are late:** the warning and 3, 2, 1 run as usual, then nothing happens and nothing is shown; **5 s later** the train arrives **without any warning**.
- **Bad Wi-Fi.** Inputs in one zone (the roofs or the ground floor, D-098) arrive 200 ms late for 6 s.
- **Sudden Rain.** Rain over the whole map for **6 s**: every fighter slips as with Cash Rain, on every platform. No damage, so it may cover everything. Rain over the stage, a darker sky, wet shine on the platforms; phone line "It's raining! Everything is slippery."
- **Big Wave.** It **rises from the bottom of the screen** at a random point in one random half of the sandbank, then rolls towards the far edge of the stage (the edge on the other side) and off it. Fighters standing on the sand that it touches are **dragged along** with it, strongly enough to carry them over the edge, and take 8 % once. Jumping onto a platform or over the wave escapes it. It stops dragging at the stage edge, so a dragged fighter flies on and falls, with a chance to grab the ledge. The water is drawn from the bottom edge of the screen up.
- **Seagulls.** A flock flies over one half of the beach (the sand or the roofs) for 2 s and takes what each fighter there holds, except the Group Project, plus one item lying there; a fighter with empty hands gets a 3 % peck and a very short stun (D-098, D-099).
- **Midday Sun.** For **5 s** every fighter on the **sand level** takes **2 % every 0.5 s** (at most 20 %). The roofs and the lifeguard tower are safe. Bright glare over the sand, heat shimmer; phone line "Sunburn! Get in the shade."
- **Drunk Crowd.** A crowd 300 px wide walks along the street and carries the fighters it touches with it, 5 % once (D-061, D-100).
- **Drinks.** Three drinks stand on one platform for 8 s; a fighter who touches one is tipsy (left and right swapped) for 8 s (D-016, D-098).
- **Fireworks.** Five marked spots in the street, one in each fifth of it (a glowing fuse on the ground during the warning). When it fires, a rocket 45 px wide shoots straight up from each spot. A fighter it touches in the street is **carried upward** with it for about **0.5 s**, then the rocket **explodes**: 12 % and a launch (base_kb 6, kb_growth 8, 80°). Fighters on the balconies and roofs are safe (the rockets start in the street). Coloured explosion particles; phone line "Fireworks! Santos Populares came early."

One hazard at a time. After a hazard ends, the next warning starts at a random point **10 to 15 s** later. The Big Wave and the Midday Sun show no hint in the picture during their warning, only the text in the top right (D-151). Every hazard is **announced as animated text only**: the hazard's name, then a large **3, 2, 1** where each number pops in on its own, on the big screen and on every phone. No box and no bar. On the big screen it sits in the **top right corner**, over open sky, so it never covers a platform or a fighter. **Every hazard can be escaped** by moving or jumping: each one only affects one level or zone, and at least one platform is always safe. (Sudden Rain is the one exception: it covers the whole map but does no damage.)

The campus roof carries the **Nova SBE logo**, redrawn from the official mark (source: Wikimedia Commons, `Nova_logo.png`, author Nova SBE, CC BY-SA 4.0). It is credited in `CREDITS.md` and stays the school's trademark.

### 7.3 Items (9)

A new one appears on a random platform every **6 to 10 s**, at most **4** at once, and each disappears after **25 s** (D-141; the numbers are in `config.js`). The chance of each kind is weighted: **Lucky Rooster 4 %**, the other eight **12 %** each. The Espresso was removed.

| Item | Kind | Effect |
|---|---|---|
| **Pastel de Nata** | on touch | Heals 20 %, never below 0 %. (The old Custard Tart, renamed.) |
| **Sardine** | held | The next 5 normal attacks do 6 % with very high knockback. Also powers the stomp (§6). |
| **Book** | held | The next attack throws it: 14 %. Thrown in the air too (no stomp). |
| **Group Project** | held, forced | Hot potato. Whoever touches it is stuck with it: it is taken even with full hands, and the item held before drops to the ground. A **5 s fuse** starts at the first pick-up and never resets. A normal attack (or a stomp) that hits an opponent passes it to them. When the fuse runs out it explodes on whoever holds it: 18 %, strong launch (base_kb 8, kb_growth 10, 70° upward). The holder's phone shows "Group project! Pass it on before the deadline!" and the seconds left; the big screen shows the fuse above the holder. |
| **Bifana** | on touch | Eaten at once: weight +40 for 10 s (harder to launch); the fighter looks a bit wider. |
| **Megaphone** | held | The next 3 normal attacks become a wide sound cone forward (200 px long, 140 px high): 3 % and a strong push (base_kb 9, kb_growth 6, 15°). Up + Attack blasts upward. In the air without Up the stomp is unchanged and does not use the Megaphone. |
| **Cork Shield** | held | Blocks the next hit of any kind (attack, special, projectile, hazard) completely: no damage, no knockback, no status effect. Then it breaks. It does not protect against falling out of the stage or the Group Project explosion. |
| **Azulejo** | held | The next attack throws the tile (in the air too); after 12 frames it shatters into 3 shards that fan out forward at -12°, 0° and +12°, each 5 % with small knockback; each shard hits one opponent once. |
| **Lucky Rooster** | on touch, rare | Invincible for 5 s (a golden glow): hits pass through without effect. Hazards still move the fighter (crowd, wave) but do no damage. |

Rules for all held items: one held item at a time (the Group Project is the exception: it is forced on whoever touches it); seagulls can steal any held item except the Group Project; a KO drops everything (held items and the Bifana and Rooster effects are gone).

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

**Host (laptop):** Title (no team names) → Lobby (QR code, room code, player cards, Add bot / Remove bot (§5a), stage choice: Vote or one of the three stages, close room, lives 1/2/3 (locked in demo mode, §6b), items and hazards on/off, **separate volume sliders for music and effects**, leaderboard) → Map vote (with Vote only, §10a) → Intro (§10b) → Countdown → Match (HUD with one card per player at the top) → End sequence and results on the podium (winner, per-player stats, points, new achievements; no leaderboard) → back to the lobby. There is no rematch button.

**Phone:** Register / log in → Fighter select (swipe through the 8 fighters, or the 4 of demo mode (§6b), one at a time, with the neighbours peeking in at the sides; each card shows the sprite, the two attacks and **Speed and Weight as five-step bars, without numbers**) → Ready (once ready, the button says **Switch character** and takes the player back to the choice, D-186) → Map vote (with Vote only, §10a) → Intro with a Skip button (§10b) → Gamepad → KO'd → Eliminated + hazard vote → Results.

### 10a. Map vote

Voting is the default; the host can still pick one fixed stage in the lobby (D-135).

- **Start.** With Vote chosen, the host's Start button opens the vote under the same rule as starting a match (§5: at least 1 Ready human and at least 2 fighters with the bots). The fighter select has no stage buttons. Bots do not vote (§5a).
- **Phone vote screen.** It looks and works like the fighter select: a swipe carousel of the three stages with the neighbours peeking in, dots under it, and a big **Vote!** button. Each card shows a preview picture of the stage (the stage art drawn small), the stage name, day or night, and the stage's hazards by name. A player may change the vote until the vote ends.
- **Big screen vote view.** The three stage previews side by side, large, each with its live vote count and the small sprites of the players who voted for it, and a 10 s countdown.
- **End.** When every player in the vote has voted, or after **10 s**, whichever comes first. A tie or no votes is decided at random between the tied stages. The winning stage is shown for about 1.5 s on both screens, then the match starts on it with the players of the vote.
- Players who join during the vote sit it out and play in the next match. A player who disconnects during the vote no longer counts: their vote is dropped and the vote does not wait for them.
- **Server.** The room has a `vote` phase between `lobby` and `match`. Stage votes are accepted only in that phase and only from players in the vote; a second vote replaces the first. The match that follows must use one of the stages with the most votes.

### 10b. Intro before every match

Before every match (after the map vote, or right after Start with a fixed stage) the big screen shows an intro for **20 s** over the dimmed stage (D-153).

- **Big screen.** "GET READY" and the stage name with day or night at the top. Under the heading **ITEMS**, three columns of cards with all nine items, each with its picture (the same art as on the stage), name and one line on what it does; every item card has a yellow frame, and the **Lucky Rooster** card also glows gold and carries a **RARE** tag. Next to them one column under **HAZARDS** with the three hazards of the chosen stage, each as a small animated picture (train, Wi-Fi with a red cross, rain cloud, wave, seagull, sun, crowd, beer glass, rocket) with its name and one line. There is no leaderboard. At the bottom: a 20 s bar with the seconds left, and **SKIP** with one pip per human of the match in the player colour (bots have none); the pip fills when that player has skipped, and a disconnected player's pip is faded.
- **Phone.** "GET READY", "Read the items on the big screen" and one big **SKIP** button. After a tap it turns green and says how many players are still reading.
- **End.** After 20 s, or as soon as **every connected player of the match** has pressed Skip, whichever comes first. A player who disconnects no longer holds it up. Then the usual 3, 2, 1 countdown starts. Buttons pressed during the intro do nothing.
- **Server.** A phone sends `skip`, with no other field. It is passed to the host only while a match runs and only from a player of that match; anything else in the message is a bad message. The intro screen is a `phase` named `intro` with the stage, the players, the seconds left and who has skipped.

Every error is shown in plain words next to where it happened ("That gamertag is taken", "Wrong PIN, 3 tries left", "Room not found", "Connection lost, reconnecting…").

**Lobby.** When a player joins, their slot appears on the big screen with a short entrance effect (flash and pop in the player colour, with a sound). Until that player has picked a fighter, the slot shows a **grey silhouette**; picking a fighter reveals the sprite. A bot's card shows its fighter, its nickname and the BOT tag at once, and its level with ◀ ▶ arrows (§5a); it plays the same entrance effect when it is added or comes back from the bench.

**End sequence and results screen** (D-155). It is drawn on the game canvas, on the stage of the match, right after the final-KO slow motion:

1. **0 to 1.8 s.** The camera zooms on the winner, who hops. "{NAME} WINS!" slams in with a screen shake and a burst of confetti.
2. **1.8 to 2.6 s.** The camera goes back, the stage dims, and the name moves to the top with "graduates with honours" under it.
3. **2.2 to 3.0 s.** Three podium blocks (1st in the middle, 2nd on the left, 3rd on the right, in the player colours) rise out of the stage's own main ground (y 600: the terrace, the sand, the street). The winner jumps onto the 1st block; the 2nd and 3rd, who were knocked out, drop in from above onto theirs. A 4th player falls in and lies flat on the ground to the right of the podium (the arms-up pose turned on its back, placed from the sprite's pixels so the body is centred under its card). With 2 or 3 players only their blocks rise.
4. **3.2 to 4.0 s.** Crowns from the last round (§4) pop off the other players and vanish; a new crown drops onto the winner (who keeps theirs if they already had one). Fireworks start over the stage and run until 10 s; confetti keeps falling.
5. **From 4.2 s.** A stat card pops in above each fighter (the 4th: above the fighter on the ground): place, name, damage dealt and taken, KOs and falls, then points and new achievements once the server has answered (a bot's card shows the BOT tag and no points). **Back to the lobby** appears at 5.2 s.

There is **no leaderboard** on the results screen; it stays in the lobby. A line at the bottom left says whether the result was saved.

## 11. How each grading criterion is covered

| Criterion | Coverage |
|---|---|
| It works | Deployed, health check, reconnects, every invalid input handled, sheet outage handled |
| UI and UX | One-scan join, auto-login, clear errors, hazard warnings, phone feedback, rotate hint |
| Scope | Real-time multiplayer over the network, phones as controllers, accounts, leaderboard, achievements, 8 fighters, 3 stages, hazards, items, bots |
| Verification | Unit tests for rules, combat, specials, items, hazards, bots; rejected actions and edge cases; server and protocol tests; a test of the sheet script (`Code.gs`); five browser test files; CI on every push and pull request |
| Security | §8 |
| Walkthrough | `docs/WALKTHROUGH.md`: how it is built, why, limits, what could change |
