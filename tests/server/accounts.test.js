// Accounts: registering, logging in, and every way those are refused.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../helpers/server.js';
import { createToken, verifyToken, hashPin, verifyPin, newSalt, LoginGuard, Sessions } from '../../server/accounts.js';
import { gamertagProblem, pinProblem } from '../../server/validate.js';
import { LIMITS } from '../../server/config.js';

const reg = (s, gamertag, pin = '1234', pin2 = pin) => s.api('/api/register', { gamertag, pin, pin2 });
const login = (s, gamertag, pin = '1234') => s.api('/api/login', { gamertag, pin });

test('register with a valid gamertag and PIN, then log in', async (t) => {
  const s = await startServer(t);
  const created = await reg(s, 'Ana_07');
  assert.equal(created.status, 201);
  assert.equal(created.data.gamertag, 'Ana_07');
  assert.ok(verifyToken(created.data.token, 'test-session-secret-0123456789'));
  const back = await login(s, 'Ana_07');
  assert.equal(back.status, 200);
  assert.equal(back.data.gamertag, 'Ana_07');
  // gamertags are not case sensitive when logging in
  assert.equal((await login(s, 'ana_07')).status, 200);
});

test('the shortest and longest allowed gamertags work', async (t) => {
  const s = await startServer(t);
  assert.equal((await reg(s, 'abc')).status, 201);
  assert.equal((await reg(s, 'A2345678901_')).status, 201);
});

for (const [name, gamertag, expected] of [
  ['too short', 'ab', /too short/],
  ['empty', '', /too short/],
  ['too long', 'abcdefghijklm', /too long/],
  ['with a space', 'ana maria', /only letters/],
  ['with a dash', 'ana-maria', /only letters/],
  ['with an accent', 'anaçai', /only letters/],
  ['with HTML', '<b>ana</b>', /only letters/],
  ['starting with =', '=SUM(A1)', /only letters/],
  ['starting with = and otherwise only letters', '=abc', /only letters/],
  ['made of a formula name', '=SUM', /only letters/],
  ['ending with =', 'abc=', /only letters/],
  ['starting with +', '+1234', /only letters/],
  ['starting with @', '@ana', /only letters/],
  ['starting with -', '-ana', /only letters/],
  ['not a string', 12345, /Enter a gamertag/],
  ['missing', undefined, /Enter a gamertag/],
]) {
  test(`register is refused for a gamertag ${name}`, async (t) => {
    const s = await startServer(t);
    const res = await reg(s, gamertag);
    assert.equal(res.status, 400);
    assert.match(res.data.error, expected);
    assert.equal(res.data.field, 'gamertag');
    assert.equal(s.store.players.size, 0, 'nothing was stored');
  });
}

test('a gamertag that only differs in upper and lower case is taken', async (t) => {
  const s = await startServer(t);
  assert.equal((await reg(s, 'SurfQueen')).status, 201);
  for (const copy of ['surfqueen', 'SURFQUEEN', 'SurfQueen']) {
    const res = await reg(s, copy, '9999');
    assert.equal(res.status, 409);
    assert.equal(res.data.error, 'That gamertag is taken.');
  }
  assert.equal(s.store.players.size, 1);
  assert.equal((await login(s, 'SurfQueen', '9999')).status, 401, 'the PIN of the first registration still counts');
});

for (const [name, pin, pin2, expected, field] of [
  ['do not match', '1234', '1235', /do not match/, 'pin2'],
  ['have three digits', '123', '123', /exactly 4 digits/, 'pin'],
  ['have five digits', '12345', '12345', /exactly 4 digits/, 'pin'],
  ['contain a letter', '12a4', '12a4', /exactly 4 digits/, 'pin'],
  ['are numbers, not text', 1234, 1234, /exactly 4 digits/, 'pin'],
  ['are empty', '', '', /exactly 4 digits/, 'pin'],
]) {
  test(`register is refused when the PINs ${name}`, async (t) => {
    const s = await startServer(t);
    const res = await reg(s, 'Tester', pin, pin2);
    assert.equal(res.status, 400);
    assert.match(res.data.error, expected);
    assert.equal(res.data.field, field);
    assert.equal(s.store.players.size, 0);
  });
}

test('the sheet never sees the PIN: only a salt and a hash are stored', async (t) => {
  const s = await startServer(t);
  await reg(s, 'Secret1', '4821');
  await reg(s, 'Secret2', '4821');
  const [a, b] = [...s.store.players.values()];
  assert.deepEqual(Object.keys(a).sort(), ['achievements', 'created_at', 'damage_dealt', 'damage_taken', 'falls', 'gamertag', 'gamertag_lower', 'kos', 'matches', 'pin_hash', 'points', 'salt', 'wins'], 'there is no PIN field');
  assert.match(a.pin_hash, /^[0-9a-f]{64}$/);
  assert.match(a.salt, /^[0-9a-f]{32}$/);
  // The hash is made with the server's secret pepper: without it, the same PIN and salt give another hash.
  assert.equal(a.pin_hash, await hashPin('4821', a.salt, 'test-pepper-0123456789'));
  assert.notEqual(a.pin_hash, await hashPin('4821', a.salt, ''));
  assert.notEqual(a.salt, b.salt, 'every player has their own salt');
  assert.notEqual(a.pin_hash, b.pin_hash, 'the same PIN gives different hashes');
});

