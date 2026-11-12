// Browser test: bots (GAME_SPEC §5a). One phone and bots play a whole match to its end;
// then a human takes a bot's place and gives it back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, devices } from 'playwright';
import { createApp } from '../../server/app.js';
import { MemoryStore } from '../../server/store/memory.js';

const CONFIG = { port: 0, trustProxy: false, useSheets: false, pinPepper: 'browser-test-pepper-0123', sessionSecret: 'browser-test-secret-0123', warnings: [] };

test('one phone and bots: add, remove, a whole match to its end, practice result, then the bench', async (t) => {
  const store = new MemoryStore();
  const app = createApp({ config: CONFIG, store });
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
  const phone = async (device, name) => {
    const d = devices[device];
    const context = await browser.newContext({ userAgent: d.userAgent, viewport: { width: d.viewport.height, height: d.viewport.width }, deviceScaleFactor: d.deviceScaleFactor, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    watch(page, name);
    return page;
  };
  const join = async (page, code, gamertag) => {
    await page.goto(`${base}/play?room=${code}`);
    await page.fill('#tagInput', gamertag);
    await page.fill('#pinInput', '2468');
    await page.fill('#pin2Input', '2468');
    await page.click('#authSubmit');
    await page.waitForSelector('#select:not([hidden])');
  };
  const text = (page, selector) => page.textContent(selector);
  const botNames = (host) => host.evaluate(() => window.novaBrawl.bots.map((b) => `${b.slot}:${b.name}`));

  // --- the room and one phone
  const host = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  watch(host, 'host');
  await host.goto(`${base}/`);
  await host.click('#openRoom');
  await host.waitForFunction(() => /^[A-Z]{4}$/.test(document.getElementById('roomCode').textContent));
  const code = await text(host, '#roomCode');
  const ana = await phone('iPhone 13', 'iphone');
  await join(ana, code, 'Ana');
  await ana.click('#ready');
  await host.waitForFunction(() => window.novaBrawl.roster.length === 1 && window.novaBrawl.roster[0].ready);
  assert.equal(await host.isDisabled('#startMatch'), true, 'alone, nobody to fight');
  assert.equal(await host.isDisabled('#removeBot'), true, 'no bot to remove');
  assert.match(await text(host, '#startHint'), /Add a bot/);

  // --- the host adds two bots and removes one
  await host.click('#addBot');
  await host.waitForFunction(() => window.novaBrawl.bots.length === 1);
  await host.click('#addBot');
  await host.waitForFunction(() => window.novaBrawl.bots.length === 2);
  assert.deepEqual(await botNames(host), ['1:Freshman', '2:Intern']);
  assert.match(await text(host, '.slot.p2 .tag'), /P2 · Freshman\s*BOT/);
  assert.equal(await text(host, '.slot.p2 .state'), 'Ready!');
  // A new bot's fighter is not the human's.
  const anaFighter = await host.evaluate(() => window.novaBrawl.roster[0].fighter);
  assert.ok((await host.evaluate(() => window.novaBrawl.bots.map((b) => b.fighter))).every((f) => f !== anaFighter));
  await host.click('#removeBot');
  await host.waitForFunction(() => window.novaBrawl.bots.length === 1);
  assert.deepEqual(await botNames(host), ['1:Freshman']);
  // A click on the bot's card switches its fighter.
  const before = await text(host, '.slot.p2 .fighter');
  await host.click('.slot.p2');
  await host.waitForFunction((b) => document.querySelector('.slot.p2 .fighter').textContent !== b, before);
  assert.match(await text(host, '#startHint'), /1 player and 1 bot are ready/);

  // --- a fixed stage, one life: the match runs to its end
  await host.click('#stageButtons button[data-value="campus"]');
  await host.click('#lifeButtons button[data-value="1"]');
  await host.click('#startMatch');
  await host.waitForSelector('#intro:not([hidden])');
  assert.equal(await host.locator('#introPips .pip').count(), 1, 'no Skip pip for the bot');
  await ana.waitForSelector('#intro:not([hidden])');
  await ana.click('#skip'); // the intro does not wait for the bot
  await host.waitForFunction(() => window.novaBrawl.state && window.novaBrawl.state.phase === 'fight', null, { timeout: 20_000 });
  const fighters = await host.evaluate(() => window.novaBrawl.state.fighters.map((f) => [f.slot, f.name, f.bot]));
  assert.deepEqual(fighters, [[0, 'Ana', false], [1, 'Freshman', true]]);
  assert.equal(await host.evaluate(() => window.novaBrawl.takesInput(1)), false, 'no phone steers the bot');
  // The bot moves by itself.
  const startX = await host.evaluate(() => window.novaBrawl.state.fighters[1].x);
  await host.waitForFunction((x) => Math.abs(window.novaBrawl.state.fighters[1].x - x) > 40, startX, { timeout: 10_000 });
  // Ana stands still; the bot must win (or lose), and the match must end.
  await host.waitForSelector('#results:not([hidden])', { timeout: 90_000 });
  const winner = await host.evaluate(() => window.novaBrawl.state.winner);
  assert.ok(winner === 0 || winner === 1);
  await host.waitForFunction(() => /Practice match/.test(document.getElementById('resultNote').textContent), null, { timeout: 10_000 });
  await host.waitForFunction(() => document.querySelectorAll('#resultCards .stat').length === 2);
  const botCard = await host.evaluate(() => {
    const card = document.querySelector('#resultCards .stat[data-slot="1"]');
    return [card.querySelector('.who').textContent, card.querySelector('.pts').textContent];
  });
  assert.deepEqual(botCard, ['P2 · FreshmanBOT', ''], 'the bot card has the tag and no points');
  await ana.waitForSelector('#results:not([hidden])');
  if (winner === 1) assert.match(await text(ana, '#resultWinner'), /Freshman\s*BOT graduates with honours!/);
  assert.equal(store.matches.size, 0, 'a practice match is not stored');

  // --- back in the lobby the bot is still there
  await host.waitForSelector('#backToLobby:not([hidden])', { timeout: 10_000 });
  await host.click('#backToLobby');
  await host.waitForSelector('#lobby:not([hidden])');
  assert.deepEqual(await botNames(host), ['1:Freshman']);
  assert.match(await text(host, '.slot.p2 .tag'), /Freshman/);

  // --- one human and three bots: a second phone sends the last bot to the bench, and gets it back on leaving
  await host.click('#addBot');
  await host.waitForFunction(() => window.novaBrawl.bots.length === 2);
  await host.click('#addBot');
  await host.waitForFunction(() => window.novaBrawl.bots.length === 3);
  assert.equal(await host.isDisabled('#addBot'), true, 'the room is full');
  const max = await phone('Pixel 7', 'android');
  await join(max, code, 'Max');
  await host.waitForFunction(() => window.novaBrawl.roster.length === 2 && window.novaBrawl.bots.length === 2);
  assert.deepEqual(await botNames(host), ['2:Freshman', '3:Intern']);
  assert.match(await text(host, '.slot.p2 .tag'), /Max/);
  assert.equal(await host.isDisabled('#startMatch'), true, 'Max has not picked a fighter yet');
  await max.click('#leave');
  await host.waitForFunction(() => window.novaBrawl.roster.length === 1 && window.novaBrawl.bots.length === 3);
  assert.deepEqual(await botNames(host), ['1:Freshman', '2:Intern', '3:Erasmus']);
  await host.waitForSelector('.slot.p4.joined');

  assert.deepEqual(problems, [], 'no page logged an error or loaded a broken file');
});
