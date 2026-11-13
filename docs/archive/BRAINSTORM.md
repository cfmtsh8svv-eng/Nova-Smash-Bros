# NOVA Brawl: Brainstorm

> **Historical (2026-11-03).** Ideas from the first concept phase. What was built is in [`GAME_SPEC.md`](../GAME_SPEC.md) and the decisions are in [`DECISIONS.md`](../DECISIONS.md): accounts, leaderboard, achievements and pause rules were decided there (D-054, D-067, D-069, D-070). References below to requirement numbers and open questions point to an older plan that no longer exists.

Ideas we want to remember but have **not committed to yet**. Nothing in this file is in scope until it has a decision in [`DECISIONS.md`](../DECISIONS.md) and a requirement in [`SPECS.md`](../SPECS.md). Several ideas are shown visually in the [mock-up](../../design/mockup/index.html).

**Status tags:** `idea` · `open decision O-xx` (waiting for a team decision) · `in specs F-xx` (already planned) · `dropped`
**Effort:** **S** = under a day · **M** = 1–3 days · **L** = more than 3 days (for 2–3 people with AI assistance)

---

## 1. Team ideas (2026-11-03)

### 1.1 Login & login screen
`open decision O-08` · Effort **M**

We need profiles so that stats, rankings and unlocks belong to someone. Options:

| Option | How it works | Pros | Cons |
|---|---|---|---|
| **Guest only** | Name typed in each time | Zero work | No stats over time |
| **Nickname + 4-digit PIN** *(recommended)* | Profiles stored in a local **SQLite** database on the laptop. The phone remembers the profile (token in `localStorage`), so returning players are logged in automatically. | Simple, no emails, privacy-friendly, a good programming exercise (hashing the PIN with `hashlib` + salt) | Profiles only live on that laptop |
| **Real accounts** (email / Google) | Online auth service | Profiles everywhere | Big effort, privacy rules (GDPR), needs a server |

**Login screen on the phone:** "Log in" (nickname + PIN) · "Create profile" · **"Play as guest"** (always available, so nobody is blocked at a party).
**On the big screen:** logged-in players show their **level badge** next to their name in the lobby.

### 1.2 Main menu
`idea` · Effort **S**

A menu on the big screen, controlled by the host (laptop keyboard or the P1 phone D-pad):

| Menu item | What it does |
|---|---|
| **Play** | Lobby with QR code |
| **Dean's List** | All-time leaderboard (§1.4) |
| **Achievements** | All achievements and who has them (§1.9) |
| **Locker** | Skins: owned and locked (§1.3) |
| **Settings** | Stocks, items, hazards, volume, screen shake |
| **Credits** | Team, assets, licences |

### 1.3 Gamification: XP, levels, ranking, unlockable skins
`open decision O-09` · Effort **L** (all of it) / **M** (levels only)

**XP & levels.** Everyone gets XP after each match and climbs the academic ladder:

| Level | Name | Total XP |
|---|---|---|
| 1 | Freshman | 0 |
| 2 | Sophomore | 500 |
| 3 | Junior | 1,500 |
| 4 | Senior | 3,000 |
| 5 | Master's | 5,000 |
| 6 | PhD | 8,000 |
| 7 | Professor | 12,000 |

XP sources: match played +50 · win +100 · each KO +20 · each achievement +50 to +200.

**Ranking.** An Elo rating in the background, shown to players as a **GPA from 0.0 to 4.0** (everyone starts at 2.0). The leaderboard is called the **Dean's List**.

**Unlockable skins** (in the **Locker**). We suggest unlocking through **levels and achievements only, with no in-game currency**: less balancing, and nobody feels they have to grind.

| Fighter | Skin | Unlock |
|---|---|---|
| Excel Eddie | Partner Suit (gold) | Reach Senior |
| Excel Eddie | Casual Friday | Win 3 matches with Eddie |
| Sofia Swell | Night Surf (neon wetsuit) | Win 5 matches on Carcavelos Beach |
| Sofia Swell | Lifeguard | Ride the Big Wave 10 times |
| Erasmus Erik | Costume Party | Achievement "Happy Hour" |
| Bookworm Bea | Graduation Gown | Reach Master's |
| Founder Filipa | Unicorn Hoodie | Reflect 25 projectiles |
| Busker Bruno | White Cape | Win a 6-player match |
| Any | **Football Legend** | See §1.7 |
| Any | Halloween / Christmas | Seasonal, only in that month |

### 1.4 Winner leaderboard & stats (damage taken etc.)
`idea` (match stats are partly `in specs F-UI-06`) · Effort **M**

**After each match** (results screen): placement, KOs, falls, **damage dealt**, **damage taken**, hits landed, items used + the fun awards from CONCEPT §4.7.

**All-time "Dean's List"** (main menu): one row per profile, sortable:

