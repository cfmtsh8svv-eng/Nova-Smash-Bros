# Deploying NOVA Brawl

Two places run the same server:

| Where | Role | Cost |
|---|---|---|
| **Render** (free web service) | The public URL in the README, the one the teaching staff open | Free |
| **Mac mini + Tailscale Funnel** | A backup URL that never sleeps | Free |

Do the Google Sheet setup first ([`SETUP_SHEETS.md`](SETUP_SHEETS.md)), so you have the four secret values ready.

## A. Render

The repository contains [`render.yaml`](../render.yaml), a description of the service that Render reads. You do not have to type commands into the dashboard.

1. Sign in at [render.com](https://render.com) with the GitHub account that can see this repository.
2. Click **New → Blueprint**.
3. Choose the repository `Nova-Smash-Bros`. Render finds `render.yaml` and shows one service called **nova-brawl** on the **Free** plan. Branch: `main`.
4. Render asks for the four secret values (they are marked "sync: false" in the file, which means "typed in here, never stored in the repository"):
   `SHEETS_WEBAPP_URL`, `SHEETS_SHARED_SECRET`, `PIN_PEPPER`, `SESSION_SECRET`.
5. Click **Apply**. The first build takes two to three minutes.
6. Open the service page. At the top is the URL, something like `https://nova-brawl.onrender.com`.
7. Check `https://<url>/healthz`. It must show `{"ok":true,"store":"sheets",...}`.
8. Put the URL into [`README.md`](../README.md) under "Deployed app", commit and merge.

What `render.yaml` sets, in words: install with `npm ci --omit=dev` (only the two runtime dependencies), start with `npm start`, Node 22, health check at `/healthz`, and `TRUST_PROXY=cloudflare`. That last one tells the server that it sits behind Render's front door, so it takes the visitor's address (for rate limits) from the header that front door sets, and tells browsers to use https only.

Once after the first deployment, check that the limits see real addresses: open the game on two different networks (for example Wi-Fi and mobile data) and register one player on each. If the second one is told "Too many…" although it did nothing, the header is missing; remove `TRUST_PROXY` in the Render dashboard and tell the team.

**Every merge to `main` is deployed automatically.** That is also why nobody pushes to `main` directly.

### Things to know about the free plan

- **It sleeps after 15 minutes without visitors.** The first request then takes 30 to 60 seconds. **Open the URL two minutes before the demo** and leave the lobby open.
- **A restart forgets what is only in memory:** open rooms, results that were still waiting to be written, and who is locked out. Accounts and saved results are in the sheet and stay. Do not restart or redeploy during the demo.
- WebSockets work on the free plan; nothing extra to configure.

## B. Mac mini with Tailscale Funnel (backup)

Tailscale Funnel gives a computer at home a public `https://` address without opening ports on the router.

### Once

1. Install [Node.js 22](https://nodejs.org) and [Tailscale](https://tailscale.com/download) on the Mac mini and sign in to Tailscale.
2. In the [Tailscale admin console](https://login.tailscale.com/admin): **DNS → enable MagicDNS and HTTPS certificates**; then **Access controls → enable Funnel** for this device (the console offers a button that adds the needed lines).
3. Get the code and the dependencies:
   ```bash
   git clone https://github.com/<owner>/Nova-Smash-Bros.git
   cd Nova-Smash-Bros
   npm ci --omit=dev
   ```
4. Create the configuration: `cp .env.example .env`, then fill in the same four values as on Render and add the line `HOST=127.0.0.1`. With that line the server only answers Tailscale on the same computer, not everybody in the home network. Do **not** set `TRUST_PROXY` here: it is only for Render.
5. Stop the Mac from sleeping: **System Settings → Energy → Prevent automatic sleeping when the display is off**.

### Each time

```bash
cd Nova-Smash-Bros
git pull && npm ci --omit=dev     # get the latest version of main
npm start                         # leave this terminal open
```

In a second terminal:

```bash
tailscale funnel 3000
```

Tailscale prints the public address, for example `https://mac-mini.tail1234.ts.net`. Check `https://<that address>/healthz` from a phone on mobile data.

To keep both running after you close the terminal, start them with `nohup npm start &` and `tailscale funnel --bg 3000`. Stop the funnel with `tailscale funnel --https=443 off`.

### Using the backup in the demo

Both servers use the same sheet, so accounts work on both. Only one of them should be used at a time: a room exists on the server where it was opened. If Render is slow or down, open the Mac mini URL on the laptop and let the players scan the new QR code.

## Before the demo: checklist

1. Two minutes before: open the public URL (wakes the free host). `/healthz` shows `"ok":true`.
2. Open a room, scan with one iPhone and one Android phone on the room's network. Both reach the fighter select.
3. Play ten seconds. Buttons respond, the phone shows damage and lives.
4. Sound: click once on the laptop page (browsers only allow sound after a click); set the two volume sliders.
5. The backup URL answers too.
6. Keep the laptop plugged in and its screen from sleeping.

## If something goes wrong

| What you see | What to do |
|---|---|
| The page loads for a long time | The free host is waking up. Wait a minute, reload. |
| Phone: "Room not found" | The room code changed (page reloaded after a server restart). Scan the QR code again. |
| Phone: "Connection lost, reconnecting…" | Usually the Wi-Fi. The phone rejoins by itself and keeps its slot; mobile data works too. |
| Big screen: "Connection lost, reconnecting…" | The match keeps running on the laptop; phones are back in control when it reconnects. |
| "Can't reach the player list right now" | The sheet is unreachable. Players who already logged in can play; new ones cannot register. Results are written later. |
| Nothing works on Render | Switch to the Mac mini URL. |
| No network at all | `npm start` on the laptop, add two keyboard players in the lobby. |
