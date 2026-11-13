// Browser smoke test: the real pages in a real browser.
// One host page, one emulated iPhone and one emulated Android phone register,
// pick fighters, ready up and play. The test checks what a player would notice:
// the fighters on the big screen follow the phones, a hit shows up on the victim's
// phone, the picture is really drawn, and no page logs an error.
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

  // Every console error, page crash and failed request of every page ends up here, from the first load on.
  const problems = [];
  const watch = (page, name) => {
    page.on('console', (m) => { if (m.type() === 'error') problems.push(`${name} console: ${m.text()}`); });
    page.on('pageerror', (e) => problems.push(`${name} crashed: ${e.message}`));
    page.on('response', (r) => { if (r.status() >= 400) problems.push(`${name} got ${r.status()} for ${new URL(r.url()).pathname}`); });
  };
  const phone = async (device, name) => {
    const d = devices[device];
    const context = await browser.newContext({ userAgent: d.userAgent, viewport: d.viewport, deviceScaleFactor: d.deviceScaleFactor, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    watch(page, name);
    return page;
  };
  const landscape = (page) => { const v = page.viewportSize(); return page.setViewportSize({ width: Math.max(v.width, v.height), height: Math.min(v.width, v.height) }); };
  const portrait = (page) => { const v = page.viewportSize(); return page.setViewportSize({ width: Math.min(v.width, v.height), height: Math.max(v.width, v.height) }); };

  // A finger on the pad. Directions are a thumb on the joystick (the only control, D-133):
  // it lands in the middle of the joystick zone and is pushed 50 px that way.
  // Attack, Jump and Special are buttons. First make sure a finger could really reach
  // it: the button (or the joystick zone) must be the topmost element at that point.
  let nextPointer = 1;
  const PUSH = { left: [-50, 0], right: [50, 0], up: [0, -50], down: [0, 50] };
  const finger = async (page, button) => {
    if (PUSH[button]) {
      const zone = await page.locator('#stickZone').boundingBox();
      const at = { x: zone.x + zone.width / 2, y: zone.y + zone.height / 2 };
      const reachable = await page.evaluate(([x, y]) => {
        const el = document.elementFromPoint(x, y);
        return Boolean(el && el.closest('#stickZone'));
      }, [at.x, at.y]);
      assert.ok(reachable, 'the joystick can be touched');
      const event = { pointerId: nextPointer++, pointerType: 'touch', isPrimary: true, bubbles: true, clientX: at.x, clientY: at.y };
      const pushed = { ...event, clientX: at.x + PUSH[button][0], clientY: at.y + PUSH[button][1] };
      return {
        down: async () => {
          await page.dispatchEvent('#stickZone', 'pointerdown', event);
          await page.dispatchEvent('#stickZone', 'pointermove', pushed);
        },
        up: () => page.dispatchEvent('#stickZone', 'pointerup', pushed),
      };
    }
    const box = await page.locator(`.key[data-b="${button}"]`).boundingBox();
    const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const reachable = await page.evaluate(([x, y, b]) => {
      const el = document.elementFromPoint(x, y);
      const key = el && el.closest('.key');
      return Boolean(key && key.dataset.b === b);
    }, [at.x, at.y, button]);
    assert.ok(reachable, `the ${button} button can be touched`);
    const event = { pointerId: nextPointer++, pointerType: 'touch', isPrimary: true, bubbles: true, clientX: at.x, clientY: at.y };
    const selector = `.key[data-b="${button}"]`;
    return { down: () => page.dispatchEvent(selector, 'pointerdown', event), up: () => page.dispatchEvent(selector, 'pointerup', event) };
  };
  const tap = async (page, button, ms = 50) => {
    const f = await finger(page, button);
    await f.down();
    await page.waitForTimeout(ms);
    await f.up();
  };
  const fighter = (host, slot) => host.evaluate((s) => {
    const f = window.novaBrawl.state.fighters.find((x) => x.slot === s);
    return { x: f.x, y: f.y, fighterId: f.fighterId, name: f.name, cooldown: f.cooldown, onGround: f.onGround, percent: f.percent };
  }, slot);
  const standsStill = async (host, slot) => {
    await host.waitForFunction((s) => {
      const f = window.novaBrawl.state.fighters.find((x) => x.slot === s);
      return f.onGround && Math.abs(f.vx) < 0.01;
    }, slot, { timeout: 5000 });
  };

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
  await host.waitForFunction(() => { const img = document.getElementById('qr'); return img.complete && img.naturalWidth > 0; });

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
  await iphone.waitForFunction(() => /too short/.test(document.getElementById('tagError').textContent));
  await iphone.fill('#tagInput', 'Ana');
  await iphone.fill('#pin2Input', '9999');
  await iphone.click('#authSubmit');
  await iphone.waitForFunction(() => /do not match/.test(document.getElementById('pin2Error').textContent));
  assert.equal(store.players.size, 0, 'nothing was registered by the two wrong attempts');
  await iphone.fill('#pin2Input', '1234');
  await iphone.click('#authSubmit');
  await iphone.waitForSelector('#select:not([hidden])');
  assert.equal(await iphone.textContent('#selectTag'), 'P1 · Ana');
  assert.equal(store.players.size, 1);

  // --- an Android phone types the address and the code by hand
  const android = await phone('Pixel 7', 'android');
  await android.goto(`${base}/play`);
  await android.fill('#roomInput', 'ZZZZ');
  await android.fill('#tagInput', 'Max_07');
  await android.fill('#pinInput', '4321');
  await android.fill('#pin2Input', '4321');
  await android.click('#authSubmit');
  await android.waitForFunction(() => /Room not found/.test(document.getElementById('roomError').textContent));
  assert.equal(await android.isVisible('#auth'), true);
  await android.fill('#roomInput', code.toLowerCase());
  await android.click('#authSubmit');
  await android.waitForSelector('#select:not([hidden])');
  assert.equal(await android.textContent('#selectTag'), 'P2 · Max_07');
  await host.waitForFunction(() => window.novaBrawl.roster.length === 2);

  // --- a third phone: a taken gamertag, a wrong PIN, and a closed room
  const third = await phone('Pixel 7', 'third');
  await third.goto(`${base}/play?room=${code}`);
  await third.fill('#tagInput', 'ANA');
  await third.fill('#pinInput', '1111');
  await third.fill('#pin2Input', '1111');
  await third.click('#authSubmit');
  await third.waitForFunction(() => /That gamertag is taken\..*I have an account/.test(document.getElementById('tagError').textContent));
  await third.click('#tabLogin');
  assert.equal(await third.isHidden('#pin2Row'), true, 'logging in asks for the PIN once');
  await third.click('#authSubmit');
  await third.waitForFunction(() => /Wrong PIN, 4 tries left\./.test(document.getElementById('pinError').textContent));
  // The host closes the room: a new player cannot get in until it is opened again.
  await host.click('#toggleRoom');
  await host.waitForFunction(() => document.getElementById('toggleRoom').textContent === 'Room closed');
  await third.click('#tabRegister');
  await third.fill('#tagInput', 'Zoe');
  await third.fill('#pin2Input', '1111');
  await third.click('#authSubmit');
  await third.waitForFunction(() => /host closed the room/.test(document.getElementById('noticeText').textContent));
  await host.click('#toggleRoom');
  await host.waitForFunction(() => document.getElementById('toggleRoom').textContent === 'Room open');
  await third.click('#noticeButton'); // "Try again"
  await third.waitForSelector('#select:not([hidden])');
  await host.waitForFunction(() => window.novaBrawl.roster.length === 3);
  await third.click('#leave');
  await host.waitForFunction(() => window.novaBrawl.roster.length === 2);
  await third.close();

  // --- lobby rules: items and hazards off for this match; one ready player is not enough
  await host.click('#toggleItems');
  await host.click('#toggleHazards');
  await iphone.click('#ready');
  await host.waitForFunction(() => window.novaBrawl.roster[0].ready);
  assert.equal(await host.isDisabled('#startMatch'), true, 'one ready player cannot start');
  assert.match(await host.textContent('#startHint'), /Waiting for 1 player to pick a fighter and tap Ready/); // every human must be ready (D-156)
  // the Android phone swipes to the fourth fighter, readies up, changes its mind, readies up again
  await android.evaluate(() => {
    const carousel = document.getElementById('carousel');
    const card = carousel.children[3];
    carousel.scrollTo({ left: card.offsetLeft + card.offsetWidth / 2 - carousel.clientWidth / 2 });
  });
  await android.waitForFunction(() => document.querySelector('#carousel .card.current h3').textContent === 'Surfer Girl');
  await android.click('#ready');
  await host.waitForFunction(() => !document.getElementById('startMatch').disabled);
  await android.click('#ready'); // "Ready! Tap to change"
  await host.waitForFunction(() => document.querySelector('.slot.p2 .state').textContent === 'Not ready yet');
  assert.equal(await host.isDisabled('#startMatch'), true, 'un-readying counts');
  await android.click('#ready');
  await host.waitForFunction(() => window.novaBrawl.roster.every((p) => p.ready));
  assert.deepEqual(await host.evaluate(() => window.novaBrawl.roster.map((p) => [p.gamertag, p.fighter])), [['Ana', 'finance_bro'], ['Max_07', 'surfer_girl']]);
  // the fighters are drawn on the lobby cards (not just an empty canvas)
  const drawn = (page, selector) => page.evaluate((sel) => {
    const canvas = document.querySelector(sel);
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const colours = new Set();
    for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 0) colours.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
    return colours.size;
  }, selector);
  assert.ok(await drawn(host, '.slot.p1 canvas') > 5, 'P1 sprite on the lobby card');
  assert.ok(await drawn(android, '#carousel .card.current canvas') > 5, 'sprite on the phone');

  // --- start on a fixed stage: no vote, the match begins at once; phones turn sideways and become gamepads
  await host.click('#stageButtons button[data-value="campus"]');
  await host.click('#startMatch');
  assert.equal(await host.isVisible('#vote'), false, 'a fixed stage has no vote');
  // the intro comes first; it ends once both phones have pressed Skip
  for (const p of [iphone, android]) {
    await p.waitForSelector('#intro:not([hidden])');
    await p.click('#skip');
  }
  await host.waitForFunction(() => window.novaBrawl.state && window.novaBrawl.state.phase === 'fight', null, { timeout: 20_000 });
  assert.deepEqual(await host.evaluate(() => [window.novaBrawl.state.settings.items, window.novaBrawl.state.settings.hazards]), [false, false], 'the lobby switches reached the match');
  await iphone.waitForSelector('#pad:not([hidden])');
  await android.waitForSelector('#pad:not([hidden])');
  // still upright: the rotate hint covers the pad, and can be skipped for a phone with rotation lock
  assert.equal(await iphone.isVisible('#rotate'), true, 'rotate hint in portrait');
  await iphone.click('#rotateSkip');
  assert.equal(await iphone.isVisible('#rotate'), false);
  await landscape(iphone);
  await landscape(android);
  assert.equal(await android.isVisible('#rotate'), false, 'no rotate hint in landscape');
  assert.equal(await iphone.textContent('#padTag'), 'P1 · Ana');
  assert.equal(await iphone.textContent('#padHearts'), '♥♥♥');

  // --- the picture is really drawn: the stage has many colours, and the place where a fighter stands changes when they leave
  const canvasBox = (x, y) => host.evaluate(([fx, fy]) => {
    const canvas = document.getElementById('stage');
    const k = canvas.width / 1280;
    const data = canvas.getContext('2d').getImageData(Math.round((fx - 40) * k), Math.round((fy - 100) * k), Math.round(80 * k), Math.round(100 * k)).data;
    let sum = 0;
    const colours = new Set();
    for (let i = 0; i < data.length; i += 4) { sum = (sum * 31 + data[i] + data[i + 1] * 3 + data[i + 2] * 7) % 1000000007; colours.add(`${data[i] >> 3},${data[i + 1] >> 3},${data[i + 2] >> 3}`); }
    return { sum, colours: colours.size };
  }, [x, y]);
  const anaStart = await fighter(host, 0);
  const maxStart = await fighter(host, 1);
  assert.deepEqual([anaStart.name, anaStart.fighterId, maxStart.name, maxStart.fighterId], ['Ana', 'finance_bro', 'Max_07', 'surfer_girl']);
  const whole = await host.evaluate(() => {
    const canvas = document.getElementById('stage');
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const colours = new Set();
    for (let i = 0; i < data.length; i += 4 * 97) colours.add(`${data[i] >> 3},${data[i + 1] >> 3},${data[i + 2] >> 3}`);
    return colours.size;
  });
  assert.ok(whole > 200, `the stage is drawn (${whole} colours in a sparse sample)`);
  const withAna = await canvasBox(anaStart.x, anaStart.y);
  assert.ok(withAna.colours > 20, 'a fighter is drawn where Ana stands');

  // --- Ana walks over to Max: the fighter follows the phone, and stops when the thumb lifts
  const right = await finger(iphone, 'right');
  await right.down();
  await host.waitForFunction(() => { const [a, b] = window.novaBrawl.state.fighters; return b.x - a.x < 75; }, null, { timeout: 8000 });
  assert.equal(await iphone.isVisible('#stickKnob'), true, 'the joystick shows under the thumb');
  await right.up();
  assert.equal(await iphone.isVisible('#stickKnob'), false, 'released');
  assert.equal(await iphone.evaluate(() => document.querySelector('.key.down')), null, 'no button is lit');
  await standsStill(host, 0);
  const anaNear = await fighter(host, 0);
  assert.ok(anaNear.x > anaStart.x + 300, `Ana walked right: ${anaStart.x} -> ${anaNear.x}`);
  assert.equal((await fighter(host, 1)).x, maxStart.x, 'Max did not move: inputs go to the right fighter');
  const withoutAna = await canvasBox(anaStart.x, anaStart.y);
  assert.notEqual(withoutAna.sum, withAna.sum, 'the picture changed where Ana used to stand');

  // --- a real hit: Attack on Ana's phone, damage on Max's phone
  assert.equal(await android.textContent('#padPct'), '0%');
  await tap(iphone, 'attack');
  await host.waitForFunction(() => window.novaBrawl.state.fighters[1].percent === 8, null, { timeout: 3000 });
  await android.waitForFunction(() => document.getElementById('padPct').textContent === '8%');
  assert.equal(await iphone.textContent('#padPct'), '0%', "only the victim's phone shows the damage");
  await standsStill(host, 1);

  // --- a held button stays held: the phone repeats its state, so the host does not let go after 1.5 s of silence
  const up = await finger(iphone, 'up');
  await up.down();
  await host.waitForTimeout(2300);
  assert.equal(await host.evaluate(() => window.novaBrawl.state.fighters[0].aimUp), true, 'still looking up after 2.3 s');
  await up.up();
  await host.waitForFunction(() => window.novaBrawl.state.fighters[0].aimUp === false);
  const down = await finger(iphone, 'down');
  await down.down();
  await host.waitForFunction(() => window.novaBrawl.state.fighters[0].lastInput.down === true);
  await down.up();

  // --- Max walks left, past Ana and out of reach of her special, and jumps
  const left = await finger(android, 'left');
  await left.down();
  await host.waitForFunction(() => { const [a, b] = window.novaBrawl.state.fighters; return b.x < a.x - 280; }, null, { timeout: 8000 });
  await left.up();
  await standsStill(host, 1);
  const maxGround = await fighter(host, 1);
  const jumping = host.waitForFunction((y) => window.novaBrawl.state.fighters[1].y < y - 40, maxGround.y, { timeout: 3000 });
  await tap(android, 'jump', 40); // a short tap
  await jumping;
  await standsStill(host, 1);

  // --- Special: ready at first, then the cooldown shows on the phone and runs down
  await iphone.waitForFunction(() => document.querySelector('.key.special').classList.contains('ready'));
  await tap(iphone, 'special', 60);
  await host.waitForFunction(() => window.novaBrawl.state.fighters[0].cooldown > 0);
  await iphone.waitForFunction(() => !document.querySelector('.key.special').classList.contains('ready'));
  const strip = () => iphone.evaluate(() => new DOMMatrix(getComputedStyle(document.getElementById('cooldown')).transform).a);
  const early = await strip();
  assert.ok(early < 0.5, `the strip starts nearly empty (${early})`);
  await iphone.waitForTimeout(700);
  assert.ok(await strip() > early + 0.05, 'and fills up again');

  // --- the joystick is the only control: no D-pad, no mode toggle, nothing stored
  assert.equal(await android.isVisible('#stickZone'), true);
  assert.equal(await android.locator('#dpad, #modeToggle').count(), 0);
  await standsStill(host, 1);
  const before = (await fighter(host, 1)).x;
  const zone = await android.locator('#stickZone').boundingBox();
  const start = { pointerId: nextPointer++, pointerType: 'touch', isPrimary: true, bubbles: true, clientX: zone.x + zone.width / 2, clientY: zone.y + zone.height / 2 };
  await android.dispatchEvent('#stickZone', 'pointerdown', start);
  await android.dispatchEvent('#stickZone', 'pointermove', { ...start, clientX: start.clientX + 8 }); // inside the dead zone: nothing
  await android.waitForTimeout(250);
  assert.equal((await fighter(host, 1)).x, before, 'a resting thumb does not move the fighter');
  await android.dispatchEvent('#stickZone', 'pointermove', { ...start, clientX: start.clientX + 60 });
  await host.waitForFunction((x) => window.novaBrawl.state.fighters[1].x > x + 40, before, { timeout: 5000 });
  await android.dispatchEvent('#stickZone', 'pointerup', { ...start, clientX: start.clientX + 60 });
  await standsStill(host, 1);
  assert.equal(await android.evaluate(() => localStorage.getItem('nb_mode')), null);

  // --- two fingers at once: hold a direction with one thumb, tap Jump with the other
  await standsStill(host, 0);
  const twoFingers = await fighter(host, 0);
  const thumb = await finger(iphone, 'left');
  await thumb.down();
  await tap(iphone, 'jump', 40);
  await host.waitForFunction((y) => window.novaBrawl.state.fighters[0].y < y - 40, twoFingers.y, { timeout: 3000 }); // it jumped ...
  await host.waitForFunction((x) => window.novaBrawl.state.fighters[0].x < x - 60, twoFingers.x, { timeout: 3000 }); // ... while still running left
  await thumb.up();
  await standsStill(host, 0);

  // --- a thumb that stays on a direction through a KO keeps working after the respawn
  const held = await finger(iphone, 'right');
  await held.down();
  await host.evaluate(() => { window.novaBrawl.state.fighters[0].x = -1000; });
  await iphone.waitForFunction(() => !document.getElementById('overlay').hidden);
  assert.match(await iphone.textContent('#overlayText'), /2 lives left/);
  await host.waitForFunction(() => window.novaBrawl.state.fighters[0].state === 'alive', null, { timeout: 8000 });
  await iphone.waitForFunction(() => document.getElementById('overlay').hidden);
  await host.waitForFunction(() => window.novaBrawl.state.fighters[0].x > 700, null, { timeout: 5000 }); // respawns at 640 and walks on
  await held.up();
  assert.equal(await iphone.textContent('#padHearts'), '♥♥♡');

  // --- phones that reload (or were locked) are logged in again by themselves and get their pad back
  await iphone.reload();
  await iphone.waitForSelector('#pad:not([hidden])', { timeout: 10_000 });
  assert.equal(await iphone.textContent('#padTag'), 'P1 · Ana');
  await standsStill(host, 0);
  const beforeRejoin = (await fighter(host, 0)).x;
  const back = await finger(iphone, 'left');
  await back.down();
  await host.waitForFunction((x) => window.novaBrawl.state.fighters[0].x < x - 30, beforeRejoin, { timeout: 5000 });
  await back.up();
  await android.reload();
  await android.waitForSelector('#pad:not([hidden])', { timeout: 10_000 });
  assert.equal(await android.isVisible('#stickZone'), true, 'the joystick is there after a reload');
  await android.waitForFunction(() => document.getElementById('padPct').textContent === '8%');

  // --- a phone whose connection drops (not a reload) comes back by itself, and a thumb that
  // stayed on the joystick the whole time steers again without being lifted
  await standsStill(host, 1);
  const zone2 = await android.locator('#stickZone').boundingBox();
  const stay = { pointerId: nextPointer++, pointerType: 'touch', isPrimary: true, bubbles: true, clientX: zone2.x + zone2.width / 2, clientY: zone2.y + zone2.height / 2 };
  await android.dispatchEvent('#stickZone', 'pointerdown', stay);
  await android.dispatchEvent('#stickZone', 'pointermove', { ...stay, clientX: stay.clientX - 50 });
  const beforeDrop = (await fighter(host, 1)).x;
  await host.waitForFunction((x) => window.novaBrawl.state.fighters[1].x < x - 10, beforeDrop, { timeout: 5000 });
  app.rooms.rooms.get(code).slots[1].conn.ws.terminate();
  await host.waitForFunction(() => window.novaBrawl.roster[1].connected === false);
  await android.waitForFunction(() => /Connection lost/.test(document.getElementById('offline').textContent) && !document.getElementById('offline').hidden);
  await host.waitForFunction(() => window.novaBrawl.roster[1].connected === true, null, { timeout: 10_000 });
  await android.waitForFunction(() => document.getElementById('offline').hidden);
  await standsStill(host, 1).catch(() => {}); // it may already be running again
  const afterDrop = (await fighter(host, 1)).x;
  await host.waitForFunction((x) => window.novaBrawl.state.fighters[1].x < x - 30, afterDrop, { timeout: 5000 });
  await android.dispatchEvent('#stickZone', 'pointerup', { ...stay, clientX: stay.clientX - 50 });
  await standsStill(host, 1);

  // --- a hazard warning whose end never arrives (the big screen was offline for a moment) does not stay for ever
  app.rooms.send(app.rooms.rooms.get(code).slots[0].conn, { t: 'feedback', kind: 'hazardCount', name: 'SEAGULLS OVER THE ROOFS', n: 3 });
  await iphone.waitForFunction(() => !document.getElementById('hazard').hidden && document.getElementById('hazardCount').textContent === '3');
  await iphone.waitForFunction(() => document.getElementById('hazard').hidden, null, { timeout: 4000 });

  // --- pause is only on the big screen: the match really stands still, the phones are told, and it goes on after Resume
  await host.keyboard.press('Escape');
  await host.waitForSelector('#pause:not([hidden])');
  await iphone.waitForFunction(() => document.getElementById('overlayTitle').textContent === 'Paused');
  const frozen = await host.evaluate(() => window.novaBrawl.state.frame);
  await host.waitForTimeout(400);
  assert.equal(await host.evaluate(() => window.novaBrawl.state.frame), frozen, 'no step is taken while paused');
  assert.equal(await host.textContent('#pauseHelp'), 'Press P or Esc to resume. Phones cannot pause.');
  await host.click('#resume');
  await iphone.waitForFunction(() => document.getElementById('overlay').hidden);
  await host.waitForFunction((f) => window.novaBrawl.state.frame > f + 20, frozen);
  // P works the same way as Esc, both ways.
  await host.keyboard.press('KeyP');
  await host.waitForSelector('#pause:not([hidden])');
  await iphone.waitForFunction(() => document.getElementById('overlayTitle').textContent === 'Paused');
  await host.keyboard.press('KeyP');
  await host.waitForSelector('#pause', { state: 'hidden' });
  await iphone.waitForFunction(() => document.getElementById('overlay').hidden);

  // --- nothing went wrong anywhere, from the first page load on. The only complaints allowed are the
  // browser noting the two answers the third phone was meant to get: "taken" (409) and "wrong PIN" (401).
  const expected = (p) => p.startsWith('third ') && /\b(409|401)\b/.test(p);
  assert.ok(problems.some((p) => /third got 409 for \/api\/register/.test(p)), 'the taken gamertag was refused by the server');
  assert.ok(problems.some((p) => /third got 401 for \/api\/login/.test(p)), 'the wrong PIN was refused by the server');
  assert.deepEqual(problems.filter((p) => !expected(p)), [], 'no page logged an error or loaded a broken file');
});