| Rank | Player | GPA | Wins | Matches | Win rate | KOs | Damage dealt | Damage taken | Favourite fighter |
|---|---|---|---|---|---|---|---|---|---|
| 1 | *Ana* | 3.7 | 24 | 41 | 59 % | 96 | 8,410 % | 5,220 % | Sofia Swell |
| 2 | *Max* | 3.1 | 15 | 38 | 39 % | 71 | 6,930 % | 6,870 % | Excel Eddie |

*(sample data)*

Extra tabs: **This week** (resets every Monday) and **Per fighter**.

### 1.5 Pausing the game
`in specs F-MAT-08` (basic pause with `Esc`) · extensions `open decision O-11` · Effort **S**

- **Pause menu:** Resume · Restart match · Change stage · Settings · Quit to lobby
- **Who can pause:** the host always (laptop `Esc` or the P1 phone). Every other player gets **1 pause per match** via a small pause button on the phone, so nobody can spam it.
- **Resume with a 3-2-1 countdown** so nobody gets hit by surprise.
- Phones show **"Paused by P1 · Max"** during the pause.
- Optional: **auto-pause when 2 or more phones disconnect** at the same time (e.g. the Wi-Fi drops).

### 1.6 Picking a fighter, with suggestions
`open decision O-12` · Effort **S–M**

The select screen on the phone can suggest a fighter:

- **"Try this one!"**: new players get a random suggestion with a one-line pitch ("Sofia is fast. Great if you like to run around.").
- **"Suggested for you"** (needs profiles): based on your stats. If you take a lot of damage, it suggests a heavyweight like Busker Bruno. If you throw a lot of items, it suggests Bookworm Bea.
- **"Counter pick"**: suggests a fighter that is good against the current Dean's List leader.
- A **dice button** for a random pick.

More fighter ideas from Claude are in [§2.6](#26-fighter-suggestions).

### 1.7 Cristiano Ronaldo skin
`open decision O-10` · Effort **S** (art) + legal check

A real person's name, face or signature brand (e.g. "CR7") **needs that person's permission**. Our own guardrail says the same: no real people without consent (CONCEPT §3.7). For a closed course demo the risk is small, but as soon as the game is shown publicly (GitHub, social media) it becomes a problem.

| Option | Recommendation |
|---|---|
| A) Real Ronaldo skin with name and face | Not recommended (only with permission) |
| B) **"Football Legend"**: our own original footballer skin (football kit, slick hair, a famous-looking jump celebration as the victory pose), no real name or face | **Recommended**: everyone gets the joke, no legal issue |
| C) Drop it | |

### 1.8 Statistics
`idea` · Effort **M**

What we could track per match and over a whole profile:

| Category | Stats |
|---|---|
| **Combat** | Hits landed, damage dealt, damage taken, KOs, falls, self-destructs, burnouts caused / suffered, highest % survived, longest life, biggest single hit |
| **Items** | Items picked up, custard tarts eaten, drinks picked up, books thrown, sardine KOs |
| **Hazards** | Hit by train / tram, swept by the Big Wave, sunburn damage, items lost to seagulls |
| **Meta** | Matches played, wins, win rate, favourite fighter, favourite stage, play time |

**How to build it:** a `MatchStats` class listens to game events (`on_hit`, `on_ko`, `on_item_pickup`, `on_hazard_hit`) and writes a summary to SQLite after each match. This is easy to unit-test and good OOP material for the course.

### 1.9 Achievements
`idea` · Effort **M**

The team's three, plus more ideas:

| Achievement | Condition | Source |
|---|---|---|
| **Heavy Hitter** | Land **100 hits** (all-time) | Team |
| **Final Exam** | KO **10 opponents** (all-time) | Team |
| **Happy Hour** | Drink **3 beers** in one match | Team |
| Perfect Grade | Win without losing a life | Claude |
| Comeback Kid | Win on your last life after being above 150 % | Claude |
| Train Spotter | Get hit by the train or tram 5 times | Claude |
| Strike Day | See the train strike 3 times | Claude |
| Seagull Snack | Lose 10 items to seagulls | Claude |
| Sunscreen Needed | Take 100 % sunburn damage in total | Claude |
| Sardine Slayer | KO 5 opponents with the sardine | Claude |
| Surf's Up | Ride the Big Wave 10 times | Claude |
| Full House | Play a 6-player match | Claude |
| Night Owl | Win 5 matches in Bairro Alto | Claude |
| Dean's List | Reach #1 on the leaderboard | Claude |

Unlocking shows a toast on the big screen and an "Achievement unlocked" card on the player's phone (see mock-up). Progress is shown in the Achievements menu ("Heavy Hitter 73 / 100").

---

## 2. More ideas (Claude)

