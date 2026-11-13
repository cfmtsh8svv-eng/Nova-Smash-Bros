# NOVA Brawl: Walkthrough

This document explains how NOVA Brawl is built, why it is built that way, where its limits are, and how it could change. It is written so that any team member can say it out loud. Where the code is involved, the text explains the idea; the file names tell you where to look.

**Contents**

1. [The big picture](#1-the-big-picture)
2. [Five questions you will be asked](#2-five-questions-you-will-be-asked)
3. [Part 1: the game rules](#3-part-1-the-game-rules-srcgame)
4. [Part 2: the server](#4-part-2-the-server-server)
5. [Part 3: the client](#5-part-3-the-client-public)
6. [Security](#6-security)
7. [Tests](#7-tests)
8. [Known limits](#8-known-limits)
9. [How it could change](#9-how-it-could-change)
10. [Questions for each package owner](#10-questions-for-each-package-owner)
11. [How it was built](#11-how-it-was-built)

---

## 1. The big picture

NOVA Brawl is a fighting game for two to four players. A laptop (or projector) shows the game. Each player's phone is the controller, in the browser, with nothing to install.

There are three programs, and it helps to keep them apart:

| Program | Runs on | Its job |
|---|---|---|
| **Host page** | The laptop's browser | Shows the lobby, **runs the match**, draws it, plays the sound |
| **Phone page** | Each phone's browser | Log in, pick a fighter, be a gamepad |
| **Server** | A computer on the internet (Render) | Hands out the pages, keeps "rooms", passes messages between phones and host page, checks logins, saves results |

```
 phone ──buttons──▶ server ──buttons──▶ host page  (runs the match, 60 steps a second)
 phone ◀──damage, lives, vibration── server ◀── host page
                     server ──https──▶ Apps Script ──▶ Google Sheet  (players, results)
```

The code is in three packages that match this split:

| Folder | What is in it |
|---|---|
| `src/game/` | **The rules.** Everything that decides what happens in a match. Pure code: no screen, no network. |
| `server/` and `apps-script/` | **The server** and the small script inside the Google Sheet |
| `public/` | **The client:** `host/` (big screen), `play/` (phone), `shared/` (art, sound, connection) |

The most important design idea is the first row: **the rules do not know that there is a screen or a network.** They are a function: "here is the match, here is what everyone is pressing, give me the match one step later". The host page calls that function 60 times a second and draws the result. The tests call the same function without any browser. That is why nearly everything can be tested.

---

## 2. Five questions you will be asked

### Where is the data stored?

In a **Google Sheet** with two tabs:

- `players`: one row per player. Gamertag, a salt and a hash for the PIN (never the PIN itself), and the totals: matches, wins, points, KOs, falls, damage dealt and taken, achievements.
- `matches`: one row per finished match. Id, time, stage, lives, duration, winner, and a short list of the players' numbers.

Only the server reaches the sheet, through a small script that lives inside the sheet (`apps-script/Code.gs`). Browsers never talk to the sheet.

A few more things are stored, in other places:

- **On the phone** (the browser's local storage): the login token and the gamertag. That is what logs a returning player in automatically.
- **In the host page's tab** (session storage): the room code and the room's secret key, so a reload of the page keeps the room. It is gone when the tab is closed.
- **In the server's memory**, only while it runs: the open rooms, results that are waiting to be written, wrong-PIN counters. These are lost on a restart.
- **Nowhere:** the match itself. It exists only in the host page while it is played.

There is no database. That was a team decision: a sheet is something everyone can open and read.

### What do the tests cover, and what not?

**Covered** (about 530 tests, `npm test`, a few seconds):

- **The rules:** knockback, the 200 % burnout, every blast zone, respawn and invincibility, lives, how a match ends, jumping, aiming, each of the eight specials inside and outside its range, each item, each hazard with its safe platform, the vote, and that slow motion never changes a result.
- **The server:** every way a registration or login is refused, the lockout, tampered and expired tokens, who may start a match and submit a result, implausible results, malformed, oversized and unknown messages, reconnects, and what happens when the sheet is down.
- **End to end:** a real server, one host and four controllers over real WebSockets play a whole match with the real rules; the result arrives in the store and on the leaderboard.
- **In a real browser** (`npm run test:browser`): the host page plus an emulated iPhone and an emulated Android phone register, pick, ready up, start and play; the fighters on the big screen follow the phones and no page logs an error. A second test plays a whole evening (stage vote, three phones, a hazard announcement, an elimination with the hazard vote, results, a second match, removing a player, logging out). A third cuts the host's connection at the worst moments (around Start, in mid-match, when the match ends).

**Not covered:**

- **How it looks and sounds.** No test checks that a sprite is drawn in the right place or that a sound plays. That was checked by eye, with screenshots of every screen.
- **Real phones.** The browser test emulates phones in Chromium. Real iPhone Safari (vibration missing, audio rules, touch quirks) has to be tried by hand.
- **The real Google Sheet.** Tests use an in-memory copy with the same interface, and a fake network for the sheet client. The script in the sheet itself (`Code.gs`) is loaded into Node with a stand-in spreadsheet (`tests/server/sheets-script.test.js`) and fed the results the server really produces; how it behaves inside Google (the lock, the speed, the limits) was only tried by hand.
- **The network outside.** Slow Wi-Fi, a sleeping free host, many rooms at once: reasoned about and tried by hand, not automated.
- **Whether it is fun or fair.** Tuning values are a first guess.

### What happens if Google Sheets is unavailable?

The game keeps running, because the sheet is never used during a match.

- **Players who logged in since the server started** can still log in and play: the server remembers their row.
- **New players cannot register.** They get a clear message ("Can't reach the player list right now…"). A registration must be checked against the sheet, because a gamertag has to be unique.
- **Results are not lost.** A finished match goes into a queue in the server's memory. The server tries again after 2 seconds, then 4, 8, up to once a minute, until the sheet answers. The results screen shows the points at once and says that they are still being written.
- **The leaderboard** shows what the server knows (the last list from the sheet plus everything in the queue) and marks it as possibly out of date.

The one way to lose a result: the server restarts while results are still in the queue. That is stated under [Known limits](#8-known-limits).

### Why does the host page run the simulation?

Three reasons.

1. **It is smooth.** The match is drawn on the same computer that calculates it, 60 times a second, with no network in between. If the server ran it, every picture would have to travel over the internet first.
2. **The server stays tiny.** It only passes small messages on. That fits a free host and makes it very unlikely to be the thing that breaks.
3. **Phones only send button presses** (a few bytes), so even a weak connection is enough.

The price: **the host page is trusted.** The server cannot know what really happened in the match; it only gets the result at the end. Someone who controls the laptop could send an invented result. The server therefore checks that a result is *possible* (right players, right length, numbers that add up) and refuses the rest. For a party game on the team's own laptop that is acceptable; for a public ranked game it would not be (see [How it could change](#9-how-it-could-change)).

### How are PINs protected?

A PIN is four digits, so there are only 10,000 of them. Stored plainly, or with a simple hash, anyone who saw the sheet could try all 10,000 in a second. Four things prevent that:

1. **The sheet never contains a PIN.** It stores a **hash**: the result of a calculation that cannot be run backwards.
2. **The hash is slow on purpose** (`scrypt`). One try takes a noticeable fraction of a second of computer time, so trying many is expensive.
3. **Every player has their own salt**, a random value mixed into the hash. Two players with the same PIN have different hashes, and no prepared table of hashes helps.
4. **A pepper**, a secret that only the server knows (an environment variable, not in the sheet and not in the repository), is also mixed in. Someone who has only the sheet cannot test a single PIN.

Against guessing through the login form: **five wrong PINs within ten minutes lock that gamertag for ten minutes**, and on top of that there can be **at most twenty wrong PINs per gamertag in a day**. With the first rule alone, a patient guesser could try all 10,000 PINs in two weeks; with the second it takes more than a year. Logins for the same gamertag are checked one after the other, so sending many guesses at once does not get around the lock.

After a login the phone gets a **session token**. It says "this is Ana, valid for 30 days" and carries a signature made with a second server secret. Nobody can create or change a token without that secret. The phone sends the token instead of the PIN from then on.

---

## 3. Part 1: the game rules (`src/game/`)

### What it does

Everything that decides the outcome of a match: how fighters move, when an attack hits, how far someone flies, items, hazards, who is out, who wins.

### The idea: a function, not a program

```
createMatch({ stageId, players, settings, seed })   →  the match state (one plain object)
step(state, inputs)                            →  advances it by 1/60 second, returns events
```

- The **state** is one object with everything in it: where every fighter is, their damage, the items on the stage, what the hazard is doing.
- **Inputs** are what each player is pressing in this step: seven buttons (left, right, up, down, attack, jump, special).
- **Events** are what happened in this step: "hit", "ko", "jump", "hazardWarn", and "feedback" (a message for one player's phone). The host page turns events into pictures, sounds and phone messages.

Nothing in here touches the screen, the network or the clock. Even chance comes from a numbered seed (`rng.js`), not from `Math.random`. **The same seed and the same inputs always give exactly the same match.** That is what makes it testable, and it is why the tests can say "a hit from 195 % to 203 % is a burnout" and be sure.

### One step, in order

`match.js` does this 60 times a second:

1. For every fighter: read the input, turn it into speed (`physics.js`), start an attack or special if a button was pressed.
2. Move every fighter and sort out the platforms: land on them, bump into the ground's side wall.
3. Work out which attacks hit (`attacks.js`, `specials.js`). The normal attacks of a step are collected first and applied together, so two players who hit each other at the same moment both get hit. (A special takes effect at once, in player order.)
4. Move what flies (ball, book, tile and shards, mini tram), update items and the hazard.
5. Check who left the screen (a KO), and whether only one player is left.

### The pieces

| File | What is in it |
|---|---|
| `config.js` | **The tuning values of the rules**: gravity, jump height, attack damage, each special's numbers, item and hazard values. Change a number here to change the feel. |
| `fighters.js`, `stages.js` | The eight fighters (names, attack names, phone messages) and the three stages (platforms, start positions, which hazards) |
| `physics.js` | Running, jumping, gravity, platforms |
| `combat.js` | What a hit does: damage, knockback, KO |
| `attacks.js` | The normal attack and things that fly |
| `specials.js` | The eight specials, one small function each |
| `physics.js` (ledge grab) | `tryLedge` and `holdLedge`: grabbing the two corners of the main ground, hanging, climbing up, letting go (D-138) |
| `stomp.js` | The stomp: Attack in the air without Up drops straight down; landing sends out a shockwave (D-137) |
| `items.js`, `hazards.js` | The nine items (on touch, held, the forced Group Project with its fuse; D-140); the nine hazards, three per stage, with their warning, the late train and the next one 10 to 15 s after the last (D-143 to D-149) |
| `input.js` | The buffer between "messages arrive whenever" and "the game looks once per step" |
| `clock.js`, `loop.js` | Turning real time into steps; slow motion and hit pause |
| `scoring.js`, `view.js` | Points; damage colour and which pose to show |
| `bot.js` | The bots (GAME_SPEC §5a, D-163): turns the match state into a phone-style input. See [Bots](#bots-srcgamebotjs) |

### Three things worth being able to explain

**Knockback.** The formula from the spec:

```
launch speed = (base + growth × damage / 100) × (100 / weight)
```

More damage means a faster launch. A heavier fighter is launched more slowly. After a hit the fighter cannot act for a moment ("hitstun", 2.5 steps per unit of speed). A KO happens when a fighter leaves the area around the screen, or at once when the damage reaches 200 %.

**The input buffer.** Messages from a phone arrive at any moment, but the game only looks once per step. Without care, a quick tap that starts and ends between two steps would be lost. `InputBuffer` remembers "this button went down since the last step" and reports it once. If two presses arrive bunched together after a network hiccup, it plays them back on two steps instead of merging them.

**Slow motion that cannot change the result.** The final KO runs in slow motion for two seconds, and every hit freezes the game for a moment (a strong one a little longer). Both are done in `loop.js` by changing *when* the next step is taken, never *what* a step does. A step is always 1/60 second of game time. A test plays whole matches with and without these effects and checks that every event happens on the same step.

### Bots (`src/game/bot.js`)

**Where it lives and how its input gets in.** A bot is not a special kind of fighter. The rules cannot tell it from a phone: `createBot({ slot, level, seed })` makes a small object with the bot's memory, and `botInput(bot, state)` returns exactly what a phone's `InputBuffer.consume()` returns (`left, right, up, down, attack, jump, special` and the `attackP, jumpP, specialP` presses). On the host page, `game.js` keeps one bot per bot slot for the whole match and, in `getInputs()`, asks each of them for its input every step, next to the phones' buffers. `step()` did not change. The loop does not call `getInputs()` while the match is paused or held behind the intro, so the bots pause too. `botInput` only reads the state; a test checks that the state is byte for byte the same after the call.

**What it does.** Each step it picks a target: the nearest opponent, where the leader (most lives, then the lowest damage) counts as a quarter nearer. It finds its way over a small map of the platforms (which platform can be reached from which by jumping, double-jumping, a jump at an angle to a platform beside and up to 170 px higher, dropping through, walking off an edge onto a lower platform beside, or hopping across a gap; D-181), works out the first hop of the shortest way and runs, jumps or presses Down. If that first hop is a platform in an announced hazard's zone, it takes a safe neighbouring platform from which the goal can still be reached. It double-jumps towards a higher platform only when it is close to it at the side. In reach it attacks (with Up for a target above), uses its special when it is ready and the target is in that special's range (Wave Rider only where the ride ends above the main ground), and now and then stomps from above. Off the stage it steers to the main ground, double-jumps at ground level and lets the ledge grab catch it, then climbs with Jump. On the ground it never runs towards a spot with nothing below it, so it does not walk off by itself. It picks up items lying on its own platform close by (never the Group Project), and with the Group Project in its hands it goes for the nearest opponent to pass it on. Once a hazard is announced it moves to a level outside the hazard's zone and stays out of it until the hazard is over.

**Human limits.** The bot keeps the last few snapshots of what it saw and decides on the one from `reactionFrames` steps ago (18 steps on Easy, 12 on Medium, 8 on Hard); only its own fighter it knows as it is now. Every `aimEvery` steps it draws a new misjudgement of up to `aimError` px that it adds to where it thinks the target is. Every press of Attack, Jump, Special or Down is held for `pressHold` steps, and the same button is pressed again only `pressGap` steps after it was let go, like a thumb on a phone. Now and then (`hesitateChance`) it stops and thinks for `hesitateFrames`. Hazards: it only reads what the screen shows (the announced hazard, its zone, the train, wave or crowd once they are there). It never reads the timer of the next hazard or the late train's delay, so a late train surprises it too. A test runs the same match with and without a hazard queued and checks that the bots press exactly the same buttons until the warning appears.

**Randomness.** A bot has its own seeded random numbers (`rng.js`), started from the match seed and its slot. A match with bots replays exactly, which the tests use.

**Levels** (D-175, D-176). A bot plays at **Easy**, **Medium** or **Hard**. The three levels are three number sets in `config.js` (`bots.easy`, `bots.medium`, `bots.hard`) with the same keys, read by the same code: `createBot({ slot, level, seed })` only picks the set (an unknown level plays as Medium), and `BOT_LEVELS` (`['easy', 'medium', 'hard']`) is the list the server and the host page use. The numbers that differ:

| Key | Easy | Medium | Hard |
|---|---|---|---|
| `reactionFrames` | 18 (0.3 s) | 12 (0.2 s) | 8 (0.13 s) |
| `aimError` | 40 px | 26 px | 10 px |
| `attackChance` | 0.17 | 0.2 | 0.3 |
| `specialChance` | 0.01 | 0.02 | 0.04 |
| `stompChance` | 0.02 | 0.04 | 0.06 |
| `hesitateChance` / `hesitateFrames` | 0.015 / 30 | 0.01 / 20 | 0.003 / 12 |
| `climbDelay` | 20 | 12 | 8 |

`aimEvery` (40), `leaderBias` (0.25), `itemReach` (200 px), `pressHold` (2) and `pressGap` (8) are the same for all three. **Every level keeps the human limits:** it sees the others at least 6 steps late (0.1 s), presses no faster than `pressHold` 2 and `pressGap` 8 allow and never reads a hidden timer. A test checks this for every level, so a Hard bot is quicker and more accurate than a Medium one, not better informed.

**Tuning.** To make a level harder, lower `reactionFrames` (never below 6), `aimError` and `hesitateChance` and raise `attackChance`; to make it easier, do the opposite. `attackChance` moves the result most, then `hesitateChance` and `reactionFrames`. The targets (D-157, D-176): a first-time player on a phone wins about every second one-on-one against Medium; the scripted "simple human" of `tests/helpers/bots.js` (walks to the bot, attacks in reach, sees everything 0.25 s late, presses with perfect rhythm) wins about 85 to 90 % against Easy, about 63 % against Medium and about 25 to 35 % against Hard. Results jump around a lot between seeds, so tune on many: `botMatch({ level, others: simpleHuman(), ... })` over 60 seeds per stage gave 89 % against Easy, 69 % against Medium and 25 % against Hard (D-179). `tests/game/bot.test.js` plays 15 of those matches per level and checks the order and the rough range; how it feels can only be judged by playing.

### Why it was built this way

- **Pure rules** so they can be tested without a browser, and so one person can understand them without knowing anything about networks.
- **One state object** so the rules are easy to follow: there is no hidden information anywhere else.
- **All numbers in one file** so tuning after playtests is a one-line change.

### Limits

- Fighters are boxes. Hits are "does this rectangle touch that rectangle". That is simple and fair, but an attack can hit a little outside the drawn sprite.
- No shield, no grabs, no combos: decided by the team to keep it understandable in ten seconds.
- The numbers are a first tuning. A scripted test player finishes matches quickly; real players will show what needs changing. The same goes for the bots' numbers.
- The bot is a set of rules of thumb, not a planner: it does not dodge attacks, does not read the opponent's special cooldown and does not edge-guard. That fits "a first-time player" (D-157). Hard is the same rules with quicker numbers; a bot that plays smarter would need new behaviour (the God level, O-13, not built).
- With no time limit, a match between players who never fight never ends. The host can end it from the pause screen.

---

## 4. Part 2: the server (`server/`)

### What it does

One small Node.js program that does four jobs:

1. **Hands out the pages** (the files in `public/` and `src/game/`).
2. **Keeps rooms** and passes messages between the phones and the host page in each room.
3. **Accounts:** register, log in, session tokens, lockout.
4. **Results:** checks a finished match, works out points and achievements, saves them, and serves the leaderboard.

### Rooms and messages (`rooms.js`)

When the host page clicks "Open a room", the server creates a room with a 4-letter code. The QR code is just the link `…/play?room=CODE`. A room has four slots.

Every page has one **WebSocket** to the server: a connection that stays open so both sides can send small messages at any time. Messages are small JSON objects with a type:

| Who sends | Type | Meaning |
|---|---|---|
| Phone | `join` | "I am this player (token), let me into room CODE" |
| Phone | `input` | The seven buttons, as one number, with a running counter |
| Phone | `pick`, `vote` | Fighter and ready; stage vote (only in the map vote) or hazard vote (only during a match) |
| Host | `vote_start`, `vote_cancel` | Open the map vote for the ready players; give it up |
| Host | `bots` | The lobby's bots as `{ fighter, level }`, in the order they were added (lobby only, at most 3) |
| Host | `match_start`, `match_result`, `match_abort` | Start, finish, cancel a match |
| Host | `to` | "Pass this on to phone 2" or "to all": `phase` (which screen), `status` (damage, lives), `feedback` (vibrate, flash, text) |
| Server | `roster` | To the host: who is in the room |

**The server trusts nothing it receives.** Every message goes through one function that checks, in this order: is it text, is it small enough, is this sender sending too fast, is it valid JSON, is the type known, **is this sender allowed to send this type**, and are the fields what they should be. Anything else is dropped and counted; a sender that keeps doing it is disconnected. The server never crashes on a bad message.

**Who may do what** is one table per role. A phone's table simply has no "start a match" entry. If a phone sends `match_start`, the answer is "Only the host screen can do that" and nothing else happens. The slot number of an input is taken from the connection, never from the message, so a phone cannot press another player's buttons.

**The map vote** (round 2, D-135, D-136) is a room phase of its own: `lobby` → `vote` → `match` → `lobby`. The host's `vote_start` is checked like a match start (every human in the lobby Ready, at least one of them, and at least two fighters with the bots). In the `vote` phase the server accepts a stage vote only from a player in the vote and keeps the latest vote of each; a player who leaves or loses the connection loses their vote. The `match_start` that follows must name one of the stages with the most votes, so a host page cannot quietly ignore the vote.

**Bots in the room** (round 4, D-156 to D-165). The room keeps the bots, so a reload of the host page does not lose them and the start and result checks can count them. They are an ordered list `room.bots` (named Freshman, Intern, Erasmus by their place in it); the first `room.botsActive` of them play, the rest wait on a **bench**. Bots have no phone and no entry in `room.slots`. Every time the roster goes out in the lobby, `settleBots` makes sure humans plus active bots never exceed four: a human who joins sends the last active bot to the bench, and when a human leaves, the bot that went there last comes back. Outside the lobby nothing moves; the bench is settled when the room is back there. The host's `bots` message (`{ t: 'bots', bots: [{ fighter, level }, ...] }`, D-178) sets the fighters and levels of the active bots: the same length changes them and keeps the bench, a shorter list removes bots and empties the bench. A malformed message (an unknown fighter or level, a missing or extra field, the old `fighters` form) is a strike. Each bot keeps its level, also on the bench. The roster lists the active bots with `bot: true`, their `level` and the slot each would get. **Starting** needs at least one Ready human, every human in the lobby Ready and at least two fighters with the bots; at the start the bots get the slots the humans of the match do not use, in ascending order, and the server keeps them with their levels with the match (`room.match.bots`) and sends them in `match_started` (and in the `room` message after a host reconnect). The level is not part of a result. A phone that joins during the match may get the slot number of a bot of that match: the server passes its input on as usual, and the host page ignores input for any slot that has no phone in the match.

**Reconnecting.** A phone that drops keeps its slot: for 30 seconds in the lobby and the map vote, and until the end of the match during a match. When it comes back with its token it gets the same slot, and the server replays the last screen and status so it is up to date at once. The host page can also reconnect: when it created the room it got a secret key, and with that key it takes the room back.

### Accounts (`accounts.js`, `app.js`)

Described in [How are PINs protected?](#how-are-pins-protected). Two more details:

- **Gamertags** are 3 to 12 characters from letters, digits and `_`, and unique ignoring upper and lower case. That limited alphabet matters for security: a gamertag can never start a spreadsheet formula (`=`, `+`, `-`, `@`) and can never contain HTML.
- **One phone per account.** Every login gets a new session number, and the newest wins. If the same gamertag logs in on a second phone, the first one is told "This account was opened on another phone" and is disconnected.

### Results (`results.js`)

At the end of a match the host page sends the result. The server:

1. Checks that it comes from the host of this room and belongs to the match that was started (one result per match id).
2. Checks that it is **possible**: the same players that started, the stage and lives that were chosen, a duration no longer than the time since the start, exactly one winner who still has a life, KOs that do not exceed falls, damage within what the lives allow.
3. Works out **points**: 100, 60, 40, 20 for places one to four, plus 1 point per 10 % damage dealt.
4. Works out **achievements** from the player's totals (First Win, Hat-Trick, Heavy Hitter, Untouchable, Comeback, Globetrotter, Regular, Special Delivery).
5. Puts everything into the queue for the sheet and answers the host page at once.

Every human fighter belongs to a logged-in phone (keyboard players were removed in round 2, D-132). A bot's line names its slot from `room.match.bots` and is checked like every other line (and must still have the fighter it started with); it has no account, gets no points, achievements or crown, and is left out of the `matches` row (a bot that won is written as `(bot)`). The humans' places count the bots (D-161). If fewer than two of the humans' accounts can be read when the result arrives (only one human played, or the sheet is down), the match is a "practice match" and is not stored; a player whose account could not be read gets no points.

### The store (`store/`, `data.js`, `apps-script/Code.gs`)

All access to stored data goes through one small interface with four operations: get a player, create a player, record a match, list players. There are two implementations:

- `store/sheets.js`: sends each operation as one HTTPS request to the script in the Google Sheet.
- `store/memory.js`: keeps everything in the server's memory. Used when no sheet is configured, and in every test.

Because both have the same interface, the rest of the server does not know which one it is using. That is why the game is fully playable without any setup, and why the tests never touch the real sheet.

On top sits `data.js`, which makes the slow sheet bearable: it remembers players it has read, queues results and retries them, and reads the leaderboard at most once a minute. A result the script refuses as invalid is not retried (it would be refused again); it is dropped, logged and counted as `droppedResults` at `/healthz` (D-182).

The script in the sheet (`Code.gs`) is the last guard before a cell is written. It checks the shared secret, **validates everything again**, and does every read-then-write inside a **lock**, so two requests at the same moment cannot both take the same gamertag or lose each other's points. It writes the match row first; that row is the marker that makes a repeated request change nothing.

### Why it was built this way

- **Plain Node, two small dependencies** (`ws` for WebSockets, `qrcode` for the QR image). Fewer dependencies means fewer things that can have security problems or break.
- **One process** that serves pages and messages on one port. It works on every network that allows normal web traffic, which matters on a university Wi-Fi.
- **The server holds all secrets.** Browsers get none.

### Limits

- **The host page is trusted for results** (see above).
- **Rooms and the queue live in memory.** A restart closes all rooms and can lose results that were not written yet. The free host restarts when it wakes up from sleep.
- **One server.** All rooms are on one machine; there is no way to spread them over several.
- **The sheet is slow** and limited by Google. Fine for a class, not for thousands of players.

---

## 5. Part 3: the client (`public/`)

### The host page (`public/host/`)

| File | What it does |
|---|---|
| `main.js` | The screens: title → lobby → map vote (with Vote) → intro → match → end sequence and results → lobby. Talks to the server. |
| `game.js` | Runs one match: collects the inputs, calls the rules, turns events into effects, sound and phone messages |
| `render.js` | Draws one picture of the match |
| `fx.js` | Particles, damage numbers, screen shake, big texts |
| `intro.js` | The 20 s intro before every match: item and hazard cards, timer, Skip pips (GAME_SPEC §10b) |
| `icons.js` | Item and hazard pictures shared by `render.js` and `intro.js` |
| `ceremony.js` | The end sequence after the final KO: name slam, podium rising from the stage ground, crowns, fireworks (GAME_SPEC §10) |

**The loop.** The browser calls our function before every screen refresh (usually 60 times a second). Each time: ask the clock how many rule steps are due, run them, then draw the current state. Drawing never changes the state. If the laptop is slow, fewer pictures are drawn but the rules still take the same steps, so the game does not slow down or speed up.

**Held items** are drawn in the fighter's back hand (D-139). `handPoint` in `public/shared/art/characters.js` works out where that hand is in each pose with the same arm and lean angles the sprite is drawn with, so the item follows the arm when running, jumping, attacking and hanging.

**Drawing order**, back to front: the stage (one prepared picture), hazards behind the fighters, items, fighters, things that fly, hazards in front (train, wave, crowd, rain, rockets), effects, name tags, and last the display on top: player cards top left, hazard countdown top right, big texts in the middle.

**The lobby** shows the QR code, the four slots and the settings. A new player's card pops in with a flash in their colour; until they have chosen a fighter it shows a grey silhouette. The stage choice is **Vote (default)** or one of the three stages. Under the cards, **Add bot** and **Remove bot** send the server the new list of bot fighters; a new bot gets a random fighter nobody has picked if there is one (`Math.random` is fine here, it is not part of the match). A bot's card acts as a button (`role="button"`, a click, Enter or Space switches it to the next fighter); under the fighter name, in place of the "Ready!" line, it has its level row **◀ Medium ▶** (D-177). A new bot starts on Medium; the arrows are real buttons ("Freshman: easier", "Freshman: harder") that change only the level and stop at Easy and Hard. Every change sends the whole `bots` list with fighters and levels, and `game.start` creates each bot with its own level. The level is shown only on this card. Bots carry a BOT tag wherever their name is shown (card, name pill, HUD card, podium, stat card), never wear a crown, have no voter sprite in the map vote and no Skip pip in the intro, and nothing is ever sent to a phone for them.

**The map vote.** With Vote, Start opens the vote screen: the three stage pictures side by side, each with its live count and the small sprites of the players who voted for it, and a 10 s countdown. The host page counts the votes as they come in and ends the vote when every player who still counts has voted, or when the time is up. It draws the winner with `tallyVote` (a tie is random among the tied stages), shows it for 1.5 s, then starts the match. The stage pictures are the stage art drawn small (`paintStage` in `public/shared/art/sprites.js`).

### The phone page (`public/play/`)

| File | What it does |
|---|---|
| `main.js` | The screens: log in → fighter select → map vote → intro (Skip) → gamepad → results. Which one is shown is decided by `phase` messages from the host. |
| `controls.js` | The joystick and the three buttons |
| `feedback.js` | Vibration, flash and sound |

**One control mode.** The floating joystick and the three buttons produce seven buttons (left, right, up, down, attack, jump, special); the game only sees those. There used to be a D-pad as a second mode; round 2 removed it (D-133). Touches are handled with Pointer Events: every finger is tracked separately, which is what makes "hold right and tap Jump" work. The joystick appears where the thumb lands; a small dead zone around that point keeps a resting thumb from moving the fighter, and the centre follows a thumb that drifts past the rim. The numbers are at the top of `controls.js`.

**Sending input.** Whenever the buttons change, the phone sends all seven as one number together with a running counter. Ten times a second it sends the same state again as a heartbeat. If the host hears nothing from a phone for 0.6 seconds, it lets go of that phone's buttons, so a phone that fell asleep or lost its network for a moment cannot leave its fighter running off the stage. When the phone is heard again, a button that is still down simply carries on.

**Feedback on every phone.** iPhones have no vibration in the browser. So every event that concerns a player does three things together: vibrate where the phone can, flash the whole screen in a colour, and play a short sound. Sound is only allowed after the player has tapped once, so the first tap unlocks it. Every one of these is wrapped so that a missing feature is skipped instead of causing an error.

**Small things that matter on a phone:** zoom, text selection, scrolling and the long-press menu are switched off on the gamepad; the page asks the phone to keep its screen on (and carries on if that is refused); in portrait it shows a "turn your phone" hint.

### Art and sound (`public/shared/`)

- **Fighters** are drawn by code as vector shapes (`art/characters.js`), then turned into small pixel pictures (`art/sprites.js`): draw it small, snap every pixel to a palette of three tones per colour, add a one-pixel dark outline. The arms, legs and the held item are parameters, so the same drawing code produces every pose (idle, run, jump, attack, special, hurt…). All poses are prepared before a match starts; drawing a frame is then only copying pictures.
- **Stages** are also drawn by code (`art/stages.js`), once, into one picture that is reused every frame. The platform positions come from the rules (`src/game/stages.js`), so the picture and the physics cannot disagree.
- **Sound** is synthesised (`audio.js`): short tones and bursts of noise for effects, and a tiny step sequencer for the music. There are no sound files, so nothing to license.
- **The connection** (`net.js`) reconnects by itself with growing pauses, and measures the delay with pings.

### Why it was built this way

- **No framework and no build step.** The browser loads the files as they are. There is nothing between the code in the repository and what runs.
- **Canvas** for the match (fast, full control), normal HTML for menus (easy to lay out, readable, accessible).
- **Art in code** so there are no image files to manage and the team could choose looks from generated options.

### Limits

- Pixel sprites are scaled by a factor that is not a whole number, so pixels are not perfectly even on every screen.
- The host page needs a reasonably modern browser; Chrome on a laptop is what was tested.
- Sound is simple by design.
- If the host page is reloaded during a match, that match is gone (the room and the players stay).

---

## 6. Security

What is enforced, and where:

| Rule | Where |
|---|---|
| No secret in the repository. `.env` is ignored; `.env.example` has names only. | `.gitignore`, `server/config.js` |
| Four secrets, read only from the environment: sheet URL, shared secret, PIN pepper, session secret | `server/config.js` |
| Every HTTP body and every WebSocket message is validated: type, size, fields, allowed characters | `server/app.js`, `server/rooms.js`, `server/validate.js` |
| Rate limits: per address for the API, for logins and for new rooms; per connection for messages | `server/security.js`, `server/config.js` |
| Gamertags cannot start a formula or contain HTML | `server/validate.js`, checked again in `apps-script/Code.gs` |
| Only the host may start a match, submit or cancel a result, or talk to the phones | The role tables in `server/rooms.js` |
| One result per match, and only a possible one; not sooner than the match could have been played; at most 120 counted matches per player per hour | `server/rooms.js`, `server/results.js` |
| What the host passes on to phones is checked field by field | `relayProblem` in `server/rooms.js` |
| The host can remove a player; a phone can log out everywhere | `kick` and `logout` in `server/rooms.js` |
| Limits on rooms, connections and join attempts per address; a receiver that stops reading is cut off | `server/config.js`, `server/rooms.js`, `server/app.js` |
| PINs: slow hash, salt, pepper; lockout after five misses, twenty a day at most | `server/accounts.js`, `server/app.js` |
| Session tokens are signed and expire after 30 days | `server/accounts.js` |
| Browser protections: a strict Content-Security-Policy (nothing is allowed except our own files, no inline scripts, WebSockets only to this server), no MIME sniffing, no referrer, no framing, https-only on the public host | `server/security.js` |
| A WebSocket is only accepted from our own pages (Origin check) | `server/app.js` |
| Files outside the public folders cannot be requested | `server/static.js` |
| Text from other players is always inserted as text, never as HTML | `public/**/main.js` (`textContent`) |
| The sheet script checks the shared secret, validates again, uses a lock | `apps-script/Code.gs` |
| Two runtime dependencies, exact versions, lockfile committed, `npm audit` in CI | `package.json`, `.github/workflows/ci.yml` |

What is deliberately **not** protected, and why: see the next section.

---

## 7. Tests

| Command | What runs |
|---|---|
| `npm test` | `tests/game/` (the rules) and `tests/server/` (the server, including the end-to-end match) |
| `npm run test:browser` | The four files in `tests/browser/` in a real browser: `smoke` (join and play), `flow` (a whole evening), `regressions` (connection drops), `bots` (one phone and bots, the level arrows, the bench) |
| `npm audit --audit-level=high` | Known problems in dependencies |

All three run in GitHub Actions on every push and pull request.

How the tests are organised:

- `rules`, `movement`, `ledge`, `stomp`, `hand`, `specials`, `items`, `hazards`, `input`, `view`: one file per area of the rules.
- `exact.test.js` (rules) and `strict.test.js` (server): tests that use the **literal numbers from the spec** instead of reading them from the code, so changing a rule by accident fails a test.
- `regressions.test.js` (rules, server, browser): tests for the defects the reviewers found. In the rules and the server there is one for each defect, and each failed before its fix. In the client, the defects a browser test can reach are covered (connection drops, a held button through a KO); the rest was checked by hand.
- `accounts`, `rooms`, `reconnect`, `results`, `outage`, `http`, `e2e`, `bots`, `vote`, `intro`, `crown`: the server by topic. `sheets-script` runs `apps-script/Code.gs` in Node against a stand-in spreadsheet.
- `tests/helpers/`: `server.js` starts a real server on a random port, `game.js` sets up matches, `scripted-player.js` is a simple scripted player for whole matches, and `bots.js` holds the bot-tuning helpers (`botMatch`, `simpleHuman`).
- `bot.test.js` (rules): the bots play with the real rules. It checks that a match with bots replays exactly, that a bot does not fall off by itself, gets back to the stage, gets from every platform to every other one on each stage (and from a standing start on one Bairro Alto balcony to the other, D-181), beats a standing opponent, ends a match against another bot, reacts no sooner than its reaction delay, ignores a hazard until it is announced and then leaves its level, never changes the state and presses like a thumb, and that a scripted simple human wins some but not all matches against it (`tests/helpers/bots.js`). The stage, recovery, standing-opponent, two-bot and reaction tests run again for each level (Easy gets 60 s and 4 minutes), every level must have the keys of Medium and the human limits, and the simple human must win at least 11 of 15 against Easy, 3 to 13 against Medium and 1 to 8 against Hard, strictly fewer from level to level.

Tests use Node's built-in test runner. There is no test framework to learn.

A useful sentence for the walkthrough: *"A test is only worth something if it fails when the behaviour is wrong."* Independent reviewers checked exactly that by breaking the code on purpose in a copy (for example "allow two double jumps", "let a fifth player in") and looking at which breaks no test noticed. The gaps they found were closed.

---

## 8. Known limits

Say these plainly when asked; they are choices, not accidents.

1. **The host page is trusted.** It runs the match and reports the result. The server only checks that a result is possible. Whoever controls the laptop could invent a plausible result.
2. **The free host sleeps** after 15 idle minutes and takes up to a minute to wake. Open the URL before the demo.
3. **A server restart** closes all rooms and can lose results that were still waiting for the sheet. Wrong-PIN counters start again.
4. **Google Sheets is slow and rate-limited.** It is never used during a match, but registration needs it.
5. **A 4-digit PIN is weak** by nature. Salt, pepper, a slow hash and the lockout make it reasonable for a party game. It is not suitable for anything valuable.
6. **Anyone can lock a gamertag** by entering wrong PINs for it: ten minutes after five misses, up to a day after twenty. That is the price of a lockout by name. A phone that is still logged in is not affected; only a new login with the PIN is.
7. **A room code is four letters.** Guessing is slowed down (only logged-in players learn whether a room exists, attempts are limited), and the host can remove a stranger and close the room, but a code is not a password.
8. **Accounts are free.** Someone who registers many gamertags and runs their own "host" can still collect points slowly (at most 120 counted matches per account per hour). The leaderboard is for fun, not for prizes.
9. **After a server restart**, the server no longer knows which phone logged in last until that phone shows up again, so an older login (also one that was logged out) can work again, and the wrong-PIN counters start from zero.
10. **The sheet is written at most once per match.** The script writes the match row first and the players' numbers after it. If Google fails in between, the retry sees the match row and adds nothing, so those points are lost rather than counted twice.
11. **No bad-word filter** for gamertags (team decision).
12. **Vibration does not work on iPhones** (a browser limit); flash and sound replace it.
13. **Tuning is a first version**, the bots' numbers too (`bots.easy`, `bots.medium`, `bots.hard` in `config.js`). They were tuned against a scripted player; real players on phones will show what needs changing.
14. **Demo mode is not built.** What was agreed is in `DEMO.md`.
15. **The big screen needs a current browser** (Chrome, Edge, Firefox or Safari from 2023 on). The phone page also runs on older phones (iOS 15 and later).

---

## 9. How it could change

| If we wanted… | We would… |
|---|---|
| **Results nobody can fake** | Run the rules on the server too. Because the rules are pure and repeatable, the server could replay a match from the recorded inputs and check the result, or run the match itself. |
| **More players or many rooms** | Replace the sheet with a real database, and keep rooms in a shared store so several servers can run. Only `server/store/` and `server/data.js` would change, because everything goes through one interface. |
| **Demo mode** | Add a lobby toggle that sets three values in the settings object (1 life, hazards every 15 s, a 120 s time cap). The time-cap rule already exists in the rules and is tested. Two more places must then learn about it: the host has to send the cap with the start, and the server's result check has to accept a match that ended at the cap (today it refuses those on purpose). |
| **A ninth fighter** | Add its looks in `public/shared/art/characters.js`, its numbers in `config.js`, its texts in `fighters.js` and one function for its special in `specials.js`. |
| **A new stage** | Add platforms and hazards in `src/game/stages.js` and a drawing function in `art/stages.js`. |
| **A new hazard or item** | One entry in `hazards.js` or `items.js`, numbers in `config.js`, one test for its safe platform. |
| **Better feel on bad networks** | Inputs already carry a counter. The host could measure each phone's delay and show it, or hold inputs for a few milliseconds to even out jitter. |
| **Stronger accounts** | Longer PINs or passwords; the hashing would stay as it is. |
| **A "God" bot** (O-13) | Numbers alone make the bot quicker, not smarter. It would need new behaviour in `bot.js`: dodging an attack it sees coming, waiting at the edge for a fighter coming back, punishing a missed attack. It must keep the human limits, or it is not hard but unfair. |
| **Sound with more character** | Replace the synthesised effects by recorded ones. Only `audio.js` would change. |

---

## 10. Questions for each package owner

Each member owns one package and explains it. These are the questions each owner is most likely to get, with plain answers.

### For the owner of the game rules (`src/game/`, `tests/game/`)

**1. How does a hit work, from the button press to the fighter flying away?**
The press starts an attack that lasts 20 steps. From step 5 to 8 it has a hit area: a rectangle reaching 90 px in the direction the fighter looks (or up, if Up is held). If it touches another fighter's box, that fighter gets 8 % damage and is launched. The launch speed is `(4 + 9 × damage/100) × (100/weight)`: more damage, more speed; more weight, less. For a moment the fighter cannot act. If they leave the area around the screen, or their damage reaches 200 %, they lose a life.

**2. Why are the rules separate from everything else?**
So they can be tested without a browser and understood without knowing the network. `step(state, inputs)` takes the match and the buttons and returns the match one step later. No screen, no clock, not even `Math.random`: chance comes from a seed, so the same match can be replayed exactly.

**3. How do you make sure a hazard is fair?**
Two rules. First, every hazard is announced: its name for a second, then 3, 2, 1, and only then does it start. Second, every hazard only touches one level or zone, so at least one platform is always safe. There is one test per hazard that puts one fighter in the zone and one on a safe platform and checks that only the first is affected.

**4. Does the slow motion at the final KO change the game?**
No. Slow motion and the short freeze on hits only change *when* the next step happens, never what a step does. A test plays whole matches with and without them and compares every event, step by step.

**5. Where would you change something if a fighter is too strong?**
In `src/game/config.js`. Every number is there: the special's damage, range, cooldown, the fighter's weight and speed. The normal attack is the same for everyone on purpose (a team decision), so balance comes from specials, weight and speed.

**6. How does a bot play, and how do you know it does not cheat?**
`src/game/bot.js` is a pure function that returns the same buttons a phone sends, so the rules treat it like a player. It sees the others 0.2 s late, misjudges distances a little and presses no faster than a thumb. It never reads hidden timers: a test runs a match with and without a queued hazard and checks the bot presses the same buttons until the warning appears. Its numbers are in `config.js` under `bots.easy`, `bots.medium` and `bots.hard`; Hard is quicker and more accurate, but keeps the same limits (at least 0.1 s late, no faster presses).

### For the owner of the server (`server/`, `apps-script/`, `tests/server/`)

**1. What does the server do, and what does it not do?**
It serves the pages, keeps the rooms, passes messages between phones and the host page, checks logins and saves results. It does **not** run the match: that happens in the host page. The server only sees buttons going one way and status messages going the other, and the result at the end.

**2. How do you stop a player from cheating or disturbing others?**
Every message is checked before anything is done with it: size, format, type, fields, and whether this sender may send it. A phone has no way to start a match or to send a result; the answer is "Only the host screen can do that". An input is always booked to the slot of the connection it came from. Too many messages are dropped, and a connection that keeps sending rubbish is closed. The host can remove a player from the room with the × on their card.

**3. How is a PIN stored?**
Not at all. The sheet has a salt and a hash. The hash is made with `scrypt`, which is slow on purpose, from the PIN, the player's own salt and a secret pepper that only the server has. Five wrong PINs within ten minutes lock the gamertag for ten minutes, and there can be at most twenty wrong PINs in a day.

**4. What if the Google Sheet does not answer?**
The game goes on. Players who already logged in can play. Results wait in a queue and are written later, in order, each one once. New players cannot register and get a clear message. The leaderboard shows what the server knows and marks it as possibly out of date.

**5. What is the biggest weakness of the server?**
It trusts the host page for the result, because the match does not run on the server. It only checks that a result is possible. To close that, the server would run or replay the match itself; the rules are written so that this is possible.

### For the owner of the client (`public/`, `tests/browser/`)

**1. How does a button on the phone become a movement on the big screen?**
The phone sends its seven buttons as one small number to the server whenever they change. The server passes it to the host page, with the player's slot. The host page keeps the latest state per player and hands it to the rules at the next step, 60 times a second. A tap that is shorter than one step is still counted once.

**2. Why is there only a joystick?**
The first build had a D-pad as a second mode. The team chose the joystick as the only control in round 2 (D-133): one mode is less to explain to new players and less to test. The joystick turns the thumb's position into the same seven buttons the D-pad produced, so the game rules did not change.

**3. How does the game give feedback on an iPhone, which cannot vibrate in the browser?**
Always three things together: vibration where it exists, a flash of colour over the whole screen, and a short sound. Sound needs one tap first, so the first tap unlocks it. Each of the three is skipped quietly if the phone cannot do it.

**4. How are the fighters and stages drawn?**
By code, not from image files. A fighter is drawn as shapes, shrunk to a small picture, every pixel is snapped to three tones per colour, and a dark outline is added. Arms, legs and the held item are parameters, which gives all the poses. A stage is drawn once into one picture and reused. Platform positions come from the rules, so what you see is what you can stand on.

**5. What happens when a phone loses its connection in the middle of a match?**
The fighter stands still and can still be hit. The phone reconnects by itself, sends its token, gets its slot back, and the server replays the current screen and status. The host notices a silent phone within a second and a half and lets go of its buttons.

---

## 11. How it was built

The team decided the game in a planning session (the option rounds are in `design/options/`, the decisions in `DECISIONS.md`, the result in `GAME_SPEC.md`). The code was then written with Claude in one session, in three packages: rules, server, client. After each package, independent reviewer agents that had not written the code checked it against the spec, hunted for bugs, checked security, and tried to break the tests. Every finding was reproduced before it was fixed. Each fixed defect in the rules and the server has a regression test; the client fixes are covered where a browser test can reach them. Decisions made along the way are listed in `DECISIONS.md` (D-098 onwards); the team confirmed them on 2026-11-13, except D-125.

Every commit of the build names Claude as co-author, so the history is honest about how the code was written. The tasks in `TEAM_TASKS.md` are there so that each member changes and explains their own part.
