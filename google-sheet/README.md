# Google Sheet script

`Code.gs` is the program that runs **inside the Google Sheet**, as an Apps Script web app. It is the only code that reads and writes the sheet's cells: the server sends it one HTTPS request per operation (get a player, create a player, record a match, list players), and it checks the shared secret, validates everything again and writes under a lock.

It does not run on our server and is not deployed with it. After a change here, paste the whole file into the sheet's Apps Script editor and deploy a new version: [`docs/SETUP_SHEETS.md`](../docs/SETUP_SHEETS.md), "If you change the script later".

Tested in Node against a stand-in spreadsheet: `tests/server/sheets-script.test.js`.
