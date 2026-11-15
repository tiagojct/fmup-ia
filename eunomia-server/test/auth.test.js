'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { createStore } = require('../src/store.js');
const { createAuth, COOKIE_NAME, SESSION_MS, CodeInputError } = require('../src/auth.js');

const SECRET = 'segredo-de-teste-com-mais-de-32-caracteres!';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const T0 = Date.UTC(2026, 10, 14, 10, 0, 0);

function setup(t, extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eunomia-auth-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const clock = { t: T0 };
  const store = createStore(dir);
  const make = (opts = {}) => createAuth({ store, secret: SECRET, dailyLimit: 200, now: () => clock.t, ...extra, ...opts });
  return { dir, clock, store, auth: make(), make };
}

// ---------------------------------------------------------------- access codes

test('addCode: 12 characters from the alphabet; the file holds a salted scrypt hash and not the code', async (t) => {
  const { dir, auth } = setup(t);
  const { id, code } = auth.addCode('Ana Docente', 'teacher');
  assert.match(id, /^[0-9a-f]{8}$/);
  assert.equal(code.length, 12);
  for (const ch of code) assert.ok(ALPHABET.includes(ch), `carácter ${ch}`);
  const raw = fs.readFileSync(path.join(dir, 'codes.json'), 'utf8');
  assert.ok(!raw.includes(code));
  const entry = JSON.parse(raw).codes[0];
  assert.equal(entry.id, id);
  assert.equal(entry.name, 'Ana Docente');
  assert.equal(entry.role, 'teacher');
  assert.match(entry.salt, /^[0-9a-f]{32}$/);
  assert.match(entry.hash, /^[0-9a-f]{64}$/);
  assert.deepEqual(await auth.login(code), { id, name: 'Ana Docente', role: 'teacher' });
});

test('addCode: each code has its own salt and hash; names and roles are checked', (t) => {
  const { dir, auth } = setup(t);
  const a = auth.addCode('Ana', 'teacher');
  const b = auth.addCode('Rui', 'admin');
  assert.notEqual(a.code, b.code);
  assert.notEqual(a.id, b.id);
  const [x, y] = JSON.parse(fs.readFileSync(path.join(dir, 'codes.json'), 'utf8')).codes;
  assert.notEqual(x.salt, y.salt);
  assert.notEqual(x.hash, y.hash);
  assert.equal(y.role, 'admin');
  assert.equal(auth.addCode('Sem perfil').id.length, 8); // the role defaults to teacher
  assert.throws(() => auth.addCode('', 'teacher'), /nome/i);
  assert.throws(() => auth.addCode('   ', 'teacher'), /nome/i);
  assert.throws(() => auth.addCode('Ana', 'dono'), /perfil/i);
  assert.throws(() => auth.addCode(42, 'teacher'), /nome/i);
});

test('login: the code gives the user, a wrong code gives null', async (t) => {
  const { auth } = setup(t);
  const { id, code } = auth.addCode('Ana', 'teacher');
  auth.addCode('Rui', 'admin');
  assert.deepEqual(await auth.login(code), { id, name: 'Ana', role: 'teacher' });
  assert.equal(await auth.login('WRONG'), null);
  assert.equal(await auth.login('AAAAAAAAAAAA'), null); // well formed, not issued
  assert.equal(await auth.login(`${code}A`), null);
  assert.equal(await auth.login(code.slice(1)), null);
  for (const bad of ['', '   ', null, undefined, 42, {}, ['x']]) assert.equal(await auth.login(bad), null);
});

test('login: case, spaces and hyphens in the typed code do not matter', async (t) => {
  const { auth } = setup(t);
  const { id, code } = auth.addCode('Ana', 'teacher');
  const typed = ` ${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8)} `.toLowerCase();
  assert.deepEqual(await auth.login(typed), { id, name: 'Ana', role: 'teacher' });
});

test('login: the right code is found among several', async (t) => {
  const { auth } = setup(t);
  const codes = ['Ana', 'Rui', 'Eva', 'Teresa'].map((n) => ({ n, ...auth.addCode(n, 'teacher') }));
  for (const c of codes) assert.equal((await auth.login(c.code)).name, c.n);
});