test('the pepper is part of the hash: the same PIN and salt with another pepper do not match', async () => {
  const salt = newSalt();
  const hash = await hashPin('1234', salt, 'pepper-one');
  assert.equal(await verifyPin('1234', salt, hash, 'pepper-one'), true);
  assert.equal(await verifyPin('1234', salt, hash, 'pepper-two'), false);
  assert.equal(await verifyPin('1235', salt, hash, 'pepper-one'), false);
  assert.equal(await verifyPin('1234', salt, 'not-a-hash', 'pepper-one'), false);
  assert.equal(await verifyPin('1234', 'zz', hash, 'pepper-one'), false);
});

test('login: wrong PIN counts down the tries, then the gamertag is locked for 10 minutes', async (t) => {
  const s = await startServer(t);
  await reg(s, 'Lockme', '1111');
  for (const left of [4, 3, 2, 1]) {
    const res = await login(s, 'Lockme', '0000');
    assert.equal(res.status, 401);
    assert.equal(res.data.triesLeft, left);
    assert.match(res.data.error, new RegExp(`Wrong PIN, ${left} tr(y|ies) left`));
  }
  const fifth = await login(s, 'Lockme', '0000');
  assert.equal(fifth.status, 429);
  assert.match(fifth.data.error, /Too many wrong PINs/);
  assert.equal(fifth.headers.get('retry-after'), '600');
  // Even the right PIN is refused while locked.
  assert.equal((await login(s, 'Lockme', '1111')).status, 429);
  assert.equal((await login(s, 'LOCKME', '1111')).status, 429, 'the lock ignores upper and lower case');
  s.clock.now += LIMITS.loginLockMs - 1000;
  assert.equal((await login(s, 'Lockme', '1111')).status, 429, 'still locked just before 10 minutes');
  s.clock.now += 2000;
  assert.equal((await login(s, 'Lockme', '1111')).status, 200, 'unlocked after 10 minutes');
});

test('login: a correct PIN resets the counter, and old misses fall out of the 10-minute window', async (t) => {
  const s = await startServer(t);
  await reg(s, 'Clumsy', '1111');
  for (let i = 0; i < 4; i++) await login(s, 'Clumsy', '0000');
  assert.equal((await login(s, 'Clumsy', '1111')).status, 200);
  assert.equal((await login(s, 'Clumsy', '0000')).data.triesLeft, 4, 'counter started again');
  for (let i = 0; i < 3; i++) await login(s, 'Clumsy', '0000');
  s.clock.now += LIMITS.loginWindowMs + 1000;
  assert.equal((await login(s, 'Clumsy', '0000')).data.triesLeft, 4, 'the old misses no longer count');
});

test('login: one locked gamertag does not lock another', async (t) => {
  const s = await startServer(t);
  await reg(s, 'Victim', '1111');
  await reg(s, 'Other', '2222');
  for (let i = 0; i < 5; i++) await login(s, 'Victim', '0000');
  assert.equal((await login(s, 'Other', '2222')).status, 200);
});

test('login is refused for an unknown gamertag and for malformed input', async (t) => {
  const s = await startServer(t);
  const unknown = await login(s, 'Nobody');
  assert.equal(unknown.status, 404);
  assert.match(unknown.data.error, /Register first/);
  assert.equal((await login(s, 'x')).status, 400);
  assert.equal((await login(s, 'Nobody', '12')).status, 400);
  assert.equal((await s.api('/api/login', { gamertag: { $ne: null }, pin: '1234' })).status, 400);
});

