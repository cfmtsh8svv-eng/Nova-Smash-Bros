# NOVA Brawl

> **Scan. Pick. Brawl.** A party platform fighter set at Nova SBE. Your phone is the controller.

Group project for **Introduction to Programming** (ItP).

Up to **6 players** scan a QR code, their phones turn into controllers, and they fight on the **Nova SBE Campus**, at **Carcavelos Beach** and in **Bairro Alto**. Every hit raises your **damage %**, and the higher it gets, the further you fly. Get knocked off the screen or hit **200 % (BURNOUT!)** and you lose one of your **3 lives**. Watch out for bad Wi-Fi, giant waves, thieving seagulls, the Tram 28 and that Blue Drink.

## Documentation

| Document | What's inside |
|---|---|
| [`docs/CONCEPT.md`](docs/CONCEPT.md) | Brand (name, voice, colours, logo), fighters, stages, hazards, items, easter eggs |
| [`docs/SPECS.md`](docs/SPECS.md) | Requirements (MoSCoW), architecture, class diagram, network protocol, tuning values, tests, 3-week plan |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | **Every decision** (made, proposed and open) in one log |
| [`docs/BRAINSTORM.md`](docs/BRAINSTORM.md) | Ideas not decided yet: login, gamification, leaderboard, stats, achievements, skins, more fighters |
| [`mockup/index.html`](mockup/index.html) | Clickable visual mock-up: screens, phone controller, fighters, stages, items, knockback chart. Download the file and open it in a browser. |

## Tech

- **Python 3.11+** with **Pygame** for the game
- A small built-in web server + WebSockets for the **phone controller** (a plain HTML/JS page, no app install)
- **pytest** for tests

## Status

Concept phase: specs and mock-up done, implementation not started yet.

## Getting started *(planned)*

```bash
pip install -r requirements.txt
python -m nova_brawl
```

Then scan the QR code on the screen with your phone.