test('revoke: a revoked code no longer logs in, and its cookie stops working', async (t) => {
  const { auth } = setup(t);
  const { id, code } = auth.addCode('Ana', 'teacher');
  const keep = auth.addCode('Rui', 'teacher');
  const user = await auth.login(code);
  const cookie = auth.sign(user);
  assert.deepEqual(auth.verify(cookie), user);
  assert.equal(auth.revoke(id), true);
  assert.equal(await auth.login(code), null);
  assert.equal(auth.verify(cookie), null);
  assert.equal(auth.revoke(id), false);
  assert.equal(auth.revoke('naoexiste'), false);
  assert.equal((await auth.login(keep.code)).name, 'Rui');
});

test('list: id, name, role, created and revoked; never a hash, a salt or a code', async (t) => {
  const { clock, auth } = setup(t);
  const a = auth.addCode('Ana', 'teacher');
  clock.t += 1000;
  const b = auth.addCode('Rui', 'admin');
  auth.revoke(a.id);
  const list = auth.list();
  assert.deepEqual(list, [
    { id: a.id, name: 'Ana', role: 'teacher', created: new Date(T0).toISOString(), revoked: new Date(T0 + 1000).toISOString() },
    { id: b.id, name: 'Rui', role: 'admin', created: new Date(T0 + 1000).toISOString(), revoked: null },
  ]);
  const text = JSON.stringify(list);
  assert.ok(!text.includes(a.code) && !text.includes(b.code));
});

test('codes are read from the store on each call: a code added by another process works at once', async (t) => {
  const { store, auth, make } = setup(t);
  const other = make(); // as the CLI is, a second auth on the same folder
  const { code } = other.addCode('Ana', 'teacher');
  assert.equal((await auth.login(code)).name, 'Ana');
  assert.ok(store.read('codes.json').codes.length === 1);
});

// ---------------------------------------------------------------- sessions

