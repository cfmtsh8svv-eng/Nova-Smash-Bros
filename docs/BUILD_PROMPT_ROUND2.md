# NOVA Brawl: Build Prompt, round 2 (gameplay and UI)

Paste everything below the line into a fresh Claude Code session started in the root of this repository, on a new branch from `main` (for example `round2-gameplay`). These are the team's decisions of 2026-11-12, agreed point by point.

---

Change NOVA Brawl as described below, in this one session. Work through to the end without stopping to ask questions. Where something is open, pick what fits the spec best, write the choice into `docs/DECISIONS.md` and carry on.

## Read first

1. `AGENTS.md`: commands and repository rules. They apply in full. Rule 3 matters most here: many rules change, so **first** update `docs/GAME_SPEC.md` and add decisions to `docs/DECISIONS.md` (continue the numbering after D-131), **then** change the tests, **then** the code. Say so in the commit messages.
2. `docs/GAME_SPEC.md` and `docs/WALKTHROUGH.md`.
3. `src/game/` (pure rules, all tuning in `config.js`, randomness only through `rng.js`), `public/host/`, `public/play/`, `server/rooms.js` (it validates every message field by field, so new messages and fields need validators there too).

Keep the existing quality bar: the game runs in a live demo on real iPhones and Android phones. No inline scripts or styles (CSP). Player-facing text in English; item names such as Pastel de Nata, Bifana and Azulejo are names, not slang, and are allowed. `npm test`, `npm run test:browser` and `npm audit --audit-level=high` must be green at the end.

Work in small commits, one topic each, in the order below.

## 1. Remove keyboard players

- Delete the keyboard guests completely: `public/host/keyboard.js`, the guest controls in the lobby (`guestMore`, `guestLess`, `guestCount` and their markup and CSS), `lobby.guests`, the guest parts of `lineup()`, `guestIsDuplicate`, the "Keyboard player: no points" line, and the `guests` / `guestSlots` fields of `match_start` on the host and on the server (`server/rooms.js`, `LIMITS.maxGuests`, results handling of guests).
- Update the tests that use guests, the spec (§6, §11 "keyboard fallback") and the walkthrough.
- Bots will replace them later. Do not build bots now, but keep `createMatch` able to take players that do not come from a phone.

## 2. Joystick only

- Remove the D-pad mode and the `modeToggle` button from the phone. The floating joystick is the only control. Remove the `nb_mode` storage and the D-pad code paths in `public/play/controls.js`, `index.html` and `play.css`.
- Update spec §6 (one control mode) and the browser tests.

## 3. Pause hint on the big screen

- During a match, show a small, readable line at the bottom centre of the big screen: `Press P or Esc to pause`. It must not cover a platform: place it in the area under the main ground, keep it subtle (semi-transparent), and hide it during the final KO.
- P and Esc both pause and resume (P is free now that keyboard players are gone). Only the laptop pauses; phones cannot.
- Update the pause screen text and the spec.

## 4. Map vote screen

New flow. Voting is the default; the host can still pick one fixed map.

- **Host lobby:** the stage buttons become `Vote (default)` plus the three maps. With a fixed map, nothing changes from today: the host presses Start.
- **With Vote:** the host's Start button starts the vote when at least 2 players are Ready (the same rule as starting a match today). Remove the small stage-vote buttons from the phone's fighter select.
- **Phone vote screen:** a new screen that looks and works like the fighter select: a swipe carousel of the three maps, neighbours peeking in, dots under it, and a big `Vote!` button. Each card shows a **preview picture of the stage** (render the stage art from `public/shared/art/stages.js` scaled down into a canvas), the map name, day/night and the stage's hazards by name. Changing the vote is allowed until the vote ends.
- **Big screen vote view:** the three stage previews side by side, large, each with its live vote count and the faces (small sprites) of who voted for it, plus a 10 s countdown.
- **End:** when every Ready player has voted, or after **10 s**, whichever comes first. A tie or no votes is decided at random between the tied maps (`tallyVote`, as today). Show the winning map for about 1.5 s on both screens, then start the match.
- Players who join during the vote sit it out. A player who disconnects during the vote just does not count.
- Server: add a `vote` phase to the room state and to the `phase` message validators; stage votes are accepted only in that phase. Add server tests for: vote accepted only during the vote phase, unknown stage refused, a second vote replaces the first.
- Browser test: two phones ready, host starts the vote, both vote, the match starts on the voted map.

