// Browser test: one whole evening in fast forward.
// Stage vote, three phones, a hazard announcement, a knocked-out player voting
// for the next hazard, the final KO, results with points on the big screen and on
// the phones, a second match, removing a player and logging out.
//
// To keep it short, the test moves fighters out of the screen through the host
// page's debug hook instead of fighting for minutes. Everything that is checked
// (texts, screens, points) is what the players would see.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, devices } from 'playwright';
import { createApp } from '../../server/app.js';
import { MemoryStore } from '../../server/store/memory.js';

const CONFIG = { port: 0, trustProxy: false, useSheets: false, pinPepper: 'browser-test-pepper-0123', sessionSecret: 'browser-test-secret-0123', warnings: [] };

test('a whole match from the stage vote to the results, a second match, removing a player, logging out', async (t) => {
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
  const fight = (host) => host.waitForFunction(() => window.novaBrawl.state && window.novaBrawl.state.phase === 'fight', null, { timeout: 20_000 });
  // Throw one fighter out of the screen (as if launched).
  const knockOut = (host, slot) => host.evaluate((s) => {
    const f = window.novaBrawl.state.fighters.find((x) => x.slot === s);
    f.invincible = 0;
    f.x = -1000;
  }, slot);

  // --- the room
  const host = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  watch(host, 'host');
  await host.goto(`${base}/`);
  await host.click('#openRoom');
  await host.waitForFunction(() => /^[A-Z]{4}$/.test(document.getElementById('roomCode').textContent));
  const code = await text(host, '#roomCode');
  const ana = await phone('iPhone 13', 'iphone');
  const max = await phone('Pixel 7', 'android');
  const troll = await phone('Pixel 7', 'third phone');
  await join(ana, code, 'Ana');
  await join(max, code, 'Max');
  await join(troll, code, 'Troll');
  await host.waitForFunction(() => window.novaBrawl.roster.length === 3);

  // --- the host removes the third player; they cannot come back
  await host.click('.slot.p3 .remove');
  assert.equal(await text(host, '.slot.p3 .remove'), 'Remove?', 'a second click is needed');
  await host.click('.slot.p3 .remove');
  await troll.waitForFunction(() => /removed you/.test(document.getElementById('noticeText').textContent));
  await host.waitForFunction(() => window.novaBrawl.roster.length === 2);
  await troll.click('#noticeButton'); // "Enter another code"
  await troll.fill('#roomInput', code);
  await troll.click('#authSubmit');
  await troll.waitForFunction(() => /removed you/.test(document.getElementById('noticeText').textContent));
  await troll.close();
  const zoe = await phone('Pixel 7', 'third phone');
  await join(zoe, code, 'Zoe');
  await host.waitForFunction(() => window.novaBrawl.roster.length === 3);

  // --- swiping to a fighter shows it on the big screen before Ready
  assert.equal(await text(host, '.slot.p2 .fighter'), 'Choosing…');
  await max.evaluate(() => {
    const carousel = document.getElementById('carousel');
    const card = carousel.children[5];
    carousel.scrollTo({ left: card.offsetLeft + card.offsetWidth / 2 - carousel.clientWidth / 2 });
  });
  await host.waitForFunction(() => document.querySelector('.slot.p2 .fighter').textContent === 'House DJ');
  assert.equal(await text(host, '.slot.p2 .state'), 'Not ready yet');

  // --- Vote is the default stage choice, and the fighter select has no stage buttons any more
  assert.equal(await host.getAttribute('#stageButtons button[data-value="vote"]', 'aria-pressed'), 'true');
  assert.match(await text(host, '#stageButtons button[data-value="vote"]'), /Vote \(default\)/);
  assert.equal(await ana.locator('#stageVote, #stageVoteButtons').count(), 0);

  // --- one life, three phones ready (there are no keyboard players any more)
  await host.click('#lifeButtons button[data-value="1"]');
  assert.equal(await host.locator('#guestMore').count(), 0, 'no keyboard players in the lobby');
  assert.match(await text(host, '.slot.p3 .tag'), /P3 · Zoe/);
  await ana.click('#ready');
  await max.click('#ready');
  await zoe.click('#ready');
  await host.waitForFunction(() => !document.getElementById('startMatch').disabled && /3 players are ready/.test(document.getElementById('startHint').textContent));

  // --- the map vote: Start opens it on the big screen and on every phone
  await host.click('#startMatch');
  await host.waitForSelector('#vote:not([hidden])');
  assert.equal(await host.locator('#voteCards .voteCard').count(), 3);
  assert.match(await text(host, '#voteTimer'), /^(10|9)$/);
  for (const p of [ana, max, zoe]) await p.waitForSelector('#mapvote:not([hidden])');
  assert.equal(await ana.locator('#mapCarousel .card').count(), 3);
  const beachCard = await text(ana, '#mapCarousel .card[data-stage="beach"]');
  for (const words of ['Carcavelos Beach', 'Day', 'Big Wave', 'Seagulls']) assert.ok(beachCard.includes(words), `the beach card shows ${words}`);
  // The preview is the stage art drawn small: many colours, on the phone and on the big screen.
  const colours = (page, selector) => page.waitForFunction((sel) => {
    const canvas = document.querySelector(sel);
    if (!canvas || !canvas.width) return false;
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const seen = new Set();
    for (let i = 0; i < data.length; i += 4 * 7) seen.add(`${data[i] >> 3},${data[i + 1] >> 3},${data[i + 2] >> 3}`);
    return seen.size > 60;
  }, selector, { timeout: 10_000 });
  await colours(ana, '#mapCarousel .card[data-stage="beach"] canvas');
  await colours(host, '#voteCards .voteCard[data-stage="bairro"] canvas');
  const swipeTo = (page, index) => page.evaluate((i) => {
    const carousel = document.getElementById('mapCarousel');
    const card = carousel.children[i];
    carousel.scrollTo({ left: card.offsetLeft + card.offsetWidth / 2 - carousel.clientWidth / 2 });
  }, index);
  const count = (stage) => host.evaluate((s) => document.querySelector(`.voteCard[data-stage="${s}"] .count`).textContent, stage);
  // Ana votes for the campus, then changes her mind: the beach.
  await swipeTo(ana, 0);
  await ana.waitForFunction(() => document.querySelector('#mapCarousel .card.current').dataset.stage === 'campus');
  await ana.click('#voteButton');
  await host.waitForFunction(() => document.querySelector('.voteCard[data-stage="campus"] .count').textContent === '1 vote');
  await swipeTo(ana, 1);
  await ana.waitForFunction(() => document.querySelector('#mapCarousel .card.current').dataset.stage === 'beach');
  await ana.click('#voteButton');
  await host.waitForFunction(() => document.querySelector('.voteCard[data-stage="beach"] .count').textContent === '1 vote');
  assert.equal(await count('campus'), '0 votes', 'a second vote replaces the first');
  assert.match(await text(ana, '#voteHint'), /Carcavelos Beach/);
  await swipeTo(max, 1);
  await max.waitForFunction(() => document.querySelector('#mapCarousel .card.current').dataset.stage === 'beach');
  await max.click('#voteButton');
  await host.waitForFunction(() => document.querySelector('.voteCard[data-stage="beach"] .count').textContent === '2 votes');
  assert.equal(await host.locator('.voteCard[data-stage="beach"] .faces canvas').count(), 2, "the voters' faces");
  // Zoe votes last: everyone has voted, so the vote ends at once and the beach wins 2 to 1.
  await swipeTo(zoe, 2);
  await zoe.waitForFunction(() => document.querySelector('#mapCarousel .card.current').dataset.stage === 'bairro');
  await zoe.click('#voteButton');
  await host.waitForSelector('.voteCard.winner[data-stage="beach"]');
  await zoe.waitForFunction(() => /Carcavelos Beach wins/.test(document.getElementById('voteHint').textContent));
  await fight(host);
  const setup = await host.evaluate(() => ({ stage: window.novaBrawl.state.stage.id, lives: window.novaBrawl.state.settings.lives, names: window.novaBrawl.state.fighters.map((f) => f.name) }));
  assert.deepEqual(setup, { stage: 'beach', lives: 1, names: ['Ana', 'Max', 'Zoe'] });
  await ana.waitForSelector('#pad:not([hidden])');

  // --- keys on the laptop move nobody: W A S D was a keyboard player's
  const startX = await host.evaluate(() => window.novaBrawl.state.fighters[2].x);
  await host.keyboard.down('KeyD');
  await host.waitForTimeout(350);
  await host.keyboard.up('KeyD');
  assert.equal(await host.evaluate(() => window.novaBrawl.state.fighters[2].x), startX, 'Zoe stands still');

  // --- a hazard is announced on the big screen and on every phone: name, then 3, 2, 1
  await host.evaluate(() => {
    for (const f of window.novaBrawl.state.fighters) f.invincible = 100000; // nobody gets hurt during this check
    window.novaBrawl.state.hazard.timer = 1;
  });
  await host.waitForFunction(() => window.novaBrawl.state.hazard.phase === 'warn');
  const hazardName = await host.evaluate(() => window.novaBrawl.state.hazard.name);
  assert.match(hazardName, /^(BIG WAVE|SEAGULLS OVER THE (SAND|ROOFS))$/);
  for (const p of [ana, max]) {
    await p.waitForFunction((name) => !document.getElementById('hazard').hidden && document.getElementById('hazardName').textContent === name, hazardName);
    await p.waitForFunction(() => ['3', '2', '1'].includes(document.getElementById('hazardCount').textContent));
  }
  await host.waitForFunction(() => window.novaBrawl.state.hazard.phase === 'idle', null, { timeout: 20_000 });
  await ana.waitForFunction(() => document.getElementById('hazard').hidden);

  // --- Max is knocked out: with one life that is an elimination, and he gets the hazard vote
  await knockOut(host, 1);
  await max.waitForFunction(() => document.getElementById('overlayTitle').textContent === "You're out!");
  assert.match(await text(max, '#overlayText'), /Grab a coffee and watch\. Vote for the next hazard/);
  assert.equal(await max.locator('#hazardVote button').count(), 2);
  await max.click('#hazardVote button:nth-child(1)');
  await host.waitForFunction(() => window.novaBrawl.state.hazardVotes[1] === 'wave');
  assert.equal(await ana.isHidden('#overlay'), true, 'Ana is still playing');

  // --- Zoe goes too: final KO, then the results
  await knockOut(host, 2);
  await host.waitForSelector('#results:not([hidden])', { timeout: 15_000 });
  assert.equal(await text(host, '#winnerLine'), 'Ana graduates with honours!');
  await host.waitForFunction(() => document.getElementById('resultNote').textContent === 'Result saved.');
  const podium = await host.evaluate(() => [...document.querySelectorAll('#podium .place')].map((p) => [p.querySelector('.tag').textContent, p.querySelector('.n').textContent, p.querySelector('.pts').textContent]));
  assert.deepEqual(podium, [['P3 · Zoe', '2nd', '+60 points'], ['P1 · Ana', '1st', '+100 points'], ['P2 · Max', '3rd', '+40 points']]);
  assert.match(await host.evaluate(() => document.querySelector('#podium .place.first .ach').textContent), /First Win/);
  assert.deepEqual(await host.evaluate(() => [...document.querySelectorAll('#resultBoard li')].map((li) => li.textContent)), ['1.Ana100 pts', '2.Zoe60 pts', '3.Max40 pts']);
  assert.equal(await host.locator('#results button').count(), 1, 'only "Back to the lobby": no rematch button');

  // --- each phone shows its own result
  await ana.waitForFunction(() => /\+100 points/.test(document.getElementById('resultPoints').textContent));
  assert.equal(await text(ana, '#resultPlace'), 'YOU WIN!');
  assert.match(await text(ana, '#resultAchievements'), /First Win/);
  await max.waitForFunction(() => /\+40 points/.test(document.getElementById('resultPoints').textContent));
  assert.equal(await text(max, '#resultPlace'), '3rd place');
  assert.equal(await text(max, '#resultWinner'), 'Ana graduates with honours!');
  assert.equal(store.matches.size, 1);
  assert.equal(store.players.get('ana').points, 100);

  // --- back to the lobby: everyone readies up again, the leaderboard is there, a second match starts
  await host.click('#backToLobby');
  await host.waitForSelector('#lobby:not([hidden])');
  await host.waitForFunction(() => /Ana/.test(document.getElementById('board').textContent));
  for (const p of [ana, max]) {
    await p.waitForSelector('#select:not([hidden])');
    assert.equal(await text(p, '#ready'), 'Ready!');
  }
  await host.click('#stageButtons button[data-value="bairro"]');
  await zoe.waitForSelector('#select:not([hidden])');
  await zoe.click('#leave');
  await host.waitForFunction(() => window.novaBrawl.roster.length === 2);
  await ana.click('#ready');
  await max.click('#ready');
  await host.waitForFunction(() => !document.getElementById('startMatch').disabled);
  await host.click('#startMatch');
  await fight(host);
  assert.equal(await host.evaluate(() => window.novaBrawl.state.stage.id), 'bairro');
  assert.equal(await max.isHidden('#overlay'), true, 'nothing of the last match is left on the phone');
  assert.equal(await text(max, '#padPct'), '0%');

  // --- the host ends the match from the pause screen; nothing is stored for it
  await host.keyboard.press('Escape');
  await host.click('#quitMatch');
  await host.waitForSelector('#lobby:not([hidden])');
  await ana.waitForSelector('#select:not([hidden])');
  assert.equal(store.matches.size, 1);

  // --- logging out on the phone leaves the room and asks for the PIN next time
  await ana.click('#logout');
  await ana.waitForSelector('#auth:not([hidden])');
  await host.waitForFunction(() => window.novaBrawl.roster.length === 1);
  assert.equal(await ana.evaluate(() => localStorage.getItem('nb_token')), null);
  await ana.reload();
  await ana.waitForSelector('#auth:not([hidden])');
  assert.equal(await ana.isVisible('#pinInput'), true);

  assert.deepEqual(problems, [], 'no page logged an error or loaded a broken file');
});
