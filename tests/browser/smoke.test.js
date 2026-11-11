// Browser smoke test: the real pages in a real browser.
// One host page, one emulated iPhone and one emulated Android phone register,
// pick fighters, ready up and play; the test checks that the fighters on the big
// screen follow the phones and that no page logs an error.
//
// Run with: npm run test:browser   (needs: npx playwright install chromium)
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, devices } from 'playwright';
import { createApp } from '../../server/app.js';
import { MemoryStore } from '../../server/store/memory.js';

const CONFIG = { port: 0, trustProxy: false, useSheets: false, pinPepper: 'browser-test-pepper-0123', sessionSecret: 'browser-test-secret-0123', warnings: [] };

test('host page, an iPhone and an Android phone: register, pick, ready, start, play', async (t) => {
  const store = new MemoryStore();
  const app = createApp({ config: CONFIG, store });
  const port = await app.listen(0, '127.0.0.1');
  const base = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch();
  t.after(async () => {
    await browser.close();
    await app.close();
  });

  // Every console error, page crash and failed request of every page ends up here.
  const problems = [];
  const watch = (page, name) => {
    page.on('console', (m) => { if (m.type() === 'error') problems.push(`${name} console: ${m.text()}`); });
    page.on('pageerror', (e) => problems.push(`${name} crashed: ${e.message}`));
    page.on('response', (r) => { if (r.status() >= 400) problems.push(`${name} got ${r.status()} for ${r.url()}`); });
  };
  const phone = async (device, name) => {
    const d = devices[device];
    const context = await browser.newContext({ userAgent: d.userAgent, viewport: d.viewport, deviceScaleFactor: d.deviceScaleFactor, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    watch(page, name);
    return page;
  };
  const landscape = (page) => { const v = page.viewportSize(); return page.setViewportSize({ width: Math.max(v.width, v.height), height: Math.min(v.width, v.height) }); };
  // Press a pad button the way a finger does: pointer down, hold, pointer up.
  const press = async (page, button, ms) => {
    const box = await page.locator(`.key[data-b="${button}"]`).boundingBox();
    const at = { pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true, clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 };
    await page.dispatchEvent(`.key[data-b="${button}"]`, 'pointerdown', at);
    await page.waitForTimeout(ms);
    await page.dispatchEvent(`.key[data-b="${button}"]`, 'pointerup', at);
  };
  const fighter = (host, slot) => host.evaluate((s) => {
    const f = window.novaBrawl.state.fighters.find((x) => x.slot === s);
    return { x: f.x, y: f.y, fighterId: f.fighterId, name: f.name, cooldown: f.cooldown, onGround: f.onGround };
  }, slot);

  // --- the big screen
  const hostContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const host = await hostContext.newPage();
  watch(host, 'host');
  await host.goto(`${base}/`);
  assert.equal(await host.title(), 'NOVA Brawl');
  await host.click('#openRoom');
  await host.waitForSelector('#lobby:not([hidden])');
  await host.waitForFunction(() => /^[A-Z]{4}$/.test(document.getElementById('roomCode').textContent));
  const code = await host.textContent('#roomCode');
  assert.equal(await host.isDisabled('#startMatch'), true, 'nobody can start an empty room');
  assert.match(await host.getAttribute('#qr', 'src'), new RegExp(`room=${code}&secure=0$`));

  // --- an iPhone scans the QR code (the link carries the room code)
  const iphone = await phone('iPhone 13', 'iphone');
  await iphone.goto(`${base}/play?room=${code}`);
  await iphone.waitForSelector('#auth:not([hidden])');
  assert.equal(await iphone.isHidden('#roomInput'), true, 'no room code needed after scanning');
  // invalid input is answered next to the field, before anything is sent
  await iphone.fill('#tagInput', 'x');
  await iphone.fill('#pinInput', '1234');
  await iphone.fill('#pin2Input', '1234');
  await iphone.click('#authSubmit');
  assert.match(await iphone.textContent('#tagError'), /too short/);
  await iphone.fill('#tagInput', 'Ana');
  await iphone.fill('#pin2Input', '9999');
  await iphone.click('#authSubmit');
  assert.match(await iphone.textContent('#pin2Error'), /do not match/);
  await iphone.fill('#pin2Input', '1234');
  await iphone.click('#authSubmit');
  await iphone.waitForSelector('#select:not([hidden])');
  assert.equal(await iphone.textContent('#selectTag'), 'P1 · Ana');

  // --- an Android phone types the address and the code by hand
  const android = await phone('Pixel 7', 'android');
  await android.goto(`${base}/play`);
  await android.fill('#roomInput', 'ZZZZ');
  await android.fill('#tagInput', 'Max_07');
  await android.fill('#pinInput', '4321');
  await android.fill('#pin2Input', '4321');
  await android.click('#authSubmit');
  await android.waitForSelector('#auth:not([hidden])');
  await android.waitForFunction(() => /Room not found/.test(document.getElementById('roomError').textContent));
  await android.fill('#roomInput', code.toLowerCase());
  await android.click('#authSubmit');
  await android.waitForSelector('#select:not([hidden])');
  assert.equal(await android.textContent('#selectTag'), 'P2 · Max_07');
  assert.equal(store.players.size, 2);

  // a gamertag that is taken is refused with a clear message
  const third = await phone('Pixel 7', 'third');
  await third.goto(`${base}/play?room=${code}`);
  await third.fill('#tagInput', 'ANA');
  await third.fill('#pinInput', '1111');
  await third.fill('#pin2Input', '1111');
  problems.length = 0; // the 409 below is the expected answer, not a problem
  await third.click('#authSubmit');
  await third.waitForFunction(() => /taken/.test(document.getElementById('tagError').textContent));
  assert.equal(problems.filter((p) => !p.includes('409')).length, 0);
  problems.length = 0;
  await third.close();

  // --- pick fighters: the iPhone takes the first, the Android phone swipes to the fourth
  await host.waitForFunction(() => window.novaBrawl.roster.length === 2);
  assert.equal(await host.isDisabled('#startMatch'), true, 'not startable before anybody is ready');
  await android.evaluate(() => {
    const carousel = document.getElementById('carousel');
    const card = carousel.children[3];
    carousel.scrollTo({ left: card.offsetLeft + card.offsetWidth / 2 - carousel.clientWidth / 2 });
  });
  await android.waitForFunction(() => document.querySelector('#carousel .card.current h3').textContent === 'Surfer Girl');
  await iphone.click('#ready');
  await android.click('#ready');
  await host.waitForFunction(() => window.novaBrawl.roster.every((p) => p.ready));
  assert.deepEqual(await host.evaluate(() => window.novaBrawl.roster.map((p) => [p.gamertag, p.fighter])), [['Ana', 'finance_bro'], ['Max_07', 'surfer_girl']]);
  await host.waitForFunction(() => !document.getElementById('startMatch').disabled);

  // --- start: phones turn sideways and become gamepads
  await landscape(iphone);
  await landscape(android);
  await host.click('#startMatch');
  await host.waitForFunction(() => window.novaBrawl.state && window.novaBrawl.state.phase === 'fight', null, { timeout: 20_000 });
  await iphone.waitForSelector('#pad:not([hidden])');
  await android.waitForSelector('#pad:not([hidden])');
  assert.equal(await iphone.textContent('#padTag'), 'P1 · Ana');
  assert.equal(await iphone.textContent('#padPct'), '0%');
  assert.equal(await iphone.isVisible('#rotate'), false, 'no rotate hint in landscape');

  // --- the fighters on the big screen follow the phones
  const anaStart = await fighter(host, 0);
  const maxStart = await fighter(host, 1);
  assert.deepEqual([anaStart.name, anaStart.fighterId, maxStart.name, maxStart.fighterId], ['Ana', 'finance_bro', 'Max_07', 'surfer_girl']);

  await press(iphone, 'right', 500);
  const anaMoved = await fighter(host, 0);
  assert.ok(anaMoved.x > anaStart.x + 40, `Ana walked right: ${anaStart.x} -> ${anaMoved.x}`);
  assert.equal((await fighter(host, 1)).x, maxStart.x, 'Max did not move: inputs go to the right fighter');

  await press(android, 'left', 400);
  assert.ok((await fighter(host, 1)).x < maxStart.x - 30, 'Max walked left');

  // a short tap on Jump
  const jumping = host.waitForFunction(() => window.novaBrawl.state.fighters[1].y < 560, null, { timeout: 3000 });
  await press(android, 'jump', 40);
  await jumping;

  // Special starts its cooldown, and the phone shows it
  await press(iphone, 'special', 60);
  await host.waitForFunction(() => window.novaBrawl.state.fighters[0].cooldown > 0);
  await iphone.waitForFunction(() => !document.querySelector('.key.special').classList.contains('ready'));

  // --- the joystick mode produces the same inputs
  await android.click('#modeToggle');
  assert.equal(await android.isVisible('#stickZone'), true);
  const before = (await fighter(host, 1)).x;
  const zone = await android.locator('#stickZone').boundingBox();
  const start = { pointerId: 9, pointerType: 'touch', isPrimary: true, bubbles: true, clientX: zone.x + zone.width / 2, clientY: zone.y + zone.height / 2 };
  await android.dispatchEvent('#stickZone', 'pointerdown', start);
  await android.dispatchEvent('#stickZone', 'pointermove', { ...start, clientX: start.clientX + 60 });
  await android.waitForTimeout(450);
  await android.dispatchEvent('#stickZone', 'pointerup', { ...start, clientX: start.clientX + 60 });
  assert.ok((await fighter(host, 1)).x > before + 30, 'the joystick moved Max right');
  // the choice is remembered on the phone
  assert.equal(await android.evaluate(() => localStorage.getItem('nb_mode')), 'stick');

  // --- a phone that reloads (or was locked) is logged in again by itself and gets its pad back
  await iphone.reload();
  await iphone.waitForSelector('#pad:not([hidden])', { timeout: 10_000 });
  assert.equal(await iphone.textContent('#padTag'), 'P1 · Ana');
  const beforeRejoin = (await fighter(host, 0)).x;
  await press(iphone, 'left', 400);
  assert.ok((await fighter(host, 0)).x < beforeRejoin - 30, 'Ana is back in control after the reload');

  // --- a thumb that stays on a direction through a KO keeps working after the respawn
  const right = await iphone.locator('.key[data-b="right"]').boundingBox();
  const held = { pointerId: 11, pointerType: 'touch', isPrimary: true, bubbles: true, clientX: right.x + right.width / 2, clientY: right.y + right.height / 2 };
  await iphone.dispatchEvent('.key[data-b="right"]', 'pointerdown', held);
  await host.evaluate(() => { window.novaBrawl.state.fighters[0].x = -1000; });
  await iphone.waitForFunction(() => !document.getElementById('overlay').hidden);
  assert.match(await iphone.textContent('#overlayText'), /2 lives left/);
  await host.waitForFunction(() => window.novaBrawl.state.fighters[0].state === 'alive', null, { timeout: 8000 });
  await iphone.waitForFunction(() => document.getElementById('overlay').hidden);
  await host.waitForFunction(() => window.novaBrawl.state.fighters[0].x > 700, null, { timeout: 5000 }); // respawns at 640 and walks on
  await iphone.dispatchEvent('.key[data-b="right"]', 'pointerup', held);
  assert.equal(await iphone.textContent('#padHearts'), '♥♥♡');

  // --- pause is only on the big screen; the phones are told
  await host.keyboard.press('Escape');
  await host.waitForSelector('#pause:not([hidden])');
  await iphone.waitForFunction(() => document.getElementById('overlayTitle').textContent === 'Paused');
  await host.click('#resume');
  await iphone.waitForFunction(() => document.getElementById('overlay').hidden);

  assert.deepEqual(problems, [], 'no page logged an error or loaded a broken file');
});