test('sign and verify: the cookie value is base64url(payload).hmac and gives the user back', (t) => {
  const { auth, clock } = setup(t);
  const { id } = auth.addCode('Ana', 'teacher');
  const user = { id, name: 'Ana', role: 'teacher' };
  const cookie = auth.sign(user);
  assert.match(cookie, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.equal(COOKIE_NAME, 'eunomia');
  assert.equal(SESSION_MS, 12 * 60 * 60 * 1000);
  const payload = JSON.parse(Buffer.from(cookie.split('.')[0], 'base64url').toString('utf8'));
  assert.deepEqual(payload, { id, exp: clock.t + SESSION_MS });
  assert.deepEqual(auth.verify(cookie), user);
});

test('verify: a tampered cookie is refused', (t) => {
  const { auth } = setup(t);
  const ana = auth.addCode('Ana', 'teacher');
  const rui = auth.addCode('Rui', 'admin');
  const cookie = auth.sign({ id: ana.id, name: 'Ana', role: 'teacher' });
  const [payload, mac] = cookie.split('.');
  const forged = Buffer.from(JSON.stringify({ id: rui.id, exp: Date.now() + 1e9 })).toString('base64url');
  assert.equal(auth.verify(`${forged}.${mac}`), null); // another payload, the old signature
  const flipped = mac.slice(0, -1) + (mac.endsWith('A') ? 'B' : 'A');
  assert.equal(auth.verify(`${payload}.${flipped}`), null);
  assert.equal(auth.verify(`${payload}.`), null);
  assert.equal(auth.verify(`${payload}.${mac}.${mac}`), null);
  assert.equal(auth.verify(`${payload}.${mac.slice(0, -2)}`), null);
  for (const bad of ['', '.', 'abc', 'a.b', undefined, null, 42, {}]) assert.equal(auth.verify(bad), null);
});

test('verify: a cookie signed with another secret is refused', (t) => {
  const { auth, make } = setup(t);
  const { id } = auth.addCode('Ana', 'teacher');
  const other = make({ secret: `${SECRET}-outro` });
  assert.equal(other.verify(auth.sign({ id, name: 'Ana', role: 'teacher' })), null);
});

test('verify: an expired cookie is refused, and the last millisecond is already too late', (t) => {
  const { auth, clock } = setup(t);
  const { id } = auth.addCode('Ana', 'teacher');
  const cookie = auth.sign({ id, name: 'Ana', role: 'teacher' });
  clock.t = T0 + SESSION_MS - 1;
  assert.equal(auth.verify(cookie).id, id);
  clock.t = T0 + SESSION_MS;
  assert.equal(auth.verify(cookie), null);
  clock.t = T0 + SESSION_MS + 1;
  assert.equal(auth.verify(cookie), null);
});

test('verify: the role is the one in the store now, not the one in the cookie time', (t) => {
  const { store, auth } = setup(t);
  const { id } = auth.addCode('Ana', 'teacher');
  const cookie = auth.sign({ id, name: 'Ana', role: 'admin' }); // a wrong role in the argument changes nothing
  assert.equal(auth.verify(cookie).role, 'teacher');
  const file = store.read('codes.json');
  file.codes[0].role = 'admin';
  store.write('codes.json', file);
  assert.equal(auth.verify(cookie).role, 'admin');
});

test('createAuth: a secret under 32 characters, or a bad daily limit, is refused', (t) => {
  const { store } = setup(t);
  assert.throws(() => createAuth({ store, secret: 'curto', dailyLimit: 200 }), /32/);
  assert.throws(() => createAuth({ store, secret: undefined, dailyLimit: 200 }), /32/);
  assert.throws(() => createAuth({ store, secret: SECRET, dailyLimit: 0 }), /limite/i);
  assert.throws(() => createAuth({ store, secret: SECRET, dailyLimit: 'muitos' }), /limite/i);
  assert.ok(createAuth({ store, secret: SECRET })); // the limit defaults to 200, the clock to Date.now
});

// ---------------------------------------------------------------- limits

test('countModelCall: call 200 passes, call 201 does not', (t) => {
  const { auth } = setup(t);
  let last;
  for (let i = 1; i <= 200; i += 1) {
    last = auth.countModelCall('u1');
    assert.deepEqual(last, { ok: true, used: i, limit: 200 });
  }
  assert.deepEqual(auth.countModelCall('u1'), { ok: false, used: 200, limit: 200 });
  assert.deepEqual(auth.countModelCall('u1'), { ok: false, used: 200, limit: 200 });
  assert.deepEqual(auth.countModelCall('u2'), { ok: true, used: 1, limit: 200 });
});

test('countModelCall: the count restarts on the next UTC day', (t) => {
  const { auth, clock } = setup(t, { dailyLimit: 3 });
  clock.t = Date.UTC(2026, 10, 14, 23, 59, 0);
  for (let i = 0; i < 3; i += 1) assert.equal(auth.countModelCall('u1').ok, true);
  assert.equal(auth.countModelCall('u1').ok, false);
  clock.t = Date.UTC(2026, 10, 15, 0, 0, 1);
  assert.deepEqual(auth.countModelCall('u1'), { ok: true, used: 1, limit: 3 });
});

test('countModelCall: the count survives a restart (usage.json) and old days are dropped', (t) => {
  const { dir, auth, clock, make } = setup(t, { dailyLimit: 5 });
  for (let i = 0; i < 4; i += 1) auth.countModelCall('u1');
  const usage = JSON.parse(fs.readFileSync(path.join(dir, 'usage.json'), 'utf8'));
  assert.deepEqual(usage, { '2026-11-14': { u1: 4 } });
  const restarted = make();
  assert.deepEqual(restarted.countModelCall('u1'), { ok: true, used: 5, limit: 5 });
  assert.deepEqual(restarted.countModelCall('u1'), { ok: false, used: 5, limit: 5 });
  clock.t = Date.UTC(2026, 11, 20, 8, 0, 0); // 36 days later
  restarted.countModelCall('u1');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'usage.json'), 'utf8')), { '2026-12-20': { u1: 1 } });
});

