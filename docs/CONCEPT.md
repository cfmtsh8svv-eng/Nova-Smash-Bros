# NOVA Brawl: Game & Brand Concept

> **Scan. Pick. Brawl.**
> A party platform fighter set at Nova SBE. Your phone is the controller.

| | |
|---|---|
| **Document** | Game & brand concept (the *what* and *why*) |
| **Related** | [`SPECS.md`](SPECS.md) (requirements, architecture, plan) · [`DECISIONS.md`](DECISIONS.md) (every decision) · [`BRAINSTORM.md`](BRAINSTORM.md) (ideas not yet decided) · [`../mockup/index.html`](../mockup/index.html) (visual mock-up) |
| **Version** | 0.2 (draft) |
| **Status** | Concept phase |
| **Course** | Introduction to Programming, group project |
| **Language rule** | **English only.** No Portuguese words or slang in the game or the docs ([D-023](DECISIONS.md)). Place names stay as they are. |

---

## 1. The pitch

**NOVA Brawl** is a local multiplayer party fighter for up to **6 players**. One laptop or projector shows the game. Every player scans a **QR code** and their **phone becomes the controller**, with no app install.

You fight across three places every Nova SBE student knows: the **campus**, **Carcavelos Beach** and a night out in **Bairro Alto**. Each one has its own hazards and items: bad Wi-Fi, a surprise pop quiz, giant waves, thieving seagulls, the Tram 28 and a Blue Drink that flips your controls.

Hits raise your **damage %**. The higher it climbs, the further you fly. Get knocked off the screen or hit **200 % ("BURNOUT!")** and you lose one of your **3 lives**. The last student standing *graduates with honours*.

---

## 2. The 30-second experience

```
 ┌─────────────┐   ┌──────────────┐   ┌───────────────┐   ┌──────────────┐   ┌──────────────┐
 │ 1. SCAN     │ → │ 2. PICK      │ → │ 3. COUNTDOWN  │ → │ 4. BRAWL     │ → │ 5. GRADUATE  │
 │ QR code on  │   │ name and     │   │ "3, 2, 1...   │   │ % climbs,    │   │ winner +     │
 │ big screen  │   │ fighter on   │   │   BRAWL!"     │   │ hazards hit, │   │ fun awards,  │
 │             │   │ your phone   │   │               │   │ 3 lives each │   │ rematch      │
 └─────────────┘   └──────────────┘   └───────────────┘   └──────────────┘   └──────────────┘
```

The test for every feature: *can a first-timer at a party understand it in under 10 seconds?*

---

## 3. Brand

### 3.1 Name & tagline

- **Name:** NOVA Brawl (working repo name: *Nova-Smash-Bros*)
- **Primary tagline:** *Scan. Pick. Brawl.*
- **Alternative lines** (posters, loading screens):
  - *Study hard. Surf harder. Brawl hardest.*
  - *From lecture hall to Bairro Alto in three lives.*
  - *The only group project where you're allowed to hit your teammates.*

### 3.2 Brand pillars

| Pillar | What it means | Example in the game |
|---|---|---|
| **Instant party** | Zero friction, phones out, play in under a minute | QR join, no install |
| **Campus satire** | Student-life pain turned into game mechanics | Bad Wi-Fi = input lag, exam season = everyone slows down |
| **Lisbon setting** | Real places around Nova SBE, told in plain English | Custard tarts heal, the Tram 28 runs you over |
| **Cheeky, not cringe** | Funny enough for a party, clean enough for the professor | Drinks cause a short, silly effect plus "Drink water!" |

### 3.3 Audience

- **Primary:** Nova SBE students (international, English-speaking, 18–26) at parties, in the student lounge or at the course demo.
- **Secondary:** the course staff during the live demo. It must be presentable, understandable and technically impressive.

### 3.4 Voice & tone

All text in the game is **English only**, with no Portuguese words or slang, so every player from every country gets every joke.

