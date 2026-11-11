// Entry point: `npm start`.
import { existsSync } from 'node:fs';
import { createApp } from './app.js';
import { readConfig } from './config.js';
import { MemoryStore } from './store/memory.js';
import { SheetsStore } from './store/sheets.js';

// For local use, read a .env file if there is one (it is git-ignored).
if (existsSync('.env')) process.loadEnvFile('.env');

let config;
try {
  config = readConfig();
} catch (err) {
  console.error(`Configuration error: ${err.message}`);
  process.exit(1);
}
for (const warning of config.warnings) console.warn(`Note: ${warning}`);

const store = config.useSheets ? new SheetsStore({ url: config.sheetsUrl, secret: config.sheetsSecret }) : new MemoryStore();
const app = createApp({ config, store, log: (line) => console.error(line) });
const port = await app.listen(config.port, config.host);
console.log(`NOVA Brawl is running: http://localhost:${port}  (store: ${store.kind})`);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    // Give waiting results one last chance to reach the sheet before we stop.
    await Promise.race([app.data.flush().catch(() => {}), new Promise((r) => setTimeout(r, 3000))]);
    await app.close();
    process.exit(0);
  });
}
// A bug in one request must never take the whole game down mid-demo.
process.on('uncaughtException', (err) => console.error(`Unexpected error: ${err.stack || err}`));
process.on('unhandledRejection', (err) => console.error(`Unexpected rejection: ${err && err.stack ? err.stack : err}`));
