# Connecting the Google Sheet

The game stores players and results in a Google Sheet. The server never talks to the sheet directly: it calls a small script that lives inside the sheet (an **Apps Script web app**), and only that script reads and writes cells. This page sets it up, click by click. It takes about ten minutes and is done once.

Without this setup the game still works: it then keeps everything in memory until the server stops.

## What you need

- A Google account (any member's; the sheet can be shared with the others afterwards)
- The file [`apps-script/Code.gs`](../apps-script/Code.gs) from this repository
- A terminal with Node.js, to make three random secrets

## 1. Make the secrets

Run this **three times** and keep the three results in a private note (not in the repository, not in a chat):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Call them:

| Name | Used for |
|---|---|
| `SHEETS_SHARED_SECRET` | Proves to the script that a request comes from our server |
| `PIN_PEPPER` | Mixed into every PIN hash. **Never change it once players exist**, or nobody can log in |
| `SESSION_SECRET` | Signs the login tokens. Changing it logs everyone out |

## 2. Create the sheet

1. Open [sheets.new](https://sheets.new). A new, empty spreadsheet opens.
2. Click the title "Untitled spreadsheet" and name it **NOVA Brawl**.

You do not need to create tabs or columns. The script does that.

## 3. Add the script

1. In the sheet's menu click **Extensions → Apps Script**. A new browser tab opens with an editor and a file called `Code.gs`.
2. Select everything in the editor and delete it.
3. Open [`apps-script/Code.gs`](../apps-script/Code.gs) from the repository, copy **all** of it and paste it into the editor.
4. Click the **disk icon** (Save project).

## 4. Give the script its secret

1. In the left bar of the Apps Script editor click the **gear icon** (Project Settings).
2. Scroll down to **Script Properties** and click **Add script property**.
3. Property: `SHARED_SECRET` — Value: your `SHEETS_SHARED_SECRET` from step 1.
4. Click **Save script properties**.

(The property is called `SHARED_SECRET` inside the script. On the server the same value is called `SHEETS_SHARED_SECRET`.)

## 5. Create the tabs

1. Click the **`< >` icon** (Editor) in the left bar to go back to the code.
2. In the toolbar, in the function list next to **Debug**, choose **`setup`**.
3. Click **Run**.
4. The first time Google asks for permission: **Review permissions** → choose your account → **Advanced** → **Go to (project name) (unsafe)** → **Allow**. This warning appears for every private script; it only gives *your own* script access to *this* sheet.
5. Switch to the spreadsheet tab. There are now two tabs, `players` and `matches`, each with a bold header row.

## 6. Deploy the script as a web app

1. In the Apps Script editor click **Deploy → New deployment** (top right).
2. Click the **gear icon** next to "Select type" and choose **Web app**.
3. Fill in:
   - Description: `NOVA Brawl`
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Click **Deploy**, then **Done**.
5. Copy the **Web app URL**. It ends in `/exec`. This is your `SHEETS_WEBAPP_URL`.

"Anyone" is needed because the game server has no Google login. The script refuses every request that does not carry the shared secret, so the URL alone gives nobody access.

## 7. Tell the server

The server reads four environment variables:

| Variable | Value |
|---|---|
| `SHEETS_WEBAPP_URL` | The URL from step 6 |
| `SHEETS_SHARED_SECRET` | From step 1 (the same value as in step 4) |
| `PIN_PEPPER` | From step 1 |
| `SESSION_SECRET` | From step 1 |

- **On Render:** Dashboard → your service → **Environment** → add the four variables → **Save changes**. Render restarts the service.
- **On the Mac mini or your laptop:** copy `.env.example` to `.env` in the project folder and fill in the four values. `.env` is git-ignored; never commit it.

The two `SHEETS_` values belong together: with only one of them the server stops at start and says so. With both set, it also insists on `PIN_PEPPER` and `SESSION_SECRET` (at least 16 characters each) and names the one that is missing. That is on purpose: a half-configured server would lock players out later. With neither `SHEETS_` value it starts with the in-memory store.

## 8. Check that it works

1. Start (or restart) the server. The start line must say `store: sheets`, followed by `The Google Sheet answers.` `https://<your-url>/healthz` shows `"store":"sheets"` and `"storeReachable":true`. If the log shows a warning instead, the URL or the secret is wrong, or the script is not deployed for "Anyone".
2. Open the game, register a test player on a phone.
3. Look at the `players` tab: a new row with the gamertag, a salt, a hash, and zeros. **There is no PIN in the sheet**, only its hash.
4. Play one match with two logged-in players. The `matches` tab gets a row, and the players' numbers go up.

From the terminal you can also ask the script directly (replace both values):

```bash
curl -L -H "Content-Type: application/json" \
  -d '{"secret":"YOUR_SHARED_SECRET","action":"ping"}' "YOUR_WEBAPP_URL"
# {"ok":true,"data":"pong"}
```

With a wrong secret the answer is `{"ok":false,"error":"forbidden",...}`.

## If you change the script later

Editing `Code.gs` in the editor does **not** change the deployed web app. After pasting a new version: **Deploy → Manage deployments → pencil icon → Version: New version → Deploy**. The URL stays the same.

### Adding the crown column (build_v3, D-154)

The script now writes a 14th column, `last_won`, in the `players` tab: 1 when the player's last saved match was a win, 0 otherwise. A sheet created before this change has no header for it. After deploying the new `Code.gs`, type `last_won` into cell **N1** of the `players` tab. Empty cells below it count as 0 (no crown) until that player's next saved match.

### Bots that win (bug-fixes-2, D-182)

A script deployed before this fix refuses every match that a bot won, so those results never reach the sheet. Check the deployed script in the Apps Script editor: if it contains `'(keyboard player)'`, it is the old one. Either paste the whole new `Code.gs` (steps 3 and "If you change the script later"), or make these two changes by hand:

1. Below the line `var STAGES = ['campus', 'beach', 'bairro'];` add:

   ```javascript
   // The winner column holds a gamertag, or one of these when the winner has no account:
   // a bot won (D-172), or the winner's row could not be read when the result was saved.
   var WINNER_MARKERS = ['(bot)', '(unknown)'];
   ```

2. In the function `recordMatch`, replace

   ```javascript
   !(GAMERTAG.test(String(match.winner)) || match.winner === '(keyboard player)') ||
   ```

   with

   ```javascript
   !(GAMERTAG.test(String(match.winner)) || WINNER_MARKERS.indexOf(match.winner) >= 0) ||
   ```

Save, then deploy a new version: **Deploy → Manage deployments → pencil icon → Version: New version → Deploy**. Without this last step the old script keeps answering. Results refused before the update are not in the sheet and cannot be restored from it; the server logs each one as `Result ... was refused by the store and is dropped`, and `/healthz` counts them as `droppedResults` since the last start.

## Good to know

- **The sheet is slow** (a request takes one to three seconds) and Google limits how many requests a script may handle. That is why the game never waits for it during a match: results are queued and written in the background, and the leaderboard is read at most once a minute.
- **If the sheet is unreachable**, players who already logged in since the server started can keep playing, new players cannot register until it is back, and results wait in a queue (see the walkthrough).
- **Do not edit the header rows or move columns.** The script finds columns by position. Editing a player's numbers by hand is fine.
- **To reset everything**, delete the rows below the headers in both tabs.
- **Sharing:** share the sheet with the other members as *Viewer* or *Editor*. Do not share it publicly: it holds the PIN hashes.
