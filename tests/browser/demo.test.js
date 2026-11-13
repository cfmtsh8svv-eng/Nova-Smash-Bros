// Browser test: demo mode (docs/DEMO.md). Shift+D in the lobby, the line in the bottom left,
// the locked lives, four fighters on the phone, a phone moved off another fighter, a demo
// match with one phone and one bot that ends at the time cap, the result that is not saved,
// and Shift+D again back in the lobby.
//
// To keep it short, the test moves the match's fighting time forward through the host page's
// debug hook (as the other browser tests move fighters), and moves the server's clock forward
// so the result's 120 s are plausible. Nothing in the game has a switch for this.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, devices } from 'playwright';
import { createApp } from '../../server/app.js';
import { MemoryStore } from '../../server/store/memory.js';
import { DEMO_SETTINGS, demoMatchSettings } from '../../src/game/config.js';
import { FIGHTERS } from '../../src/game/fighters.js';

const CONFIG = { port: 0, trustProxy: false, useSheets: false, pinPepper: 'browser-test-pepper-0123', sessionSecret: 'browser-test-secret-0123', warnings: [] };
const DEMO = demoMatchSettings();
const DEMO_NAMES = FIGHTERS.filter((f) => DEMO_SETTINGS.fighters.includes(f.id)).map((f) => f.name);