## 5. Stomp attack (new move)

- **Attack in the air without Up held** = stomp. The fighter stops moving sideways, drops straight down fast, and on landing a ring-shaped **shockwave** hits every opponent within the radius with damage and knockback away from the stomper.
- **Up + Attack in the air** stays the normal upward attack. Attack on the ground is unchanged.
- **Items:** a held Book is still thrown when you attack in the air (no stomp). A held Sardine powers the stomp (uses one swing; Sardine damage and knockback numbers apply). Megaphone, see items.
- If the fighter does not land within the maximum air time (falls off the stage), the stomp ends without a shockwave.
- Starting values in `config.js` (tune them in play): dive speed 18 px/frame, radius 130 px, damage 9 %, baseKb 6, kbGrowth 9, angle 45°, landing recovery 14 frames, max air time 60 frames. It is a normal attack, not a special, so it has no cooldown; the recovery is its cost.
- Host: a shockwave animation (an expanding ring and dust on the ground) and a sound. Reuse what the Bass Drop already draws where it fits, but make the stomp look distinct and smaller.
- Tests: stomp hits an opponent inside the radius and not outside, Up + Attack in the air still attacks upward, Book in the air is thrown, Sardine stomp uses a swing, stomp off the edge does nothing.

## 6. Ledge grab (getting back after a fall)

Today it is almost impossible to get back after falling. Add a ledge grab that needs some skill:

- Only the two outer corners of the **solid main ground** of each stage can be grabbed.
- A grab happens only when the fighter is **falling** (vy > 0), is **facing the wall**, is **not in hitstun or stun**, and the fighter's hand point (top of the hurtbox, on the wall side) comes within **20 px** of the corner.
- **Once per airtime:** after letting go, no new grab until the fighter has stood on a platform again (or respawned).
- Hanging lasts at most **1.5 s**, then the fighter drops. **Jump** climbs up onto the ground (standing on it, near the edge). **Down** lets go. Left/right away from the wall also lets go.
- **No invincibility** while hanging: a hit knocks the fighter off as usual.
- Pose: a hanging pose (arms up) in the sprite generator; the fighter is drawn hanging from the corner.
- All numbers in `config.js`. Tests: grab works when falling and facing the wall, does not work going up, does not work in hitstun, does not work twice in one airtime, Jump climbs up, it lets go after 1.5 s.

## 7. Held items in the hand

- A held item (Book, Sardine, Group Project, Megaphone, Cork Shield, Azulejo) is drawn **in the fighter's hand**, not above the head. Add a hand anchor point per pose to the sprite generator (`public/shared/art/characters.js` / `sprites.js`) and draw the item there, mirrored with the facing, following the arm in run, jump, attack and hang poses.
- The phone header label for the held item stays.

## 8. Items: new set of nine

Replace the item set. Every item needs: rules in `src/game/items.js` (or a new module if it gets big), numbers in `config.js`, a pick-up line on the phone, a drawing in the host renderer (lying on the ground and in the hand), a sound, and tests. Remove the Espresso completely.

**Spawning:** more often than today. Every **6 to 10 s**, at most **4** on the stage at once, each disappears after 25 s (these numbers were suggested and not yet confirmed by the team: keep them in `config.js` and note them in DECISIONS). Spawn chances are weighted: Lucky Rooster **4 %**, the other eight share the rest equally (12 % each). Use `rng.js`.

