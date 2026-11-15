'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { createServer, requireCreds, HttpError } = require('../src/server.js');
const { logRequest } = require('../src/log.js');
const { loadConfig, start } = require('../src/main.js');
const { createStore } = require('../src/store.js');
const { createAuth } = require('../src/auth.js');
const { IaeduError } = require('../src/iaedu.js');

const SECRET = 'segredo-de-teste-com-mais-de-32-caracteres!';
const BASE = '/fmup-ia/eunomia/api';
const KEY = 'sk-usr-test';

// ---------------------------------------------------------------- harness

function capture() {
  const lines = [];
  return {
    lines,
    write(chunk) {
      for (const line of String(chunk).split('\n')) if (line !== '') lines.push(line);
      return true;
    },
  };
}

// The 'finish' event of a response can come a moment after the client has the reply.
async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 20));
}

async function startApp(t, extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eunomia-server-'));
  const store = createStore(dir);
  const logStream = capture();
  const errorStream = capture();
  const config = {
    basePath: BASE,
    store,
    auth: createAuth({ store, secret: SECRET, dailyLimit: 200 }),
    iaedu: { send: async () => ({ text: 'x', model: null }) },
    github: null,
    now: Date.now,
    env: {},
    logStream,
    errorStream,
    ...extra,
  };
  const { auth } = config;
  const server = createServer(config);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  async function call(method, route, { body, headers = {}, cookie, raw, base = BASE } = {}) {
    const h = { ...headers };
    if (cookie) h.cookie = `eunomia=${cookie}`;
    let payload = raw;
    if (body !== undefined) {
      payload = JSON.stringify(body);
      h['content-type'] = 'application/json';
    }
    const res = await fetch(`${url}${base}${route}`, { method, headers: h, body: payload });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      // not JSON
    }
    return { status: res.status, headers: res.headers, setCookie: res.headers.getSetCookie(), json, text };
  }

  // A teacher or an admin with a session cookie.
  async function person(name, role = 'teacher') {
    const { id, code } = auth.addCode(name, role);
    const user = await auth.login(code);
    return { id, code, user, cookie: auth.sign(user) };
  }

  return { url, call, person, auth, store: config.store, dir, logStream, errorStream, server };
}

function cookieValue(setCookie) {
  return /^eunomia=([^;]*)/.exec(setCookie)[1];
}

// ---------------------------------------------------------------- basics

test('GET /saude answers without a session', async (t) => {
  const app = await startApp(t);
  const r = await app.call('GET', '/saude');
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { ok: true });
  assert.match(r.headers.get('content-type'), /^application\/json/);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal((await app.call('HEAD', '/saude')).status, 200);
});

test('an unknown route returns 404, a known path with another method returns 405', async (t) => {
  const app = await startApp(t);
  const r = await app.call('GET', '/nao-existe');
  assert.equal(r.status, 404);
  assert.deepEqual(r.json, { erro: 'Não encontrado.' });
  assert.equal((await app.call('GET', '/saude', { base: '/fmup-ia/eunomia/apix' })).status, 404);
  assert.equal((await app.call('GET', '/saude', { base: '' })).status, 404);
  assert.equal((await app.call('GET', '/saude', { base: '/outro' })).status, 404);
  const wrong = await app.call('POST', '/saude', { body: {} });
  assert.equal(wrong.status, 405);
  assert.match(wrong.headers.get('allow'), /GET/);
  assert.ok(typeof wrong.json.erro === 'string');
});

test('a trailing slash is the same route', async (t) => {
  const app = await startApp(t);
  assert.equal((await app.call('GET', '/saude/')).status, 200);
});

// ---------------------------------------------------------------- login