| Do | Don't |
|---|---|
| Short, punchy lines ("LAUNCHED!", "BURNOUT!") | Long tutorial texts |
| Shared student pain: deadlines, Wi-Fi, trains, seagulls | Jokes about real, identifiable people |
| Self-ironic business-school humour ("We're disrupting brawling.") | Mean jokes about nationalities or groups |
| Cartoon drinks with silly, short effects | Glorifying drinking, crude or sexual content |
| Plain English names for everything | Portuguese words or slang |

**Signature lines (used in game):**

| Line | Where it shows up |
|---|---|
| **"3, 2, 1... BRAWL!"** | Match countdown |
| **"LAUNCHED!"** | Knocked out through the blast zone |
| **"BURNOUT!"** | Knocked out by reaching 200 % |
| **"Nice hit!"** | When you land a KO |
| **"Ready!"** | Lobby, when a player is ready |
| **"Cheers!"** | Picking up a drink |
| **"Drink water!"** | Phone message while tipsy |
| **"STRIKE! Train cancelled."** | The train didn't come (Campus stage) |
| **"You're out! Grab a coffee and watch."** | Phones of eliminated players |
| **"Just one more!"** | Erasmus Erik's catchphrase |
| **"{name} graduates with honours!"** | Winner announcement |

### 3.5 Visual identity

**Style: flat cartoon / vector.** Bold shapes, a thick dark outline (3–4 px at 720p), no gradients except sky and sunset backgrounds. Characters use **big-head proportions** (≈ 1:2.5) so faces read from 3 m away on a projector.

**Character design rules**
1. Every fighter has one **signature colour** and a **unique silhouette** (suit, surfboard, cape, stack of books...). You should be able to tell them apart as black shapes.
2. Player slots (P1–P6) add a **coloured label** above the fighter, so two players can pick the same fighter.
3. Few animation frames, lots of **squash & stretch**, done with scaling and rotation in code to keep the art workload small.

**Colour palette (proposal)**

| Token | Hex | Use |
|---|---|---|
| Atlantic Blue | `#0B3C5D` | Primary brand colour, menus, logo |
| Tile Blue | `#1F6FB2` | Tile patterns, UI frames |
| Tile White | `#EEF3F8` | Cool, glazed white for backgrounds and text on dark |
| Sunset Orange | `#FF7A3D` | Accent, call-to-action, "BRAWL!" |
| Beach Sand | `#F2D49B` | Beach stage, warm UI surfaces |
| Bairro Night | `#2B1E3F` | Bairro Alto stage, dark UI |
| Tram Yellow | `#F6C343` | Hazard warnings and telegraphs |

**Player slot colours:** P1 `#E63946` red · P2 `#1F6FB2` blue · P3 `#F6C343` yellow · P4 `#2A9D8F` green · P5 `#FF7A3D` orange · P6 `#8E5CC8` purple. Always paired with the "P1"–"P6" label for colour-blind players.

**Typography (free, OFL-licensed, bundled as TTF):**
- Display / logo / big numbers: **Bungee**
- UI and body text: **Nunito** (bold for the HUD)

**Logo concept:** the wordmark **NOVA BRAWL** in Bungee, Atlantic Blue on Tile White. The **"O" in NOVA is a custard tart seen from above**: a round golden disc with caramelised spots, doubling as a "power button". The app icon / favicon is just the tart-O on a blue tile square.