### 2.1 Revenge vote for eliminated players
`idea` · Effort **S**

Eliminated players aren't bored: their phone shows a **vote for the next hazard** ("Tram 28 · Bad Wi-Fi · Big Wave"). The most-voted hazard comes next. This keeps everyone in the game until the end and only reuses hazards we already have.

### 2.2 Final KO replay ("Final Exam Cam")
`idea` · Effort **M**

The last KO of the match plays again in **slow motion with a zoom**. Technically: keep the last 3 seconds of game states in a ring buffer (`collections.deque`) and play them back. A nice, showable programming detail.

### 2.3 Group Project mode
`idea` · Effort **M**

Teams of 2 (2v2v2). The joke: **friendly fire is on**, because in a group project your teammates can hurt you too.

### 2.4 Orientation Week (tutorial)
`idea` · Effort **S**

A 60-second guided first match: "Press A to attack", "Jump twice to double jump", "Hold Shield". Phones highlight the button to press.

### 2.5 Match modifiers ("Syllabus changes")
`idea` · Effort **S** each

Optional rules that change a match:

- **Monday Morning**: everyone is 20 % slower
- **Free Coffee**: only espressos spawn
- **Library Rules**: only books and laptops spawn
- **Sudden Death**: everyone starts at 150 % with one life
- **Big Head Mode**: all heads 2× bigger (it's just a scale factor in code)

### 2.6 Fighter suggestions

More student archetypes for later or to swap in:

| Fighter | Archetype | Signature move ideas | Why it's fun |
|---|---|---|---|
| **Late Larry** | Always late | **Snooze**: falls asleep (a shield that heals) · **Rush Hour**: a super-fast dash | Everyone knows a Larry |
| **The Intern** | Coffee runner | **Coffee Run**: a dash that leaves a hot puddle · throws espresso cups | Weak but super fast |
| **Group Project Ghost** | Never shows up | **Ghosting**: invisible for 2 s · **Last-Minute Upload**: teleport | The most relatable fighter |
| **Marketing Maya** | Influencer | **Ring Light**: a flash that blinds · **Go Viral**: a projectile that splits | Flashy zoner |
| **Finance Fred** | Trader with three screens | **Margin Call**: a slow, huge hit · **Short Sell**: steals a held item | High risk, high reward |
| **The TA** | Teaching assistant | **Red Pen**: a fast poke · **Office Hours**: a trap zone that slows enemies | Annoying in the best way |
| **Gym Bro Gus** | Lives in the campus gym | **Protein Shake**: heals 10 % · **Deadlift**: grab + throw | A second heavyweight |
| **Lifeguard Lu** | Carcavelos lifeguard | **Whistle**: a short stun · **Rescue Board**: the best recovery move | Beach stage regular |
| **DJ Dex** | Bairro Alto DJ | **Bass Drop**: a ground pound · music-note projectiles | Great sound design |
| **Tourist Tim** | Sunburnt tourist with a map | **Camera Flash**: stun · **Lost**: random teleport | Chaos fighter |
| **The Dean** | Secret boss | **Expelled!**: a huge KO move, unlocked by winning 50 matches | Endgame goal |
| **The Seagull** | Secret fighter | Steals items, flies | Already in the parking lot |

### 2.7 More stages

| Stage | Idea |
|---|---|
| **Library** | A "silence meter": too much fighting noise and the librarian kicks someone out |
| **On the train** | You fight on the roof of a moving train, and tunnels sweep the top |
| **River Ferry** | A tilting deck and spray from the waves |
| **Rooftop Bar** | Sunset, wind gusts, a big drop on all sides |
| **Exam Hall** | Desks as platforms, a giant clock counts down, "Pens down!" ends the round |

### 2.8 More items

| Item | Effect |
|---|---|
| **Sunscreen** | Stops sunburn for the rest of your life |
| **Umbrella** | Portable shade on the beach + float down slowly |
| **Student Card** | Blocks the next hit completely |
| **Deadline Extension** | Removes 30 % damage (rare) |
| **Fire Alarm** | Everyone is pushed towards the edges for 3 s |
| **Power Bank** | Your next special is twice as strong |

### 2.9 Demo-day extras

- **Attract mode**: when nobody is playing, the big screen loops highlights and the QR code ("Scan to play!")
- **Hall of Fame** in the lobby: today's top 3
- A **printable QR poster** with the tagline
- A **left-handed layout** on the phone (D-pad on the right)

---

## 3. How an idea becomes a feature

1. Discuss it in the team (or with Claude).
2. Add an open decision `O-xx` to [`DECISIONS.md`](../DECISIONS.md) if it needs one.
3. Decide → new `D-0xx` row.
4. Add requirements with a MoSCoW priority to [`SPECS.md`](../SPECS.md).
5. Change the tag here to `in specs F-xx`.