test('login with a valid code sets the session cookie, and /me returns the name', async (t) => {
  const app = await startApp(t);
  const { id, code } = app.auth.addCode('Ana Docente', 'teacher');
  const r = await app.call('POST', '/login', { body: { codigo: code } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { id, nome: 'Ana Docente', perfil: 'teacher' });
  assert.equal(r.setCookie.length, 1);
  const attrs = r.setCookie[0].split(';').map((s) => s.trim());
  assert.match(attrs[0], /^eunomia=[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  for (const needed of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/fmup-ia/eunomia', 'Max-Age=43200']) {
    assert.ok(attrs.includes(needed), `falta ${needed} em ${r.setCookie[0]}`);
  }
  const me = await app.call('GET', '/me', { cookie: cookieValue(r.setCookie[0]) });
  assert.equal(me.status, 200);
  assert.deepEqual(me.json, { id, nome: 'Ana Docente', perfil: 'teacher' });
});

test('login: the code is accepted in lower case, with hyphens', async (t) => {
  const app = await startApp(t);
  const { code } = app.auth.addCode('Ana', 'teacher');
  const typed = `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8)}`.toLowerCase();
  assert.equal((await app.call('POST', '/login', { body: { codigo: typed } })).status, 200);
});

test('login with a wrong code returns 401 and sets no cookie', async (t) => {
  const app = await startApp(t);
  app.auth.addCode('Ana', 'teacher');
  for (const codigo of ['WRONG', 'AAAAAAAAAAAA']) {
    const r = await app.call('POST', '/login', { body: { codigo } });
    assert.equal(r.status, 401);
    assert.deepEqual(r.json, { erro: 'Código inválido.' });
    assert.deepEqual(r.setCookie, []);
  }
});

test('login: a missing code, a body that is not JSON and a wrong content type are refused', async (t) => {
  const app = await startApp(t);
  const missing = await app.call('POST', '/login', { body: {} });
  assert.equal(missing.status, 400);
  assert.deepEqual(missing.json, { erro: 'Indique o código de acesso.' });
  assert.equal((await app.call('POST', '/login', { body: { codigo: 42 } })).status, 400);
  assert.equal((await app.call('POST', '/login', { body: [] })).status, 400);
  const broken = await app.call('POST', '/login', { raw: '{"codigo":', headers: { 'content-type': 'application/json' } });
  assert.equal(broken.status, 400);
  assert.match(broken.json.erro, /JSON/);
  const form = await app.call('POST', '/login', { raw: 'codigo=ABC', headers: { 'content-type': 'application/x-www-form-urlencoded' } });
  assert.equal(form.status, 415);
  assert.ok(typeof form.json.erro === 'string');
});

test('/me without a session, or with a tampered or expired one, returns 401', async (t) => {
  const clock = { t: Date.UTC(2026, 10, 14, 10, 0, 0) };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eunomia-server-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = createStore(dir);
  const auth = createAuth({ store, secret: SECRET, now: () => clock.t });
  const app = await startApp(t, { store, auth });
  const { cookie } = await app.person('Ana');
  assert.equal((await app.call('GET', '/me', { cookie })).status, 200);
  const none = await app.call('GET', '/me');
  assert.equal(none.status, 401);
  assert.ok(typeof none.json.erro === 'string');
  const flipped = cookie.slice(0, -1) + (cookie.endsWith('A') ? 'B' : 'A');
  assert.equal((await app.call('GET', '/me', { cookie: flipped })).status, 401);
  assert.equal((await app.call('GET', '/me', { cookie: 'lixo' })).status, 401);
  clock.t += 12 * 60 * 60 * 1000;
  assert.equal((await app.call('GET', '/me', { cookie })).status, 401);
});

test('logout clears the cookie', async (t) => {
  const app = await startApp(t);
  const r = await app.call('POST', '/logout', { body: {} });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { ok: true });
  assert.equal(r.setCookie.length, 1);
  assert.match(r.setCookie[0], /^eunomia=;/);
  assert.match(r.setCookie[0], /Max-Age=0/);
  assert.match(r.setCookie[0], /Path=\/fmup-ia\/eunomia/);
});

// ---------------------------------------------------------------- login limit

test('the sixth login attempt in a minute from one address returns 429', async (t) => {
  const app = await startApp(t);
  for (let i = 1; i <= 5; i += 1) {
    const r = await app.call('POST', '/login', { body: { codigo: 'AAAAAAAAAAAA' } });
    assert.equal(r.status, 401, `tentativa ${i}`);
  }
  const sixth = await app.call('POST', '/login', { body: { codigo: 'AAAAAAAAAAAA' } });
  assert.equal(sixth.status, 429);
  assert.ok(typeof sixth.json.erro === 'string');
  assert.equal(sixth.headers.get('retry-after'), '60');
  // a right code does not get round the limit
  const { code } = app.auth.addCode('Ana', 'teacher');
  assert.equal((await app.call('POST', '/login', { body: { codigo: code } })).status, 429);
});

test('the login limit counts by CF-Connecting-IP first, then the last X-Forwarded-For entry, then the socket', async (t) => {
  const app = await startApp(t);
  const attempt = (headers) => app.call('POST', '/login', { body: { codigo: 'AAAAAAAAAAAA' }, headers });

  // Cloudflare's header wins over X-Forwarded-For.
  for (let i = 0; i < 5; i += 1) assert.equal((await attempt({ 'cf-connecting-ip': '203.0.113.7', 'x-forwarded-for': `10.0.0.${i}` })).status, 401);
  assert.equal((await attempt({ 'cf-connecting-ip': '203.0.113.7', 'x-forwarded-for': '10.0.0.99' })).status, 429);
  assert.equal((await attempt({ 'cf-connecting-ip': '203.0.113.8' })).status, 401); // another client

  // Without it (or with a value that is not an address), the last X-Forwarded-For entry counts: a
  // rotating first entry, which the client controls, does not open a new bucket.
  for (let i = 0; i < 5; i += 1) {
    assert.equal((await attempt({ 'cf-connecting-ip': 'nao-e-ip', 'x-forwarded-for': `192.0.2.${i}, 198.51.100.4` })).status, 401);
  }
  assert.equal((await attempt({ 'x-forwarded-for': '192.0.2.200, 198.51.100.4' })).status, 429);

  // An X-Forwarded-For whose last entry is not an address falls back to the socket.
  for (let i = 0; i < 5; i += 1) assert.equal((await attempt({ 'x-forwarded-for': `198.51.100.${i}, lixo` })).status, 401);
  assert.equal((await attempt({})).status, 429); // the socket bucket (127.0.0.1) is the same
});

test('the login limit runs before the body is read; login takes at most 8 KB', async (t) => {
  const app = await startApp(t);
  const headers = { 'cf-connecting-ip': '203.0.113.50', 'content-type': 'application/json' };
  for (let i = 0; i < 5; i += 1) assert.equal((await app.call('POST', '/login', { raw: '{"codigo":"AAAAAAAAAAAA"}', headers })).status, 401);
  const limited = await app.call('POST', '/login', { raw: 'isto não é JSON', headers });
  assert.equal(limited.status, 429);

  const big = JSON.stringify({ codigo: 'A'.repeat(9000) });
  const r = await app.call('POST', '/login', { raw: big, headers: { 'cf-connecting-ip': '203.0.113.51', 'content-type': 'application/json' } });
  assert.equal(r.status, 413);
  assert.equal(r.headers.get('connection'), 'close');
});

test('an early error on a request with a body closes the connection', async (t) => {
  const app = await startApp(t);
  const r = await app.call('POST', '/codigos', { body: { nome: 'X' } }); // no session: 401 before the body is read
  assert.equal(r.status, 401);
  assert.equal(r.headers.get('connection'), 'close');
  const plain = await app.call('GET', '/me');
  assert.equal(plain.status, 401);
  assert.notEqual(plain.headers.get('connection'), 'close'); // no body: the connection can stay
});

test('a route param named id must look like an id', async (t) => {
  const app = await startApp(t, { routes: (route) => route('GET', '/_eco/:id', (req, res, ctx) => ({ id: ctx.params.id }), 'public') });
  assert.equal((await app.call('GET', '/_eco/abc_DEF-123')).status, 200);
  for (const bad of ['..', 'a.b', '%2E%2E%2Fcodes', 'a%20b', 'x'.repeat(65)]) {
    assert.equal((await app.call('GET', `/_eco/${bad}`)).status, 404, bad);
  }
});

test('an authenticated user is limited to requestsPerMinute', async (t) => {
  const app = await startApp(t, { limits: { requestsPerMinute: 3 } });
  const { cookie } = await app.person('Ana');
  for (let i = 0; i < 3; i += 1) assert.equal((await app.call('GET', '/me', { cookie })).status, 200);
  const r = await app.call('GET', '/me', { cookie });
  assert.equal(r.status, 429);
  assert.ok(typeof r.json.erro === 'string');
  const other = await app.person('Rui');
  assert.equal((await app.call('GET', '/me', { cookie: other.cookie })).status, 200);
  assert.equal((await app.call('GET', '/saude')).status, 200); // public routes are not counted
});

// ---------------------------------------------------------------- codes (admin)

test('a teacher gets 403 on the admin routes, an unauthenticated caller gets 401', async (t) => {
  const app = await startApp(t);
  const teacher = await app.person('Ana', 'teacher');
  const post = await app.call('POST', '/codigos', { body: { nome: 'Novo' }, cookie: teacher.cookie });
  assert.equal(post.status, 403);
  assert.ok(typeof post.json.erro === 'string');
  assert.equal((await app.call('GET', '/codigos', { cookie: teacher.cookie })).status, 403);
  assert.equal((await app.call('DELETE', `/codigos/${teacher.id}`, { cookie: teacher.cookie })).status, 403);
  assert.equal((await app.call('POST', '/codigos', { body: { nome: 'Novo' } })).status, 401);
  assert.equal(app.auth.list().length, 1); // nothing was made
});

test('an admin makes a code that then logs in', async (t) => {
  const app = await startApp(t);
  const admin = await app.person('Rui', 'admin');
  const made = await app.call('POST', '/codigos', { body: { nome: 'Eva Docente' }, cookie: admin.cookie });
  assert.equal(made.status, 201);
  assert.match(made.json.codigo, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{12}$/);
  assert.match(made.json.id, /^[0-9a-f]{8}$/);
  assert.equal(made.headers.get('cache-control'), 'no-store');

  const login = await app.call('POST', '/login', { body: { codigo: made.json.codigo } });
  assert.equal(login.status, 200);
  assert.deepEqual(login.json, { id: made.json.id, nome: 'Eva Docente', perfil: 'teacher' });

  const adm = await app.call('POST', '/codigos', { body: { nome: 'Outro Admin', admin: true }, cookie: admin.cookie });
  assert.equal(adm.status, 201);
  const admLogin = await app.call('POST', '/login', { body: { codigo: adm.json.codigo }, headers: { 'x-forwarded-for': '198.51.100.2' } });
  assert.equal(admLogin.json.perfil, 'admin');
});

test('an admin lists the codes, without a hash or a code, and revokes one', async (t) => {
  const app = await startApp(t);
  const admin = await app.person('Rui', 'admin');
  const eva = await app.person('Eva', 'teacher');
  const list = await app.call('GET', '/codigos', { cookie: admin.cookie });
  assert.equal(list.status, 200);
  assert.deepEqual(
    list.json.codigos.map((c) => [c.nome, c.perfil, c.revogado]),
    [
      ['Rui', 'admin', null],
      ['Eva', 'teacher', null],
    ],
  );
  assert.ok(!list.text.includes(eva.code) && !list.text.includes('hash') && !list.text.includes('salt'));

  const del = await app.call('DELETE', `/codigos/${eva.id}`, { cookie: admin.cookie });
  assert.equal(del.status, 200);
  assert.deepEqual(del.json, { ok: true });
  assert.equal((await app.call('GET', '/me', { cookie: eva.cookie })).status, 401); // the session stops at once
  assert.equal((await app.call('POST', '/login', { body: { codigo: eva.code } })).status, 401);
  const again = await app.call('DELETE', `/codigos/${eva.id}`, { cookie: admin.cookie });
  assert.equal(again.status, 404);
  assert.deepEqual(again.json, { erro: 'Código não encontrado.' });
  assert.equal((await app.call('DELETE', '/codigos/nada', { cookie: admin.cookie })).status, 404);
  assert.equal((await app.call('DELETE', '/codigos/%E0%A4%A', { cookie: admin.cookie })).status, 404);
});

test('POST /codigos checks the body', async (t) => {
  const app = await startApp(t);
  const admin = await app.person('Rui', 'admin');
  for (const body of [{}, { nome: '' }, { nome: '   ' }, { nome: 7 }, { nome: 'X'.repeat(101) }, { nome: 'Ana', admin: 'sim' }]) {
    const r = await app.call('POST', '/codigos', { body, cookie: admin.cookie });
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.ok(typeof r.json.erro === 'string' && r.json.erro.length > 0);
  }
  assert.equal(app.auth.list().length, 1);
});

// ---------------------------------------------------------------- logging

test('the log line has method, path, status and ms, and never a key, a cookie, a code or a body', async (t) => {
  const app = await startApp(t);
  const { code } = app.auth.addCode('Ana', 'teacher');
  const login = await app.call('POST', '/login', { body: { codigo: code }, headers: { 'x-iaedu-key': KEY, 'x-iaedu-agent': 'agente-secreto', 'x-iaedu-channel': 'canal-secreto' } });
  const cookie = cookieValue(login.setCookie[0]);
  await app.call('GET', '/me?codigo=SEGREDO-NA-URL&x=1', {
    cookie,
    headers: { 'x-iaedu-key': KEY, 'x-iaedu-agent': 'agente-secreto', 'x-iaedu-channel': 'canal-secreto' },
  });
  await app.call('POST', '/login', { body: { codigo: 'texto-do-rascunho-secreto' }, headers: { 'x-iaedu-key': KEY } });
  await settle();

  assert.equal(app.logStream.lines.length, 3);
  const entries = app.logStream.lines.map((l) => JSON.parse(l));
  assert.deepEqual(Object.keys(entries[0]).sort(), ['method', 'ms', 'path', 'status']);
  assert.deepEqual(
    entries.map((e) => [e.method, e.path, e.status]),
    [
      ['POST', `${BASE}/login`, 200],
      ['GET', `${BASE}/me`, 200],
      ['POST', `${BASE}/login`, 401],
    ],
  );
  assert.ok(entries.every((e) => typeof e.ms === 'number' && e.ms >= 0));
  const everything = app.logStream.lines.join('\n') + app.errorStream.lines.join('\n');
  for (const secret of [KEY, 'agente-secreto', 'canal-secreto', cookie, code, 'SEGREDO-NA-URL', 'texto-do-rascunho-secreto', 'x=1']) {
    assert.ok(!everything.includes(secret), `o registo contém ${secret}`);
  }
});

test('logRequest writes one JSON line and nothing from the headers or the body', () => {
  const out = capture();
  const req = {
    method: 'POST',
    url: '/fmup-ia/eunomia/api/login?codigo=ABC#x',
    headers: { cookie: 'eunomia=abc', 'x-iaedu-key': KEY, authorization: 'Bearer x' },
    body: 'texto',
  };
  logRequest(req, 401, 12.345, out);
  assert.equal(out.lines.length, 1);
  const entry = JSON.parse(out.lines[0]);
  assert.deepEqual(Object.keys(entry).sort(), ['method', 'ms', 'path', 'status']);
  assert.equal(entry.path, '/fmup-ia/eunomia/api/login');
  assert.equal(entry.status, 401);
  assert.equal(entry.ms, 12.3);
  for (const secret of [KEY, 'abc', 'Bearer', 'texto', 'ABC']) assert.ok(!out.lines[0].includes(secret), secret);
});

// ---------------------------------------------------------------- the body

// A private route that reports the size of the body it read.
function sizeRoute(route) {
  route('POST', '/_tamanho', (req, res, ctx) => ({ n: String(ctx.body.x || '').length }));
}

test('a body over 1 MB returns 413 with Connection: close, and a body of exactly 1 MB is read', async (t) => {
  const app = await startApp(t, { routes: sizeRoute });
  const { cookie } = await app.person('Ana');
  const LIMIT = 1024 * 1024;
  const wrap = (size) => `{"x":"${'A'.repeat(size - '{"x":""}'.length)}"}`;
  const ok = wrap(LIMIT);
  assert.equal(Buffer.byteLength(ok), LIMIT);
  const read = await app.call('POST', '/_tamanho', { cookie, raw: ok, headers: { 'content-type': 'application/json' } });
  assert.equal(read.status, 200);
  assert.equal(read.json.n, LIMIT - 8);
  const big = wrap(LIMIT + 1);
  assert.equal(Buffer.byteLength(big), LIMIT + 1);
  const r = await app.call('POST', '/_tamanho', { cookie, raw: big, headers: { 'content-type': 'application/json' } });
  assert.equal(r.status, 413);
  assert.equal(r.headers.get('connection'), 'close');
  assert.ok(typeof r.json.erro === 'string');
  // the server still answers after a 413
  assert.equal((await app.call('GET', '/saude')).status, 200);
});

test('a chunked body over 1 MB, with no Content-Length, returns 413', async (t) => {
  const app = await startApp(t, { routes: sizeRoute });
  const { cookie } = await app.person('Ana');
  const status = await new Promise((resolve, reject) => {
    const req = http.request(
      `${app.url}${BASE}/_tamanho`,
      { method: 'POST', headers: { cookie: `eunomia=${cookie}`, 'content-type': 'application/json', 'transfer-encoding': 'chunked' } },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      },
    );
    req.on('error', reject);
    const chunk = Buffer.alloc(600 * 1024, 'a');
    req.write(chunk);
    req.write(chunk);
    req.end();
  });
  assert.equal(status, 413);
});

// ---------------------------------------------------------------- credentials

function credsRoutes(route) {
  route('GET', '/_creds', (req, res, ctx) => ({ creds: ctx.creds }), 'public');
  route('GET', '/_need', (req, res, ctx) => requireCreds(ctx), 'public');
}

const ENV = {
  IAEDU_API_KEY: 'sk-usr-shared',
  IAEDU_AGENT_ID: 'agente-gpt',
  IAEDU_CHANNEL_ID: 'canal-gpt',
  IAEDU_ALT_API_KEY: 'sk-usr-alt',
  IAEDU_ALT_AGENT_ID: 'agente-amalia',
  IAEDU_ALT_CHANNEL_ID: 'canal-amalia',
};
const OWN = { 'x-iaedu-key': 'sk-usr-own', 'x-iaedu-agent': 'agente-meu', 'x-iaedu-channel': 'canal-meu' };

test('credentials: the shared set from the environment', async (t) => {
  const app = await startApp(t, { env: ENV, routes: credsRoutes });
  const r = await app.call('GET', '/_creds');
  assert.deepEqual(r.json.creds, { key: 'sk-usr-shared', agentId: 'agente-gpt', channelId: 'canal-gpt', source: 'shared' });
  assert.deepEqual((await app.call('GET', '/_need')).json, r.json.creds);
});

test('credentials: ?modelo=amalia selects the alternative set', async (t) => {
  const app = await startApp(t, { env: ENV, routes: credsRoutes });
  const r = await app.call('GET', '/_creds?modelo=amalia');
  assert.deepEqual(r.json.creds, { key: 'sk-usr-alt', agentId: 'agente-amalia', channelId: 'canal-amalia', source: 'alt' });
  const bad = await app.call('GET', '/_need?modelo=outro');
  assert.equal(bad.status, 400);
  assert.ok(typeof bad.json.erro === 'string');
  assert.equal((await app.call('GET', '/_creds?modelo=outro')).json.creds, null);
});

test('credentials: the own-key headers win over the shared set and over ?modelo', async (t) => {
  const app = await startApp(t, { env: ENV, routes: credsRoutes });
  const expected = { key: 'sk-usr-own', agentId: 'agente-meu', channelId: 'canal-meu', source: 'own' };
  assert.deepEqual((await app.call('GET', '/_creds', { headers: OWN })).json.creds, expected);
  assert.deepEqual((await app.call('GET', '/_creds?modelo=amalia', { headers: OWN })).json.creds, expected);
});

test('credentials: own-key headers that are not all there are an error, not a fallback to the shared key', async (t) => {
  const app = await startApp(t, { env: ENV, routes: credsRoutes });
  for (const partial of [{ 'x-iaedu-key': 'sk-usr-own' }, { 'x-iaedu-key': 'sk-usr-own', 'x-iaedu-agent': 'a' }, { 'x-iaedu-agent': 'a', 'x-iaedu-channel': 'c' }]) {
    const r = await app.call('GET', '/_need', { headers: partial });
    assert.equal(r.status, 400, JSON.stringify(partial));
    assert.ok(!r.text.includes('sk-usr-own'));
    assert.equal((await app.call('GET', '/_creds', { headers: partial })).json.creds, null);
  }
});

test('credentials: blank or whitespace own-key headers are an own-key attempt and give 400', async (t) => {
  const app = await startApp(t, { env: ENV, routes: credsRoutes });
  const cases = [
    { 'x-iaedu-key': '' },
    { 'x-iaedu-key': '', 'x-iaedu-agent': '', 'x-iaedu-channel': '' },
    { 'x-iaedu-key': '   ', 'x-iaedu-agent': '  ', 'x-iaedu-channel': ' ' },
    { 'x-iaedu-key': 'sk-usr-own', 'x-iaedu-agent': 'a', 'x-iaedu-channel': '   ' },
  ];
  for (const headers of cases) {
    const r = await app.call('GET', '/_need', { headers });
    assert.equal(r.status, 400, JSON.stringify(headers));
    assert.equal(r.json.erro, 'Indique a chave, o ID do agente e o ID do canal IAedu.');
    assert.equal((await app.call('GET', '/_creds', { headers })).json.creds, null);
  }
});

test('credentials: nothing configured gives 503 when a route needs them', async (t) => {
  const app = await startApp(t, { env: { IAEDU_API_KEY: 'sk-usr-shared' }, routes: credsRoutes }); // agent and channel missing
  assert.equal((await app.call('GET', '/_creds')).json.creds, null);
  const r = await app.call('GET', '/_need');
  assert.equal(r.status, 503);
  assert.ok(typeof r.json.erro === 'string');
  assert.equal((await app.call('GET', '/_need?modelo=amalia')).status, 503);
  assert.equal((await app.call('GET', '/_need', { headers: OWN })).status, 200);
});

// ---------------------------------------------------------------- the router and the errors

test('routes: params are decoded, a handler may return data or throw HttpError', async (t) => {
  const app = await startApp(t, {
    routes(route) {
      route('GET', '/ecos/:nome/itens/:n', (req, res, ctx) => ({ params: ctx.params, user: ctx.user }), 'public');
      route('POST', '/ecos', (req, res, ctx) => ({ body: ctx.body }), 'public');
      route('GET', '/recusa', () => {
        throw new HttpError(409, 'Já existe.');
      }, 'public');
      route('GET', '/directo', (req, res) => {
        res.writeHead(201, { 'content-type': 'application/json' });
        res.end('{"directo":true}');
      }, 'public');
      route('GET', '/privado', (req, res, ctx) => ({ quem: ctx.user.name }));
      route('GET', '/muda', () => undefined, 'public');
    },
  });
  const r = await app.call('GET', '/ecos/Ana%20Maria/itens/7');
  assert.deepEqual(r.json, { params: { nome: 'Ana Maria', n: '7' }, user: null });
  assert.deepEqual((await app.call('POST', '/ecos', { body: { a: 1 } })).json, { body: { a: 1 } });
  assert.deepEqual((await app.call('POST', '/ecos')).json, { body: {} }); // no body is an empty object
  const conflict = await app.call('GET', '/recusa');
  assert.equal(conflict.status, 409);
  assert.deepEqual(conflict.json, { erro: 'Já existe.' });
  const direct = await app.call('GET', '/directo');
  assert.equal(direct.status, 201);
  assert.deepEqual(direct.json, { directo: true });
  assert.equal((await app.call('GET', '/privado')).status, 401); // routes are private unless made public
  const { cookie } = await app.person('Ana');
  assert.deepEqual((await app.call('GET', '/privado', { cookie })).json, { quem: 'Ana' });
  assert.equal((await app.call('GET', '/muda')).status, 500); // a handler that does not answer is a bug
});

test('an unexpected error returns 500 with a fixed message and logs no message', async (t) => {
  const app = await startApp(t, {
    routes(route) {
      route('GET', '/boom', () => {
        throw new Error(`falha com ${KEY} e texto do rascunho`);
      }, 'public');
    },
  });
  const r = await app.call('GET', '/boom', { headers: { 'x-iaedu-key': KEY } });
  assert.equal(r.status, 500);
  assert.deepEqual(r.json, { erro: 'Erro interno do servidor.' });
  await settle();
  assert.equal(app.errorStream.lines.length, 1);
  const entry = JSON.parse(app.errorStream.lines[0]);
  assert.equal(entry.evento, 'erro');
  const everything = app.logStream.lines.join('\n') + app.errorStream.lines.join('\n');
  assert.ok(!everything.includes(KEY) && !everything.includes('rascunho'));
  assert.equal(JSON.parse(app.logStream.lines[0]).status, 500);
  assert.equal((await app.call('GET', '/saude')).status, 200); // the server goes on
});

test('an IaeduError from a handler becomes an HTTP error that is not 401', async (t) => {
  const app = await startApp(t, {
    routes(route) {
      route('GET', '/ia/:codigo', (req, res, ctx) => {
        throw new IaeduError(ctx.params.codigo);
      }, 'public');
    },
  });
  const expected = { auth: 502, limite: 429, servico: 502, tempo: 504, formato: 502 };
  for (const [code, status] of Object.entries(expected)) {
    const r = await app.call('GET', `/ia/${code}`);
    assert.equal(r.status, status, code);
    assert.equal(r.json.erro, new IaeduError(code).messagePt);
    assert.equal(r.json.motivo, code);
  }
});

test('the server needs a store and an auth', () => {
  assert.throws(() => createServer({}), TypeError);
});

// ---------------------------------------------------------------- main

test('loadConfig: refuses a missing or short EUNOMIA_SECRET with a Portuguese message', () => {
  assert.throws(() => loadConfig({}), /EUNOMIA_SECRET/);
  assert.throws(() => loadConfig({ EUNOMIA_SECRET: 'curto' }), /32/);
});

test('loadConfig: defaults and values from the environment', () => {
  const cfg = loadConfig({ EUNOMIA_SECRET: SECRET });
  assert.equal(cfg.secret, SECRET);
  assert.equal(cfg.dataDir, './data');
  assert.equal(cfg.dailyLimit, 200);
  assert.equal(cfg.draftRetentionDays, 365);
  assert.equal(cfg.iaeduBaseUrl, 'https://api.iaedu.pt/agent-chat/api/v1');
  assert.equal(cfg.basePath, '/fmup-ia/eunomia/api');
  assert.deepEqual(cfg.github, { token: null, repo: 'tiagojct/fmup-ia', branch: 'main', commitName: null, commitEmail: null });

  const custom = loadConfig({
    EUNOMIA_SECRET: SECRET,
    EUNOMIA_DATA: '/dados',
    EUNOMIA_DAILY_LIMIT: '50',
    EUNOMIA_DRAFT_RETENTION_DAYS: '30',
    IAEDU_BASE_URL: 'http://localhost:9/x',
    GITHUB_TOKEN: 'ghp_x',
    GITHUB_REPO: 'a/b',
    GITHUB_BRANCH: 'dev',
    COMMIT_NAME: 'Nome',
    COMMIT_EMAIL: 'n@example.org',
  });
  assert.equal(custom.dataDir, '/dados');
  assert.equal(custom.dailyLimit, 50);
  assert.equal(custom.draftRetentionDays, 30);
  assert.equal(custom.iaeduBaseUrl, 'http://localhost:9/x');
  assert.deepEqual(custom.github, { token: 'ghp_x', repo: 'a/b', branch: 'dev', commitName: 'Nome', commitEmail: 'n@example.org' });
});

test('loadConfig: a number that is not a positive integer is refused', () => {
  for (const bad of ['0', '-1', 'muitos', '1.5']) {
    assert.throws(() => loadConfig({ EUNOMIA_SECRET: SECRET, EUNOMIA_DAILY_LIMIT: bad }), /EUNOMIA_DAILY_LIMIT/);
    assert.throws(() => loadConfig({ EUNOMIA_SECRET: SECRET, EUNOMIA_DRAFT_RETENTION_DAYS: bad }), /EUNOMIA_DRAFT_RETENTION_DAYS/);
  }
});

test('main.js refuses to start without EUNOMIA_SECRET: exit 1 and a Portuguese message on stderr', () => {
  const main = path.join(__dirname, '..', 'src', 'main.js');
  for (const env of [{}, { EUNOMIA_SECRET: 'curto' }]) {
    const r = spawnSync(process.execPath, [main], { env: { PATH: process.env.PATH, ...env }, encoding: 'utf8', timeout: 10000 });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /EUNOMIA_SECRET/);
    assert.match(r.stderr, /32 caracteres/);
    assert.equal(r.stdout, '');
  }
});

test('start: serves /saude and /login from the environment, then closes', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eunomia-main-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const logStream = capture();
  const server = await start({ EUNOMIA_SECRET: SECRET, EUNOMIA_DATA: dir }, { port: 0, host: '127.0.0.1', logStream });
  t.after(() => {
    server.closeAllConnections();
    return new Promise((resolve) => server.close(resolve));
  });
  const url = `http://127.0.0.1:${server.address().port}${BASE}`;
  assert.deepEqual(await (await fetch(`${url}/saude`)).json(), { ok: true });
  const auth = createAuth({ store: createStore(dir), secret: SECRET });
  const { code } = auth.addCode('Ana', 'teacher'); // as bin/codes.js does, in another process
  const login = await fetch(`${url}/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ codigo: code }) });
  assert.equal(login.status, 200);
  assert.equal((await login.json()).nome, 'Ana');
});

test('start: a data folder that cannot be written stops the start with a Portuguese message', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eunomia-main-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const notAFolder = path.join(dir, 'ficheiro');
  fs.writeFileSync(notAFolder, 'x');
  await assert.rejects(start({ EUNOMIA_SECRET: SECRET, EUNOMIA_DATA: notAFolder }, { port: 0, host: '127.0.0.1' }), /pasta de dados/);
});
