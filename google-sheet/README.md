# Google Sheet script

`Code.gs` is the program that runs **inside the Google Sheet**, as an Apps Script web app. It is the only code that reads and writes the sheet's cells: the server sends it one HTTPS request per operation (get a player, create a player, record a match, mark the first-game guide as done, list players), and it checks the shared secret, validates everything again and writes under a lock.

It does not run on our server and is not deployed with it. Tested in Node against a stand-in spreadsheet: `tests/server/sheets-script.test.js`.

Without a sheet the game still works: the server then keeps accounts and scores in memory until it stops.

## Setting it up (once, about ten minutes)

1. **Make three secrets.** Run `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` three times and keep the results in a private note, never in the repository or a chat. They become `SHEETS_SHARED_SECRET`, `PIN_PEPPER` (mixed into every PIN hash: never change it once players exist, or nobody can log in) and `SESSION_SECRET` (signs the login tokens: changing it logs everyone out).
2. **Create the sheet** at [sheets.new](https://sheets.new) and name it NOVA Brawl. Tabs and columns are created by the script.
3. **Add the script.** In the sheet: Extensions → Apps Script. Replace everything in the editor with all of `Code.gs` and save.
4. **Give it the secret.** Project Settings (gear icon) → Script Properties → add `SHARED_SECRET` with the value of `SHEETS_SHARED_SECRET`.
5. **Create the tabs.** Back in the editor, choose the function `setup` and click Run. Allow the permissions Google asks for (Advanced → Go to the project). The sheet now has the tabs `players` and `matches` with header rows.
6. **Deploy as a web app.** Deploy → New deployment → type Web app, Execute as **Me**, Who has access **Anyone** → Deploy. The Web app URL (ending in `/exec`) is `SHEETS_WEBAPP_URL`. "Anyone" is needed because the game server has no Google login; every request without the shared secret is refused.
7. **Tell the server.** Set the four variables `SHEETS_WEBAPP_URL`, `SHEETS_SHARED_SECRET`, `PIN_PEPPER` and `SESSION_SECRET`: on Render under the service's Environment, locally in `.env` (copy `.env.example`; `.env` is git-ignored). With only one of the two `SHEETS_` values, or with `PIN_PEPPER` or `SESSION_SECRET` missing or shorter than 16 characters, the server refuses to start and names what is missing.
8. **Check it.** The server's start line says `store: sheets` and then `The Google Sheet answers.`; `/healthz` shows `"store":"sheets"` and `"storeReachable":true`. Register a test player: the `players` tab gets a row with a salt and a hash, never the PIN.

## After a change to Code.gs

Editing the file in the Apps Script editor does not change the deployed web app. Paste the whole new `Code.gs`, save, run `setup` once if the change adds a column, then Deploy → Manage deployments → pencil icon → Version: New version → Deploy. The URL stays the same; without the new version the old script keeps answering.

## Good to know

- The sheet is slow (one to three seconds a request) and Google limits how often a script may run, so the game never waits for it during a match: results are queued and written in the background, and the leaderboard is read at most once a minute.
- Do not edit the header rows or move columns: the script finds columns by position. Editing a player's numbers by hand is fine. In `tutorial_done`, 0 shows a player the first-game guide again and 1 skips it.
- To reset everything, delete the rows below the headers in both tabs.
- Share the sheet only with the team, never publicly: it holds the PIN hashes.
