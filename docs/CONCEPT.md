# NOVA Brawl: Game & Brand Concept

> **Updated after the build (2026-11-11).** This file now only holds what is still valid: the pitch and the brand (voice, signature lines, humour rules). The rules, fighters, stages and screens are in [`GAME_SPEC.md`](GAME_SPEC.md); how it is built is in [`WALKTHROUGH.md`](WALKTHROUGH.md). The earlier game-design chapters were removed here because they described a version that was never built; they are in the git history.


> **Scan. Pick. Brawl.**
> A party platform fighter set at Nova SBE. Your phone is the controller.

| | |
|---|---|
| **Document** | Game & brand concept (the *what* and *why*) |
| **Related** | [`GAME_SPEC.md`](GAME_SPEC.md) (the spec) · [`WALKTHROUGH.md`](WALKTHROUGH.md) (how it is built) · [`DECISIONS.md`](DECISIONS.md) (every decision) · [`BRAINSTORM.md`](archive/BRAINSTORM.md) (ideas not built) |
| **Version** | 1.0 |
| **Status** | Built |
| **Course** | Introduction to Programming, group project |
| **Language rule** | **English only.** No Portuguese words or slang in the game or the docs ([D-023](DECISIONS.md)). Place names stay as they are. |

---

## 1. The pitch

**NOVA Brawl** is a party fighter for **2 to 4 players**. One laptop or projector shows the game. Every player scans a **QR code** and their **phone becomes the controller**, with no app install.

You fight across three places every Nova SBE student knows: the **campus**, **Carcavelos Beach** and a night out in **Bairro Alto**. Each one has its own hazards: bad Wi-Fi and the Cascais Line train, a big wave and thieving seagulls, a drunk crowd and drinks that swap left and right.

Hits raise your **damage %**. The higher it climbs, the further you fly. Get knocked off the screen or hit **200 % ("BURNOUT!")** and you lose one of your lives (1, 2 or 3, the host decides). The last student standing *graduates with honours*.

---

## 2. The 30-second experience

```
 ┌─────────────┐   ┌──────────────┐   ┌───────────────┐   ┌──────────────┐   ┌──────────────┐
 │ 1. SCAN     │ → │ 2. PICK      │ → │ 3. COUNTDOWN  │ → │ 4. BRAWL     │ → │ 5. GRADUATE  │
 │ QR code on  │   │ name and     │   │ "3, 2, 1...   │   │ % climbs,    │   │ winner +     │
 │ big screen  │   │ fighter on   │   │   BRAWL!"     │   │ hazards hit, │   │ points,      │
 │             │   │ your phone   │   │               │   │ last one wins│   │ leaderboard  │
 └─────────────┘   └──────────────┘   └───────────────┘   └──────────────┘   └──────────────┘
```

The test for every feature: *can a first-timer at a party understand it in under 10 seconds?*

---

## 3. Brand

### 3.1 Name & tagline

- **Name:** NOVA Brawl (the repository is still called *Nova-Smash-Bros*, its first working title; the game itself never uses that name)
- **Primary tagline:** *Scan. Pick. Brawl.*
- **Alternative lines** (posters, loading screens):
  - *Study hard. Surf harder. Brawl hardest.*
  - *From lecture hall to Bairro Alto in three lives.*
  - *The only group project where you're allowed to hit your teammates.*

### 3.2 Brand pillars

| Pillar | What it means | Example in the game |
|---|---|---|
| **Instant party** | Zero friction, phones out, play in under a minute | QR join, no install |
| **Campus satire** | Student-life pain turned into game mechanics | Bad Wi-Fi = input lag, the train is cancelled by a strike |
| **Lisbon setting** | Real places around Nova SBE, told in plain English | Custard tarts heal, a mini Tram 28 runs you over |
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
| **"Drink water!"** | Phone message when you get tipsy |
| **"STRIKE! Train cancelled."** | The train didn't come (Campus stage) |
| **"You're out! Grab a coffee and watch."** | Phones of eliminated players |
| **"{name} graduates with honours!"** | Winner announcement |

### 3.5 Visual identity

**Style: HD pixel fighters on detailed, drawn stages** (decision D-048). Fighters are 81-pixel sprites with three tones per colour and a dark outline, with **big-head proportions** so faces read from 3 m away on a projector. Stages are illustrated in code, true to the real places, and every playable surface carries the stage's striped trim.

**Character design rules**
1. Every fighter has one **signature colour** and a **unique silhouette** (gilet and laptop, surfboard, flat cap...).
2. A **name tag in the player colour** floats above every fighter. If two players pick the same fighter, the later player's top is drawn in their player colour.
3. Few drawn poses, lots of **squash and stretch**, done in code.

**Player colours:** P1 red `#e63946` · P2 blue `#2f7fe0` · P3 green `#22a36b` · P4 yellow `#f6c343`. Always shown together with the "P1" to "P4" label, so nobody has to tell players apart by colour alone.

**UI colours**

| Token | Hex | Use |
|---|---|---|
| Night | `#1B1330` | Background of menus and the phone |
| Ink | `#EEF3F8` | Text on dark |
| Sunset Orange | `#FF7A3D` | Call to action, "BRAWL!" |
| Tram Yellow | `#F6C343` | Hazard warnings, highlights |

**Typography (free, SIL Open Font License, bundled in `public/shared/fonts/`):**
- Display, logo and big numbers: **Bungee**
- UI and body text: **Nunito** (bold for the HUD)

### 3.6 Audio identity

- **Signature sounds:** tram bell (*ding-ding*), seagull squawk, train horn, Wi-Fi "disconnect" blips, a big *thwack* on KO.
- **Music:** upbeat chiptune per stage; Bairro Alto is slower and in a minor key.
- **Sources:** everything is synthesised in the browser with the Web Audio API (`public/shared/audio.js`). There are no sound files and so no licences to manage.

### 3.7 Guardrails

- **Original IP only.** NOVA Brawl is *inspired by the platform-fighter genre* (damage %, knockback, stocks). We use **no** Nintendo characters, names, sprites, music, sounds or logos. Everything is our own or properly licensed.
- **Nova SBE is the setting, not the publisher.** The campus roof carries the Nova SBE logo, redrawn from the official mark (decision D-063). It is credited in [`CREDITS.md`](../CREDITS.md) and remains the school's trademark; nothing else of the school's branding is used.
- **No real people without consent.** Professors and students in the game are fictional archetypes. A real person (e.g. a celebrity skin, see [BRAINSTORM.md](archive/BRAINSTORM.md)) needs permission for anything public.
- **Drinks stay cartoonish.** Effects are short, silly and never "rewarding". The phone always adds "Drink water!".

---

---

## 4. Game design

Rules, controls, the eight fighters, the three stages, items, hazards and all screens are specified in [`GAME_SPEC.md`](GAME_SPEC.md).
