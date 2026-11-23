// D-211: the shared interactive guide, using real pad inputs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, devices } from 'playwright';
import { createApp } from '../../server/app.js';
import { MemoryStore } from '../../server/store/memory.js';

const CONFIG = { port: 0, trustProxy: false, useSheets: false, pinPepper: 'tutorial-browser-pepper', sessionSecret: 'tutorial-browser-secret', warnings: [] };

test('new player triggers full-screen phone guide; everyone performs each step; account completion prevents a repeat', async (t) => {
  const store = new MemoryStore();
  const app = createApp({ config: CONFIG, store });
  const port = await app.listen(0, '127.0.0.1');
  const base = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch();
  t.after(async () => { await browser.close(); await app.close(); });
  const errors = [];
  const watch = (page) => {
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  };
  const host = await browser.newPage({ viewport: { width: 1280, height: 800 } }); watch(host);
  await host.goto(base); await host.click('#openRoom');
  await host.waitForFunction(() => /^[A-Z]{4}$/.test(document.getElementById('roomCode').textContent));
  const code = await host.textContent('#roomCode');

  const phone = async (name) => {
    const d = devices['iPhone 13'];
    const context = await browser.newContext({ ...d, viewport: { width: 844, height: 390 } });
    const page = await context.newPage(); watch(page);
    await page.goto(`${base}/play?room=${code}`);
    await page.fill('#tagInput', name); await page.fill('#pinInput', '2468'); await page.fill('#pin2Input', '2468');
    await page.click('#authSubmit'); await page.waitForSelector('#select:not([hidden])');
    await page.click('#ready');
    return page;
  };
  const ana = await phone('Ana'), max = await phone('Max');
  app.data.completeTutorial('max'); await app.data.flush(); // one newcomer is enough
  await host.click('#addBot');
  await host.click('#stageButtons button[data-value="campus"]');
  await host.waitForFunction(() => !document.getElementById('startMatch').disabled);
  await host.click('#startMatch');
  for (const p of [ana, max]) { await p.waitForSelector('#intro:not([hidden])'); await p.click('#skip'); }
  await host.waitForSelector('#tutorial:not([hidden])');
  for (const p of [ana, max]) await p.waitForSelector('#stickZone.tutorialFocus');
  for (const p of [ana, max]) {
    const [focus, other] = await p.evaluate(() => [getComputedStyle(document.getElementById('stickZone')).opacity, getComputedStyle(document.querySelector('[data-b="jump"]')).opacity]);
    assert.equal(focus, '1', 'the spotlit control is fully visible (D-221)');
    assert.equal(other, '0.26', 'the other controls are dimmed');
  }
  const bounds = await host.locator('#tutorial').boundingBox();
  assert.deepEqual(bounds, { x: 0, y: 0, width: 1280, height: 800 }, 'guide covers the entire laptop, including letterboxing');
  assert.equal(await host.locator('.tutorialPhone').isVisible(), true);
  const controller = await host.locator('.tutorialPhone').boundingBox();
  assert.ok(controller.x >= 640 && controller.y <= 48 && controller.x + controller.width >= 1200, 'controller example is at the top right');
  assert.ok(await host.evaluate(() => window.novaBrawl.state.fighters.every((f) => f.tutorialProtected)), 'newcomer, returning player and bot all protected');
  await host.keyboard.press('Escape');
  const frames = await host.evaluate(() => window.novaBrawl.state.tutorial.frames);
  await host.waitForTimeout(150);
  assert.equal(await host.evaluate(() => window.novaBrawl.state.tutorial.frames), frames);
  await host.keyboard.press('Escape');

  const tap = async (p, name) => {
    const box = await p.locator(`[data-b="${name}"]`).boundingBox();
    await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await p.mouse.down(); await p.waitForTimeout(100); await p.mouse.up();
  };
  const drag = async (p, dx) => {
    const box = await p.locator('#stickZone').boundingBox();
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    const reachable = await p.evaluate(([x, y]) => document.getElementById('stickZone').contains(document.elementFromPoint(x, y)), [x, y]);
    assert.equal(reachable, true, 'spotlight does not block touches');
    await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.move(x + dx, y);
    await p.waitForTimeout(100); await p.mouse.up();
  };
  await tap(ana, 'jump');
  assert.equal(await host.evaluate(() => window.novaBrawl.state.tutorial.step), 0, 'wrong action cannot advance');
  await drag(ana, -50); await drag(ana, 50);
  await ana.waitForFunction(() => /Waiting for the other/.test(document.getElementById('tutorialHint').textContent));
  assert.equal(await host.evaluate(() => window.novaBrawl.state.tutorial.step), 0, 'one human cannot skip everyone else');
  // Rejoining replays the current tutorial status and spotlight.
  await ana.reload(); await ana.waitForSelector('#stickZone.tutorialFocus');
  await drag(max, -50); await drag(max, 50);
  await host.waitForFunction(() => window.novaBrawl.state.tutorial.step === 1);
  await ana.waitForSelector('[data-b="jump"].tutorialFocus');
  await max.waitForSelector('[data-b="jump"].tutorialFocus');
  // A long explanation must still be followed by its own fresh practice countdown.
  await host.evaluate(() => { window.novaBrawl.state.tutorial.frames = 900; });
  for (const [index, action] of [[1, 'jump'], [2, 'attack'], [3, 'special']]) {
    await ana.waitForSelector(`[data-b="${action}"].tutorialFocus`);
    if (action === 'special') assert.match(await ana.textContent('#tutorialHint'), /Cash Rain/);
    if (action === 'special') assert.equal(await host.locator('.tutorialSpecials p').count(), 3, 'the bot\'s special is explained too (D-221)');
    await tap(ana, action);
    assert.equal(await host.evaluate(() => window.novaBrawl.state.tutorial.step), index);
    await max.waitForSelector(`[data-b="${action}"].tutorialFocus`);
    await tap(max, action);
    await host.waitForFunction((n) => window.novaBrawl.state.tutorial.step === n, index + 1);
  }
  await host.waitForSelector('#tutorial.practising');
  await ana.waitForSelector('#pad.practising');
  assert.equal(await host.locator('.tutorialPhone').isVisible(), false, 'arena is visible during free practice');
  const practiceBounds = await host.locator('#tutorial').boundingBox();
  assert.ok(practiceBounds.height < 320, 'only a compact countdown overlays the arena');
  assert.equal(await ana.locator('.tutorialFocus').count(), 0, 'every control is available in free practice');
  assert.ok(await host.evaluate(() => window.novaBrawl.state.fighters.every((f) => f.tutorialProtected)));
  assert.equal(store.players.get('ana').tutorial_done, false, 'practice is part of onboarding');
  // Paused, the countdown stands still, so what the phone shows can be checked without a race (D-221).
  await host.keyboard.press('Escape');
  const practiceFrame = await host.evaluate(() => window.novaBrawl.state.tutorial.practiceFrames);
  assert.ok(practiceFrame < 300, 'free practice has only just started: the explanation used none of its time');
  const secondsLeft = Math.ceil((600 - practiceFrame) / 60);
  await ana.waitForFunction((n) => document.getElementById('tutorialHint').textContent.startsWith(`FREE PRACTICE · ${n}s`), secondsLeft);
  await host.waitForTimeout(200);
  assert.equal(await host.evaluate(() => window.novaBrawl.state.tutorial.practiceFrames), practiceFrame);
  await host.keyboard.press('Escape');
  await tap(ana, 'attack'); await tap(max, 'special');
  assert.ok(await host.evaluate(() => window.novaBrawl.state.fighters.every((f) => f.percent === 0)));
  await host.waitForSelector('#tutorial', { state: 'hidden' });
  await ana.waitForSelector('#tutorialHint', { state: 'hidden' });
  await host.waitForFunction(() => window.novaBrawl.state.fighters.every((f) => !f.tutorialProtected));
  await host.waitForTimeout(600); await app.data.flush();
  assert.equal(store.players.get('ana').tutorial_done, true);
  assert.equal(store.players.get('ana').matches, 0, 'completion does not require a scored result');

  await host.keyboard.press('Escape'); await host.click('#quitMatch');
  for (const p of [ana, max]) { await p.waitForSelector('#select:not([hidden])'); await p.click('#ready'); }
  await host.waitForFunction(() => !document.getElementById('startMatch').disabled); await host.click('#startMatch');
  for (const p of [ana, max]) { await p.waitForSelector('#intro:not([hidden])'); await p.click('#skip'); }
  await host.waitForFunction(() => window.novaBrawl.state?.phase === 'fight');
  assert.equal(await host.evaluate(() => window.novaBrawl.state.tutorial), null);
  assert.equal(await host.isVisible('#tutorial'), false);
  assert.deepEqual(errors, []);
});