**UI motifs**
- **Blue-and-white tiles** (inspired by Lisbon's painted wall tiles) frame the player cards and menus.
- The **wave pattern of Lisbon's cobblestones** is used for menu backgrounds. It ties together Bairro Alto (cobblestones) and Carcavelos (waves).
- Hazard warnings always use **Tram Yellow + black stripes**, so everyone instantly knows "danger incoming".

### 3.6 Audio identity

- **Signature sounds:** tram bell (*ding-ding*), seagull squawk, lifeguard whistle, train horn, Wi-Fi "disconnect" blip, a big *thwack* on KO.
- **Music:** upbeat chiptune / electro-pop. Bairro Alto gets a melancholic guitar riff over a beat.
- **Sources:** self-made or CC0 / CC-BY assets (e.g. OpenGameArt, Freesound), all listed in `CREDITS.md`.

### 3.7 Guardrails

- **Original IP only.** NOVA Brawl is *inspired by the platform-fighter genre* (damage %, knockback, stocks). We use **no** Nintendo characters, names, sprites, music, sounds or logos. Everything is our own or properly licensed.
- **Nova SBE is the setting, not the publisher.** We don't use the official Nova SBE logo or crest unless we get permission. NOVA Brawl has its own logo (see 3.5).
- **No real people without consent.** Professors and students in the game are fictional archetypes. A real person (e.g. a celebrity skin, see [BRAINSTORM.md](BRAINSTORM.md)) needs permission for anything public.
- **Drinks stay cartoonish.** Effects are short, silly and never "rewarding". The phone always adds "Drink water!".

---

## 4. Game design

### 4.1 Core rules

| Rule | Design |
|---|---|
| **Players** | 2–6, one phone each (keyboard fallback for 2 during development and demos) |
| **Mode** | **Stock mode**: every player has **3 lives** |
| **Damage %** | Starts at 0 %, shown large at the **top** of the screen, rises with every hit |
| **Knockback** | Higher % = you fly further when hit. Heavier fighters fly a bit less. |
| **KO, way 1: "LAUNCHED!"** | You fly past the edge of the screen (blast zone) |
| **KO, way 2: "BURNOUT!"** | Your damage reaches **200 %** → instant KO (hybrid system) |
| **After a KO** | Lose 1 life, respawn on a floating platform at 0 % with 2 s of invincibility |
| **Win** | Last player with lives left *"graduates with honours"* |

### 4.2 Moveset (medium complexity)

Every fighter uses the same controls. Only the moves differ.

| Input (phone) | Ground | Air |
|---|---|---|
| D-pad ← → | Walk | Drift |
| **Jump** | Jump | Double jump (1×) |
| D-pad ↓ in the air | | Fast fall |
| **A** (Attack) | Neutral attack | Neutral air attack |
| **A** + ← / → | Side attack (strong, KO move) | Side air attack |
| **A** + ↑ | Up attack (anti-air) | Up air attack |
| **A** + ↓ | Down attack (low sweep) | Down air attack (spike) |
| **B** (Special) | Neutral special (signature move) | Same |
| **B** + ↑ | Up special (recovery, gets you back to the stage) | Same |
| **Shield** (hold) | Shield bubble. It shrinks when hit and breaks if overused. | |
| **Shield** + direction | Roll / dodge (brief invincibility) | Air dodge |

### 4.3 Roster: student archetypes

Six fighters, all fictional Nova SBE stereotypes (names are placeholders the team can change). The MVP needs two of them: **Excel Eddie** and **Sofia Swell**. More fighter ideas are in [BRAINSTORM.md](BRAINSTORM.md#26-fighter-suggestions).

| # | Fighter | Archetype | Class | Weight | Speed | Neutral special | Up special (recovery) | Passive / Easter egg |
|---|---|---|---|---|---|---|---|---|
| 1 | **Excel Eddie** | Consultant in a suit, laptop under the arm | All-rounder | ●●●○○ | ●●●○○ | **Slide Deck**: throws a presentation slide | **Elevator Pitch**: rises straight up | "Let's circle back." Side attack swings a briefcase |
| 2 | **Sofia Swell** | Carcavelos surfer in a wetsuit | Fast & light | ●●○○○ | ●●●●○ | **Wipeout**: spinning surfboard swipe | **Air Drop**: board launches her upward | **Rides the Big Wave** instead of being swept away |
| 3 | **Erasmus Erik** | Exchange student, always at the party | Brawler | ●●●●○ | ●●●○○ | **Party Horn**: short-range blast that pushes | **Crowd Surf**: carried up by invisible hands | **Exchange tolerance**: tipsy effects last half as long. "Just one more!" |
| 4 | **Bookworm Bea** | Lives in the library, knows the syllabus by heart | Zoner (projectiles) | ●●○○○ | ●●○○○ | **Footnote Barrage**: 3 small paper projectiles | **Bookshelf Hop**: stacks books and jumps off them | **Immune to Exam Season** slowdown |
| 5 | **Founder Filipa** | Startup founder in a hoodie, pitch deck ready | Tricky / mobile | ●●○○○ | ●●●●○ | **Pivot**: reflects projectiles and turns around | **Unicorn Valuation**: rides a unicorn upward | "We're disrupting brawling." Picks up items from further away |
| 6 | **Busker Bruno** | Student musician in a long black cape, guitar on his back | Heavyweight | ●●●●● | ●○○○○ | **Serenade**: guitar shockwave along the ground | **Cape Glide**: slow glide with his cape | Hardest to launch, biggest side attack |

### 4.4 Stages

Every stage has a **HazardDirector**. Every 25–40 s it triggers **one hazard at a time**, always with a **3-second warning** (Tram Yellow stripes, sound cue and a message on every phone). Hazards should be funny and dodgeable, never unfair.

#### Stage 1: Nova SBE Campus *(day)*
**Layout:** a wide main terrace with an ocean view, two floating platforms (a café bench and a library shelf) and one high platform (a rooftop sign). The train line runs along the back/bottom.

| Hazard | What happens | Counterplay |
|---|---|---|
| **Bad Wi-Fi** | For 6 s **everyone's input is delayed** (~200 ms). A buffering spinner shows on the big screen and phones show *"eduroam: reconnecting..."* | Play carefully, don't start risky moves |
| **Exam Season** | For 12 s everyone moves 25 % slower, and **books rain from the sky** (damage) | Dodge the shadows of falling books. Bookworm Bea is immune. |
| **Pop-Quiz Professor** | An NPC professor walks across the terrace. Touching them = damage + a short "?" stun. | Jump over or stay on platforms |
| **Cascais Line Train** | Crossing lights flash, the horn blares, then a train rushes through the lower lane with massive knockback. **25 % chance:** the warning plays, but a banner says **"STRIKE! Train cancelled."** and nothing comes. | Get up on the platforms |

#### Stage 2: Carcavelos Beach *(afternoon → sunset during the match)*
**Layout:** a sand main platform, a lifeguard tower (high platform), rocks on the side and 2 beach umbrellas (shade zones). The sea at the bottom is the blast zone. An old coastal fort sits in the background.

| Hazard / Item | What happens | Counterplay |
|---|---|---|
| **Big Wave** | Lifeguard whistle, water rises, then a wave sweeps across the sand pushing everyone towards the edge | Climb the tower or rocks. Sofia Swell (or anyone on a surfboard) rides it. |
| **Surfboard** *(stage item)* | Ride it for 6 s: fast, rams enemies, safe from the Big Wave. You can also throw it. | Jump over a surfing player |
| **Sunburn** | Every fighter has a **sun meter** that fills while they stand outside shade. When full, they take +1 % per second and turn red. | Stand under an umbrella for 3 s to reset |
| **Seagulls** | A seagull swoops in, **steals the item you're holding** (or one lying on the ground) and drops it somewhere else, sometimes into the sea | Use items quickly, or chase the gull |

#### Stage 3: Bairro Alto *(night)*
**Layout:** a sloped cobblestone street with balconies as platforms, a bar counter and a tram track along street level. Neon signs, washing lines and fairy lights.

| Hazard / Item | What happens | Counterplay |
|---|---|---|
| **Drinks** *(stage items)* | **Beer**, **Blue Drink** and **Cherry Shot** spawn on the bar. Picking one up makes you **tipsy for 8 s** (see below). | Or just... don't drink it |
| **Tram 28** | *Ding-ding!* The yellow tram rolls along the street, headlights first, sweeping everyone with big knockback | Jump onto the balconies |
| **Steep Alleys** | The streets are **slopes with slippery cobblestones**. Standing still makes you slowly slide downhill, and rolls go further. | Keep moving, fight uphill |

**Being tipsy (short effect + explanation on the phone)**

| Drink | Effect (8 s) | Phone shows |
|---|---|---|
| **Beer** | Wobbly: your fighter drifts randomly while walking | "Cheers! You're tipsy. Your fighter wobbles for 8 s. Drink water!" |
| **Blue Drink** | **LEFT and RIGHT are swapped** | "You're tipsy! LEFT and RIGHT are swapped for 8 s." |
| **Cherry Shot** | **UP and DOWN are swapped** (jumping still works) | "That shot hits different. UP and DOWN are swapped for 8 s." |

- Another drink **doesn't stack**. It replaces the effect and resets the timer.
- The phone shows a big banner with a countdown and a gentle wobble animation, **without covering the buttons**.
- Erasmus Erik's tolerance halves the duration.

### 4.5 Items

Items spawn every 12–20 s at random spawn points, with at most 3 on the stage at once. Walk over an item and press **A** to pick it up. Consumables take effect immediately.

| Item | Stages | Type | Effect |
|---|---|---|---|
| **Custard Tart** | All | Consumable | Heals **20 %** (never below 0 %) |
| **Book** | All | Throwable | Heavy hit: **14 %**, solid knockback |
| **Laptop** | All | Throwable | **10 %** + a short "blue screen" stun (0.5 s) |
| **Espresso** | All | Consumable | **Speed boost** +30 % for 8 s |
| **Sardine** | All | Melee weapon (5 swings) | Low damage, **huge knockback**: the ultimate finisher |
| **Surfboard** | Beach | Ride / throw | See stage 2 |
| **Beer / Blue Drink / Cherry Shot** | Bairro Alto | Consumable | Tipsy effects, see stage 3 |

### 4.6 What the phone does

The phone is the controller and the personal screen. It shows only what helps the player in that moment.

| Phase | Phone shows |
|---|---|
| **Join** | Name field + "Join" button |
| **Select** | Fighter carousel, "Ready" button |
| **Match** | Landscape gamepad: **D-pad left**, **A / B / Jump / Shield right**. A slim top bar shows *P2 · Ana · 87 % · ♥♥*. |
| **Effects** | Banner + countdown for tipsy, sunburn warning, "eduroam: reconnecting...", hazard warnings |
| **Hit / KO** | **Vibrates** on hits (stronger on a KO). Screen flash where vibration isn't supported (iPhone). |
| **KO'd** | "LAUNCHED! 2 lives left" or "BURNOUT! 1 life left" |
| **Eliminated** | "You're out! Grab a coffee and watch." |
| **Results** | Your placement + your award |

### 4.7 Results & awards

The results screen shows the winner (*"Ana graduates with honours!"*) and fun awards:

| Award | For |
|---|---|
| **Summa Cum Laude** | Winner |
| **Biggest Burnout** | Most KOs by the 200 % cap |
| **Train Spotter** | Hit by the train or tram the most |
| **Seagull Victim** | Lost the most items to seagulls |
| **Sunburnt Tourist** | Most sunburn damage |
| **Happy Hour** | Most drinks picked up |
| **Group Project Carry** | Most damage dealt |

### 4.8 Easter eggs (collected)

- The **train strike** chance on the Campus stage (*"STRIKE! Train cancelled."*).
- Phones show **"eduroam: reconnecting..."** during Bad Wi-Fi.
- **Sofia** rides the Big Wave, **Bea** ignores Exam Season, **Erik** has exchange tolerance.
- The Beach stage slowly turns to **sunset** over the course of a match.
- The title screen says *"Press any button... or wait for the next train."*

---

## 5. Parking lot (later / maybe)

Ideas from the kick-off that are **not** committed yet. New ideas go to [`BRAINSTORM.md`](BRAINSTORM.md).

- **Global "catastrophe" events** *(decide later, [O-02](DECISIONS.md#open-decisions))* that can hit any stage and weaken everyone:
  - **Blackout**, a nod to the 2025 Iberian power outage: the screen goes dark for a few seconds, only outlines visible
  - **Earthquake**, a nod to the Lisbon earthquake of 1755: the stage shakes, platforms crack
  - **Heat wave**: everyone slows down, the screen shimmers
  - **Storm**: wind pushes everyone to one side
- Bot opponents, time mode, tournament bracket, online play
- A secret 7th fighter: **The Seagull**
- Tilt controls as a fun mode, emotes/taunts ("Let's go!")

---

## 6. Open decisions

All decisions, open and made, are tracked in [`DECISIONS.md`](DECISIONS.md). The big open ones are **how phones connect**, **which catastrophe events** to build, **login / profiles** and **how much gamification** goes into version 1.