test('demo mode: Shift+D, four fighters, a match that ends at the cap, not saved, Shift+D again', async (t) => {
  const store = new MemoryStore();
  const clock = { offset: 0 };
  const app = createApp({ config: CONFIG, store, now: () => Date.now() + clock.offset });
  const port = await app.listen(0, '127.0.0.1');
  const base = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch();
  t.after(async () => {
    await browser.close();
    await app.close();
  });

  const problems = [];
  const watch = (page, name) => {
    page.on('console', (m) => { if (m.type() === 'error') problems.push(`${name} console: ${m.text()}`); });
    page.on('pageerror', (e) => problems.push(`${name} crashed: ${e.message}`));
    page.on('response', (r) => { if (r.status() >= 400) problems.push(`${name} got ${r.status()} for ${r.url()}`); });
  };
  const text = (page, selector) => page.textContent(selector);
  const shown = (page) => page.evaluate(() => [...document.querySelectorAll('#carousel .card')].filter((c) => !c.hidden).map((c) => c.querySelector('h3').textContent));

  // --- the room, one phone on a fighter that is not in the demo, one bot
  const host = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  watch(host, 'host');
  await host.goto(`${base}/`);
  await host.click('#openRoom');
  await host.waitForFunction(() => /^[A-Z]{4}$/.test(document.getElementById('roomCode').textContent));
  const code = await text(host, '#roomCode');
  const d = devices['iPhone 13'];
  const ana = await (await browser.newContext({ userAgent: d.userAgent, viewport: { width: d.viewport.height, height: d.viewport.width }, deviceScaleFactor: d.deviceScaleFactor, isMobile: true, hasTouch: true })).newPage();
  watch(ana, 'iphone');
  await ana.goto(`${base}/play?room=${code}`);
  await ana.fill('#tagInput', 'Ana');
  await ana.fill('#pinInput', '2468');
  await ana.fill('#pin2Input', '2468');
  await ana.click('#authSubmit');
  await ana.waitForSelector('#select:not([hidden])');
  assert.equal((await shown(ana)).length, 8, 'all eight fighters before demo mode');
  const outside = FIGHTERS.findIndex((f) => !DEMO_SETTINGS.fighters.includes(f.id));
  await ana.evaluate((i) => {
    const carousel = document.getElementById('carousel');
    const card = carousel.children[i];
    carousel.scrollTo({ left: card.offsetLeft + card.offsetWidth / 2 - carousel.clientWidth / 2 });
  }, outside);
  await host.waitForFunction((id) => window.novaBrawl.roster[0] && window.novaBrawl.roster[0].fighter === id, FIGHTERS[outside].id);
  await ana.click('#ready');
  await host.waitForFunction(() => window.novaBrawl.roster[0].ready);
  await host.click('#addBot');
  await host.waitForFunction(() => window.novaBrawl.bots.length === 1);
  await host.click('#lifeButtons button[data-value="2"]');
  assert.equal(await host.evaluate(() => window.novaBrawl.demo), false);
  assert.equal(await host.isVisible('#demoLine'), false);

  // --- Shift+D in the lobby: demo mode on
  await host.keyboard.press('Shift+KeyD');
  await host.waitForFunction(() => window.novaBrawl.demo === true);
  assert.equal(await text(host, '#demoLine'), 'DEMO MODE (to quit press Shift + D)');
  assert.equal(await host.isVisible('#demoLine'), true);
  assert.equal(await text(host, '#toast'), 'Demo mode on');
  // Bottom left, readable, and covering nothing of the lobby.
  const line = await host.evaluate(() => {
    const frame = document.getElementById('frame').getBoundingClientRect();
    const box = document.getElementById('demoLine').getBoundingClientRect();
    const others = [...document.querySelectorAll('#lobby *')].filter((e) => e.id !== 'demoLine' && !e.children.length && e.getClientRects().length && !e.closest('#demoLine')) // what is drawn: text, buttons, pictures;
    const overlaps = others.filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width && r.height && r.left < box.right && r.right > box.left && r.top < box.bottom && r.bottom > box.top;
    }).map((e) => e.id || e.className || e.tagName);
    return { left: box.left - frame.left, bottom: frame.bottom - box.bottom, width: box.width, frameW: frame.width, size: parseFloat(getComputedStyle(document.getElementById('demoLine')).fontSize), overlaps };
  });
  assert.ok(line.left < line.frameW * 0.05 && line.bottom >= 0 && line.bottom < 30, `bottom left: ${JSON.stringify(line)}`);
  assert.ok(line.size >= 14, `readable: ${line.size}px`);
  assert.deepEqual(line.overlaps, [], 'covers nothing');
  if (process.env.DEMO_SHOT) await host.screenshot({ path: process.env.DEMO_SHOT });
  // Lives locked to the demo value.
  const lives = await host.evaluate(() => [...document.querySelectorAll('#lifeButtons button')].map((b) => [b.dataset.value, b.disabled, b.getAttribute('aria-pressed')]));
  assert.deepEqual(lives, [1, 2, 3].map((n) => [String(n), true, String(n === DEMO.lives)]));
  // The bot plays a demo fighter, and a click cycles only through those.
  await host.waitForFunction((list) => window.novaBrawl.bots.every((b) => list.includes(b.fighter)), DEMO_SETTINGS.fighters);
  for (let i = 0; i < 4; i++) {
    const before = await host.evaluate(() => window.novaBrawl.bots[0].fighter);
    await host.click('.slot.p2');
    await host.waitForFunction((b) => window.novaBrawl.bots[0].fighter !== b, before);
    assert.ok(DEMO_SETTINGS.fighters.includes(await host.evaluate(() => window.novaBrawl.bots[0].fighter)));
  }

  // --- the phone shows the four demo fighters; Ana was moved and is no longer ready
  await ana.waitForFunction((n) => [...document.querySelectorAll('#carousel .card')].filter((c) => !c.hidden).length === n, DEMO_NAMES.length);
  assert.deepEqual(await shown(ana), DEMO_NAMES);
  await host.waitForFunction((id) => window.novaBrawl.roster[0].fighter === id && !window.novaBrawl.roster[0].ready, DEMO_SETTINGS.fighters.find((id) => FIGHTERS.some((f) => f.id === id)));
  assert.match(await text(ana, '#selectHint'), /Pick again/);
  assert.equal(await text(ana, '#ready'), 'Ready!');
  assert.equal(await host.isDisabled('#startMatch'), true);
  await ana.click('#ready');
  await host.waitForFunction(() => window.novaBrawl.roster[0].ready && !document.getElementById('startMatch').disabled);

  // --- a demo match on a fixed stage with one phone and one bot
  await host.click('#stageButtons button[data-value="campus"]');
  await host.click('#startMatch');
  await ana.waitForSelector('#intro:not([hidden])');
  await host.keyboard.press('Shift+KeyD'); // nothing outside the lobby
  await ana.click('#skip');
  await host.waitForFunction(() => window.novaBrawl.state && window.novaBrawl.state.phase === 'fight', null, { timeout: 20_000 });
  assert.equal(await host.evaluate(() => window.novaBrawl.demo), true, 'Shift+D in the intro did nothing');
  const settings = await host.evaluate(() => {
    const s = window.novaBrawl.state;
    for (const f of s.fighters) f.invincible = 100000; // nobody is knocked out while the test looks
    return { timeCapS: s.settings.timeCapS, lives: s.settings.lives, hazardMinS: s.settings.hazardMinS, hazardMaxS: s.settings.hazardMaxS, fighters: s.fighters.map((f) => f.fighterId) };
  });
  assert.deepEqual([settings.timeCapS, settings.lives, settings.hazardMinS, settings.hazardMaxS], [120, 1, 5, 8]);
  assert.ok(settings.fighters.every((id) => DEMO_SETTINGS.fighters.includes(id)));
  // The clock is drawn and the pause hint is not (what the canvas draws comes from these two).
  const hud = await host.evaluate(async () => {
    const view = await import('/game/view.js');
    return { clock: view.matchClock(window.novaBrawl.state), hint: view.pauseHint(window.novaBrawl.state) };
  });
  assert.match(hud.clock, /^[12]:[0-5]\d$/);
  assert.equal(hud.hint, false);
  assert.equal(await ana.locator('#pad:not([hidden])').count(), 1);
  assert.doesNotMatch(await ana.textContent('#pad'), /\d:\d\d/, 'no clock on the phone');
  await host.keyboard.press('Shift+KeyD'); // nothing during the match
  assert.equal(await host.evaluate(() => window.novaBrawl.demo), true);
  assert.equal(await host.evaluate(() => window.novaBrawl.screen), 'match', 'Shift+D does not pause or leave the match');
  // P still pauses, and the clock stands still while paused.
  await host.keyboard.press('KeyP');
  await host.waitForFunction(() => window.novaBrawl.screen === 'pause');
  const frozen = await host.evaluate(() => window.novaBrawl.state.fightFrames);
  await host.waitForTimeout(300);
  assert.equal(await host.evaluate(() => window.novaBrawl.state.fightFrames), frozen);
  await host.keyboard.press('KeyP');
  await host.waitForFunction(() => window.novaBrawl.screen === 'match');

  // --- fast forward to 1 s before the cap; the match ends by the cap
  clock.offset += (DEMO.timeCapS + 10) * 1000;
  await host.evaluate((cap) => { window.novaBrawl.state.fightFrames = cap * 60 - 60; }, DEMO.timeCapS);
  await host.waitForFunction(() => window.novaBrawl.state.phase === 'ended', null, { timeout: 5000 });
  assert.equal(await host.evaluate(() => window.novaBrawl.state.byTimeCap), true);
  assert.equal(await host.evaluate(async () => (await import('/game/view.js')).matchClock(window.novaBrawl.state)), '0:00');
  await host.waitForSelector('#results:not([hidden])', { timeout: 8000 });
  await host.waitForFunction(() => document.getElementById('resultNote').textContent === 'Demo match: not saved.', null, { timeout: 8000 });
  await ana.waitForFunction(() => document.getElementById('resultNote').textContent === 'Demo match: not saved.', null, { timeout: 8000 });
  assert.equal(await text(ana, '#resultPoints'), '', 'no points line on the phone');
  assert.equal(store.matches.size, 0, 'nothing stored');
  assert.equal(store.players.get('ana').matches, 0);
  await host.keyboard.press('Shift+KeyD'); // nothing on the results screen
  assert.equal(await host.evaluate(() => window.novaBrawl.demo), true);

  // --- back in the lobby: still demo mode; Shift+D switches it off
  await host.waitForSelector('#backToLobby:not([hidden])', { timeout: 15_000 });
  await host.click('#backToLobby');
  await host.waitForFunction(() => window.novaBrawl.screen === 'lobby');
  assert.equal(await host.isVisible('#demoLine'), true);
  await host.keyboard.press('Shift+KeyD');
  await host.waitForFunction(() => window.novaBrawl.demo === false);
  assert.equal(await host.isVisible('#demoLine'), false);
  assert.equal(await text(host, '#toast'), 'Demo mode off');
  const after = await host.evaluate(() => [...document.querySelectorAll('#lifeButtons button')].map((b) => [b.disabled, b.getAttribute('aria-pressed')]));
  assert.deepEqual(after, [[false, 'false'], [false, 'true'], [false, 'false']], 'the earlier choice (2 lives) is back');
  await ana.waitForFunction(() => [...document.querySelectorAll('#carousel .card')].filter((c) => !c.hidden).length === 8);
  const kept = await host.evaluate(() => window.novaBrawl.roster[0].fighter);
  assert.ok(DEMO_SETTINGS.fighters.includes(kept), 'the pick is kept');
  // Plain D and Shift with another key do nothing.
  await host.keyboard.press('KeyD');
  await host.keyboard.press('Control+Shift+KeyD');
  assert.equal(await host.evaluate(() => window.novaBrawl.demo), false);

  assert.deepEqual(problems, []);
});