test('rateLimit: the sixth call in a minute is refused', (t) => {
  const { auth } = setup(t);
  for (let i = 0; i < 5; i += 1) assert.equal(auth.rateLimit('login:ip', 5), true, `chamada ${i + 1}`);
  assert.equal(auth.rateLimit('login:ip', 5), false);
  assert.equal(auth.rateLimit('login:ip', 5), false);
  assert.equal(auth.rateLimit('login:outro', 5), true); // another key has its own count
});

test('rateLimit: the window slides, and refused calls do not extend it', (t) => {
  const { auth, clock } = setup(t);
  for (let i = 0; i < 5; i += 1) {
    assert.equal(auth.rateLimit('k', 5), true);
    clock.t += 10_000; // five calls over 50 s
  }
  assert.equal(auth.rateLimit('k', 5), false); // t0 + 50 s: all five still inside the minute
  clock.t = T0 + 60_000; // the first call leaves the window
  assert.equal(auth.rateLimit('k', 5), true);
  assert.equal(auth.rateLimit('k', 5), false);
  clock.t = T0 + 60_000 + 60_001;
  assert.equal(auth.rateLimit('k', 5), true);
});

test('rateLimit: the limit is kept in memory only', (t) => {
  const { dir, auth } = setup(t);
  auth.rateLimit('k', 1);
  assert.deepEqual(fs.readdirSync(dir), []);
});

// ---------------------------------------------------------------- the CLI

const CLI = path.join(__dirname, '..', 'bin', 'codes.js');

function cli(dir, args, env = {}) {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    env: { PATH: process.env.PATH, EUNOMIA_DATA: dir, ...env },
    encoding: 'utf8',
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

test('bin/codes.js: add prints the code once, list shows the codes, revoke removes one', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eunomia-cli-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const add = cli(dir, ['add', 'Ana Docente']);
  assert.equal(add.code, 0, add.err);
  const code = add.out.match(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{12}$/m)?.[0];
  assert.ok(code, `código na saída: ${add.out}`);
  assert.equal(add.out.split(code).length - 1, 1); // printed once

  const adm = cli(dir, ['add', 'Rui Admin', '--admin']);
  assert.equal(adm.code, 0, adm.err);
  const admCode = adm.out.match(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{12}$/m)[0];

  const auth = createAuth({ store: createStore(dir), secret: SECRET });
  assert.deepEqual(await auth.login(code).then((u) => u && { name: u.name, role: u.role }), { name: 'Ana Docente', role: 'teacher' });
  assert.deepEqual(await auth.login(admCode).then((u) => u && { name: u.name, role: u.role }), { name: 'Rui Admin', role: 'admin' });

  const list = cli(dir, ['list']);
  assert.equal(list.code, 0, list.err);
  assert.ok(list.out.includes('Ana Docente') && list.out.includes('Rui Admin'));
  assert.ok(list.out.includes('admin') && list.out.includes('teacher'));
  assert.ok(!list.out.includes(code) && !list.out.includes(admCode));

  const id = auth.list().find((c) => c.name === 'Ana Docente').id;
  const revoke = cli(dir, ['revoke', id]);
  assert.equal(revoke.code, 0, revoke.err);
  assert.equal(await auth.login(code), null);
  assert.ok(cli(dir, ['list']).out.includes('revogado'));

  const again = cli(dir, ['revoke', id]);
  assert.notEqual(again.code, 0);
  assert.ok(again.err.length > 0);
});

test('bin/codes.js: wrong usage prints a Portuguese message on stderr and exits with 1', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eunomia-cli-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const args of [[], ['add'], ['add', ''], ['revoke'], ['voar']]) {
    const r = cli(dir, args);
    assert.equal(r.code, 1, `args ${JSON.stringify(args)}`);
    assert.match(r.err, /Uso:|nome|código/i);
    assert.equal(r.out, '');
  }
  assert.deepEqual(fs.readdirSync(dir), []);
});

test('addCode: wrong input throws CodeInputError, with a message for the user', (t) => {
  const { auth } = setup(t);
  for (const [name, role] of [['', 'teacher'], ['x'.repeat(101), 'teacher'], ['Ana', 'chefe']]) {
    assert.throws(() => auth.addCode(name, role), (e) => e instanceof CodeInputError && typeof e.message === 'string' && e.message !== '');
  }
});