| Item | Kind | Effect (starting values) |
|---|---|---|
| **Pastel de Nata** | on touch | Heals 20 %, never below 0 %. (The old Custard Tart, renamed.) |
| **Sardine** | held | Unchanged: the next 5 normal attacks do 6 % with very high knockback. Also powers the stomp. |
| **Book** | held | Unchanged: the next attack throws it, 14 %. |
| **Group Project** | held, forced | Hot potato. Whoever touches it is stuck with it (it is taken even with full hands: it replaces the held item, which drops). A 5 s fuse starts at the first pick-up and does not reset. A normal attack that hits an opponent passes it to them. When the fuse runs out it explodes on whoever holds it: 18 %, strong launch (baseKb 8, kbGrowth 10, upward 70°). The phone of the holder shows "Group project! Pass it on before the deadline!" and a ticking count. The host draws a fuse/timer above it. |
| **Bifana** | on touch | Eaten at once: weight +40 for 10 s (harder to launch), the fighter looks a bit wider. |
| **Megaphone** | held | The next 3 normal attacks become a wide sound cone forward (range 200 px, height 140 px): 3 % and a strong push (baseKb 9, kbGrowth 6, angle 15°). Upward attacks blast upward. In the air: the stomp is unchanged and does not use the Megaphone. |
| **Cork Shield** | held | Blocks the next hit of any kind (attack, special, projectile, hazard) completely: no damage, no knockback, no status effect. Then it breaks. Does not protect against falling out of the stage or the Group Project explosion. |
| **Azulejo** | held | The next attack throws the tile; after 12 frames it shatters into 3 shards that fan out forward (angles −12°, 0°, +12°), each 5 %, small knockback, each shard hits one opponent once. |
| **Lucky Rooster** | on touch, rare | Invincible for 5 s (a golden glow; hits pass through without effect). Hazards still move the fighter (wave drag, crowd) but do no damage. |

Rules that apply to all held items: one held item at a time (except the forced Group Project), seagulls can steal any held item except the Group Project, and a KO drops everything. Update spec §7.3, the phone pick-up texts, the walkthrough and the `items` tests.

## 9. Hazards: more often, three per map

**Timing:** after a hazard ends, the next warning starts at a random point **10 to 15 s** later (`hazards.minS` / `maxS` and the lobby defaults). Still one at a time, still the name and 3, 2, 1 announcement in the top right and on every phone.

**Nova SBE Campus**
- **Cascais Line Train:** draw the train on the **rails at the bottom of the screen** (y 678 to 720 in the stage art), tall enough that its body reaches up through the terrace level, so it is visible where it hits. The hit zone stays the terrace level. Replace the 25 % "STRIKE! Train cancelled." with: **25 % of trains are late**. The warning and 3, 2, 1 run as usual, then nothing happens and nothing is shown; **5 s later** the train arrives **without any warning**. Use `rng.js`. Test both cases.
- **Bad Wi-Fi:** unchanged.
- **New: Sudden Rain.** It starts raining over the **whole map** for 6 s: every fighter slips as with Cash Rain (`slip`), on every platform. It does no damage, so it may cover everything. Rain drawn over the stage, darker sky, wet shine on platforms; phone line "It's raining! Everything is slippery."

**Carcavelos Beach**
- **Big Wave (reworked):** it **rises from the bottom of the screen** at a random x in one random half of the sandbank, then rolls towards the far edge of the stage (the edge on the other side) and off it. Fighters on the sand level that it touches are **dragged along** with it (like the crowd, but strong enough to carry a standing fighter over the edge) and take 8 % once. Jumping onto a platform or over the wave escapes it. The wave stops dragging at the stage edge, so a dragged fighter flies on and falls, with a chance to ledge grab. Draw the water from the bottom screen edge up. Tests: dragged to the edge, a fighter on a roof is safe, a fighter who jumps over it is not dragged.
- **Seagulls:** unchanged.
- **New: Midday Sun.** For 5 s, every fighter standing on the **sand level** takes **2 % every 0.5 s** (at most 20 %). The roofs and the lifeguard tower are safe. Bright glare over the sand, heat shimmer; phone line "Sunburn! Get in the shade."

**Bairro Alto**
- **Drunk Crowd** and **Drinks:** unchanged.
- **New: Fireworks.** Three marked spots in the street (a glowing fuse on the ground for the warning time). When it fires, a rocket shoots straight up from each spot. A fighter it touches is **carried upward** with it for about 0.5 s, then the rocket **explodes**: 12 % and a launch (baseKb 6, kbGrowth 8, angle 80°). Fighters on the balconies and roofs are safe from the rockets (they start in the street). Coloured explosion particles on the host; phone line "Fireworks! Santos Populares came early."

Each new hazard: an entry in `HAZARDS` (name and short name for the vote), the stage's hazard list, sounds, a telegraph during the warning, a test that a fighter on a safe platform takes no effect (Sudden Rain is the exception and gets a test that it causes no damage).

## Done means

- Spec, decisions, walkthrough and README match the new game.
- All tests green, including new tests for every point above.
- A browser run of a whole match with two phones (the existing browser tests) still works.
- Open a pull request to `main` with a short list of what changed. Do not merge it.
