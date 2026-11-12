// Browser regressions: connection trouble at the worst moments, found by the client bug review.
// The server runs inside this test, so the test can cut the host page's connection
// from the server side, and Playwright can take the page offline so it cannot come back at once.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, devices } from 'playwright';
import { createApp } from '../../server/app.js';
import { MemoryStore } from '../../server/store/memory.js';

const CONFIG = { port: 0, trustProxy: false, useSheets: false, pinPepper: 'browser-test-pepper-0123', sessionSecret: 'browser-test-secret-0123', warnings: [] };

test('the host page loses its connection around Start, in mid-match and when the match ends; a second tab of one player', async (t) => {
  const store = new MemoryStore();
  const app = createApp({ config: CONFIG, store });
  const port = await app.listen(0, '127.0.0.1');
  const base = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch();
  t.after(async () => {
    await browser.close();
    await app.close();
  });
  const crashes = [];
  const phone = async (device) => {
    const d = devices[device];
    const context = await browser.newContext({ userAgent: d.userAgent, viewport: { width: d.viewport.height, height: d.viewport.width }, deviceScaleFactor: d.deviceScaleFactor, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    page.on('pageerror', (e) => crashes.push(e.message));
    return page;
  };
  const join = async (page, code, gamertag) => {
    await page.goto(`${base}/play?room=${code}`);
    await page.fill('#tagInput', gamertag);
    await page.fill('#pinInput', '2468');
    await page.fill('#pin2Input', '2468');
    await page.click('#authSubmit');
    await page.waitForSelector('#select:not([hidden])');
    await page.click('#ready');
  };
  // A thumb on the joystick (the only control), pushed 50 px to the left or right for a while.
  const hold = async (page, direction, ms) => {
    const box = await page.locator('#stickZone').boundingBox();
    const at = { pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true, clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 };
    const pushed = { ...at, clientX: at.clientX + (direction === 'left' ? -50 : 50) };
    await page.dispatchEvent('#stickZone', 'pointerdown', at);
    await page.dispatchEvent('#stickZone', 'pointermove', pushed);
    await page.waitForTimeout(ms);
    await page.dispatchEvent('#stickZone', 'pointerup', pushed);
  };

  const hostContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const host = await hostContext.newPage();
  host.on('pageerror', (e) => crashes.push(e.message));
  await host.goto(`${base}/`);
  await host.click('#openRoom');
  await host.click('#openRoom', { force: true }).catch(() => {}); // an impatient second click must do no harm
  await host.waitForFunction(() => /^[A-Z]{4}$/.test(document.getElementById('roomCode').textContent));
  const code = await host.textContent('#roomCode');
  assert.equal(app.rooms.rooms.size, 1, 'one room, also after a double click');
  // Cut the host page off: the server drops its socket, and the page cannot reconnect while offline.
  const cutHost = async () => {
    await hostContext.setOffline(true);
    app.rooms.rooms.get(code).host.ws.terminate();
    await host.waitForSelector('#offline:not([hidden])');
  };
  const restoreHost = async () => {
    await hostContext.setOffline(false);
    await host.waitForSelector('#offline', { state: 'hidden', timeout: 10_000 });
  };

  const ana = await phone('iPhone 13');
  const max = await phone('Pixel 7');
  await join(ana, code, 'Ana');
  await join(max, code, 'Max');
  await host.waitForFunction(() => !document.getElementById('startMatch').disabled);
  await host.click('#lifeButtons button[data-value="1"]');
  await host.click('#stageButtons button[data-value="campus"]'); // a fixed stage: Start begins the match at once

  // --- Start is pressed while the connection is down: a clear message, and Start works afterwards
  await cutHost();
  await ana.waitForFunction(() => /big screen lost its connection/.test(document.getElementById('offline').textContent) && !document.getElementById('offline').hidden);
  await host.click('#startMatch');
  await host.waitForFunction(() => /No connection to the server/.test(document.getElementById('toast').textContent));
  assert.equal(await host.isVisible('#lobby'), true, 'still in the lobby, not stuck on "Get ready…"');
  await restoreHost();
  await ana.waitForFunction(() => document.getElementById('offline').hidden);
  await host.waitForFunction(() => !document.getElementById('startMatch').disabled);
  await host.click('#startMatch');
  await host.waitForFunction(() => window.novaBrawl.state && window.novaBrawl.state.phase === 'fight', null, { timeout: 20_000 });
  await ana.waitForSelector('#pad:not([hidden])');

  // --- the connection drops in the middle of the match: the match goes on, and the phones steer again afterwards
  const frameBefore = await host.evaluate(() => window.novaBrawl.state.frame);
  await cutHost();
  await host.waitForFunction((f) => window.novaBrawl.state.frame > f + 30, frameBefore);
  assert.equal(await host.evaluate(() => window.novaBrawl.screen), 'match', 'the match keeps running on the laptop');
  await restoreHost();
  await ana.waitForFunction(() => document.getElementById('offline').hidden);
  const x = await host.evaluate(() => window.novaBrawl.state.fighters[0].x);
  await hold(ana, 'right', 400);
  assert.ok(await host.evaluate(() => window.novaBrawl.state.fighters[0].x) > x + 30, 'Ana steers again');

  // --- the match ends while the connection is down: the result is sent when it is back
  await cutHost();
  await host.evaluate(() => { window.novaBrawl.state.fighters[1].invincible = 0; window.novaBrawl.state.fighters[1].x = -1000; });
  await host.waitForSelector('#results:not([hidden])', { timeout: 15_000 });
  assert.match(await host.textContent('#resultNote'), /No connection right now|has not confirmed/);
  assert.equal(store.matches.size, 0);
  await restoreHost();
  await host.waitForFunction(() => document.getElementById('resultNote').textContent === 'Result saved.', null, { timeout: 10_000 });
  assert.equal(store.matches.size, 1);
  assert.equal(store.players.get('ana').points, 100);
  await ana.waitForFunction(() => /\+100 points/.test(document.getElementById('resultPoints').textContent));
  await max.waitForFunction(() => document.getElementById('resultPlace').textContent === '2nd place');

  // --- back in the lobby: the same player opened in a second tab replaces the first, and the two do not fight over the slot
  await host.click('#backToLobby');
  await ana.waitForSelector('#select:not([hidden])');
  const secondTab = await ana.context().newPage();
  await secondTab.goto(`${base}/play?room=${code}`);
  await secondTab.waitForSelector('#select:not([hidden])');
  await ana.waitForFunction(() => /another tab/.test(document.getElementById('noticeText').textContent));
  let flips = 0;
  let last = true;
  for (let i = 0; i < 12; i++) {
    await host.waitForTimeout(200);
    const connected = await host.evaluate(() => window.novaBrawl.roster.find((p) => p.gamertag === 'Ana').connected);
    if (connected !== last) flips += 1;
    last = connected;
  }
  assert.equal(flips, 0, 'the two tabs do not throw each other out');
  assert.equal(await secondTab.isVisible('#select'), true);
  assert.equal(await ana.evaluate(() => localStorage.getItem('nb_token') !== null), true, 'the login was not thrown away');
  // "Use this one instead" on the first tab takes the player back.
  await ana.click('#noticeButton');
  await ana.waitForSelector('#select:not([hidden])');
  await secondTab.waitForFunction(() => /another tab/.test(document.getElementById('noticeText').textContent));

  // --- "Leave" lasts: when the server later closes the idle connection, the phone does not walk back in
  await max.waitForSelector('#select:not([hidden])');
  await max.click('#leave');
  await max.waitForFunction(() => /You left the room/.test(document.getElementById('noticeText').textContent));
  await host.waitForFunction(() => !window.novaBrawl.roster.some((p) => p.gamertag === 'Max'));
  for (const conn of app.rooms.connections) if (conn.role === null) conn.ws.close(4003, 'idle'); // what the housekeeping does after a minute
  await host.waitForTimeout(1500);
  assert.equal(await host.evaluate(() => window.novaBrawl.roster.some((p) => p.gamertag === 'Max')), false, 'still out');
  assert.match(await max.textContent('#noticeText'), /You left the room/);
  // "Join again" opens the connection again and joins.
  await max.click('#noticeButton');
  await max.waitForSelector('#select:not([hidden])', { timeout: 10_000 });
  await host.waitForFunction(() => window.novaBrawl.roster.some((p) => p.gamertag === 'Max' && p.connected));

  assert.deepEqual(crashes, [], 'no page threw an error');
});