test('the API refuses bodies that are not JSON, not an object, or too large', async (t) => {
  const s = await startServer(t);
  assert.equal((await s.api('/api/register', '{not json')).status, 400);
  assert.equal((await s.api('/api/register', '[1,2,3]')).status, 400);
  assert.equal((await s.api('/api/register', '"text"')).status, 400);
  for (const size of [1100, 5000, 200_000]) {
    const big = await s.api('/api/register', { gamertag: 'Big', pin: '1234', pin2: '1234', junk: 'x'.repeat(size) });
    assert.equal(big.status, 413, `${size} bytes`);
    assert.equal(big.data.error, 'The request is too large.');
  }
  const form = await fetch(`${s.base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'gamertag=a&pin=1' });
  assert.equal(form.status, 415);
  assert.equal((await fetch(`${s.base}/api/register`)).status, 405, 'GET is not allowed');
  assert.equal(s.store.players.size, 0);
});

test('too many login attempts from one address are slowed down', async (t) => {
  const s = await startServer(t);
  let limited = 0;
  for (let i = 0; i < LIMITS.authPerMinutePerAddress + 5; i++) {
    const res = await login(s, `Nobody${i % 9}`);
    if (res.status === 429) limited += 1;
  }
  assert.equal(limited, 5);
  s.clock.now += 61_000;
  assert.equal((await login(s, 'Nobody1')).status, 404, 'allowed again a minute later');
});

// ---- session tokens ----

test('a session token is accepted for 30 days and refused after that', () => {
  const now = 1_800_000_000_000;
  const token = createToken('Ana', 'sid-1', 'secret', now);
  assert.deepEqual(verifyToken(token, 'secret', now + 1000), { gamertag: 'Ana', sid: 'sid-1', issuedAt: now });
  assert.ok(verifyToken(token, 'secret', now + LIMITS.sessionMs - 1000));
  assert.equal(verifyToken(token, 'secret', now + LIMITS.sessionMs), null, 'expired');
  assert.equal(LIMITS.sessionMs, 30 * 24 * 60 * 60 * 1000);
});

test('a tampered token is refused', () => {
  const now = 1_800_000_000_000;
  const token = createToken('Ana', 'sid-1', 'secret', now);
  const [payload, signature] = token.split('.');
  // Change who the token is for, keeping the old signature.
  const forged = Buffer.from(JSON.stringify({ g: 'Admin', s: 'sid-1', e: now + 1e12 })).toString('base64url');
  assert.equal(verifyToken(`${forged}.${signature}`, 'secret', now), null);
  // Change one character of the signature.
  const flipped = signature.slice(0, -1) + (signature.endsWith('A') ? 'B' : 'A');
  assert.equal(verifyToken(`${payload}.${flipped}`, 'secret', now), null);
  // Signed with another secret.
  assert.equal(verifyToken(createToken('Ana', 'sid-1', 'other-secret', now), 'secret', now), null);
  // Not a token at all.
  for (const junk of ['', 'abc', 'a.b.c', '.', `${payload}.`, `.${signature}`, null, undefined, 42, {}, 'x'.repeat(5000)]) {
    assert.equal(verifyToken(junk, 'secret', now), null, String(junk).slice(0, 20));
  }
});

test('a token whose payload is not what we signed for is refused even with a valid signature', async () => {
  const { createHmac } = await import('node:crypto');
  const make = (obj) => {
    const payload = Buffer.from(JSON.stringify(obj)).toString('base64url');
    return `${payload}.${createHmac('sha256', 'secret').update(payload).digest('base64url')}`;
  };
  assert.equal(verifyToken(make({ g: 'Ana', s: 'x' }), 'secret', 0), null, 'no expiry');
  assert.equal(verifyToken(make({ g: 5, s: 'x', e: 10 }), 'secret', 0), null, 'gamertag is not text');
  assert.equal(verifyToken(make('just text'), 'secret', 0), null);
  assert.deepEqual(verifyToken(make({ g: 'Ana', s: 'x', e: 10 }), 'secret', 0), { gamertag: 'Ana', sid: 'x', issuedAt: 0 });
});

// ---- small units ----

test('gamertag and PIN rules', () => {
  assert.equal(gamertagProblem('abc'), null);
  assert.equal(gamertagProblem('A_b_C_1_2_3_'), null);
  assert.match(gamertagProblem('ab'), /too short/);
  assert.match(gamertagProblem('a'.repeat(13)), /too long/);
  assert.match(gamertagProblem('a b c'), /only letters/);
  assert.equal(pinProblem('0000'), null);
  assert.match(pinProblem('000'), /4 digits/);
  assert.match(pinProblem(' 123'), /4 digits/);
  assert.match(pinProblem('１２３４'), /4 digits/, 'full-width digits are not digits here');
});

test('LoginGuard forgets old entries and Sessions keeps only the newest login', () => {
  const guard = new LoginGuard();
  guard.fail('ana', 1000);
  guard.sweep(1000 + LIMITS.loginWindowMs + 1);
  assert.equal(guard.entries.size, 0);

  const sessions = new Sessions();
  assert.equal(sessions.accept('ana', 'old', 1000), true, 'after a restart the first token seen is adopted');
  assert.equal(sessions.accept('ana', 'old', 1000), true);
  const fresh = sessions.start('ana', 5000);
  assert.equal(sessions.accept('ana', 'old', 1000), false, 'the older session is refused');
  assert.equal(sessions.accept('ana', fresh, 5000), true);

  // After a restart the phone that logged in LAST wins, whichever reconnects first.
  const restarted = new Sessions();
  assert.equal(restarted.accept('ana', 'older-phone', 1000), true, 'adopted because nothing else is known');
  assert.equal(restarted.accept('ana', 'newer-phone', 9000), true, 'a later login takes over');
  assert.equal(restarted.accept('ana', 'older-phone', 1000), false, 'and the older one is out');
});
