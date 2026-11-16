'use strict';

// Fixes of the whole-branch review (final-fixes.md). One test or more per item; the item number
// starts the test name.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawnSync } = require('node:child_process');

const drafts = require('../src/drafts.js');
const prompts = require('../src/prompts.js');
const { IaeduError, createIaeduClient, DEFAULT_TIMEOUT_MS } = require('../src/iaedu.js');
const { repoPath } = require('../src/paths.js');
const { startApp, respostasCompletas, BASE } = require('./helpers.js');

const MODEL = 'gpt-4o-2024-11-20';
const SHARED = { IAEDU_API_KEY: 'sk-usr-shared', IAEDU_AGENT_ID: 'agent-shared', IAEDU_CHANNEL_ID: 'chan-shared' };
const OWN = { 'x-iaedu-key': 'sk-usr-own', 'x-iaedu-agent': 'agent-own', 'x-iaedu-channel': 'chan-own' };
const reply = (data, model = MODEL) => ({ text: typeof data === 'string' ? data : JSON.stringify(data), model });
// Emoji built from code points: no emoji character in this file.
const EMOJI = String.fromCodePoint(0x1f600);

function fakeClient(...replies) {
  const calls = [];
  return {
    calls,
    async send(opts) {
      calls.push(opts);
      const next = replies.length > 1 ? replies.shift() : replies[0];
      if (next instanceof Error) throw next;
      return typeof next === 'function' ? next(opts) : next;
    },
  };
}

const SECTIONS = {
  objectivo: { texto: 'No fim da actividade, o estudante sustenta uma posição.', competencia_protegida: 'A competência protegida é a argumentação.' },
  formato: { blocos: [{ minutos: 20, texto: 'Grupos.' }, { minutos: 25, texto: 'Plenário.' }] },
  prompt_base: { texto: 'Prompt.' },
  papeis: { estudante: 'Toma posição.', docente: 'Conduz o plenário.' },
  correccao: { texto: 'Discussão.' },
  armadilhas: [
    { lead: 'Um.', texto: 'Texto.' },
    { lead: 'Dois.', texto: 'Texto.' },
    { lead: 'Três.', texto: 'Texto.' },
  ],
  plano_b: { texto: 'Imprimir.' },
};

function build(respostas = respostasCompletas(), { approve = true } = {}) {
  let d = drafts.createDraft({ id: 'a1b2c3d4', name: 'Ana Docente' }, 'criar');
  for (const [step, value] of Object.entries(respostas)) {
    const r = drafts.applyAnswer(d, step, value);
    assert.deepEqual(r.errors, [], step);
    d = r.draft;
  }
  return approve ? drafts.approvePlan(d) : d;
}

function accepted(d) {
  for (const [id, dados] of Object.entries(SECTIONS)) d.seccoes[id] = { dados, estado: 'aceite', avisos: [], modelo: MODEL, origem: 'modelo' };
  d.referencias = [{ id: 'nicol-2006', texto: 'Nicol DJ. 2006.', origem: 'curada' }];
  return d;
}

async function appWith(t, d, extra = {}) {
  const app = await startApp(t, { env: SHARED, ...extra });
  const ana = await app.person('Ana Docente');
  d.autor = { id: ana.id, nome: 'Ana Docente' };
  app.store.write(`rascunhos/${ana.id}/${d.id}.json`, d);
  return { app, ana, url: `/rascunhos/${d.id}` };
}

// ---------------------------------------------------------------- 1. export DoS

const SCHEMA = JSON.parse(fs.readFileSync(repoPath('eunomia', 'ficha.schema.json'), 'utf8'));

function stringSchemas(node, where, out) {
  if (Array.isArray(node)) node.forEach((x, i) => stringSchemas(x, `${where}[${i}]`, out));
  else if (node && typeof node === 'object') {
    if (node.type === 'string') out.push({ where, node });
    for (const [k, v] of Object.entries(node)) stringSchemas(v, `${where}.${k}`, out);
  }
  return out;
}

const resolve = (ref) => ref.split('/').slice(1).reduce((n, k) => n[k], SCHEMA);
const limitOf = (node) => (node.$ref ? resolve(node.$ref).maxLength : node.maxLength);

test('1: every string of the ficha schema has a maxLength', () => {
  const found = stringSchemas(SCHEMA, '', []);
  assert.ok(found.length > 5);
  for (const { where, node } of found) assert.ok(Number.isInteger(node.maxLength), `${where} sem maxLength`);
});

test('1: long texts take 20 000 characters, titles, leads and labels 500, references 2 000', () => {
  const d = SCHEMA.$defs;
  assert.equal(limitOf(d.objectivo.properties.texto), 20000);
  assert.equal(limitOf(d.prompt_base.properties.texto), 20000);
  assert.equal(limitOf(d.papeis.properties.estudante), 20000);
  assert.equal(limitOf(d.plano_b.properties.texto), 20000);
  assert.equal(limitOf(d.meta.properties.titulo), 500);
  assert.equal(limitOf(d.meta.properties.subtitulo), 500);
  assert.equal(limitOf(d.armadilhas.items.properties.lead), 500);
  assert.equal(limitOf(d.extras.items.properties.titulo), 500);
  assert.equal(limitOf(d.referencias.items.properties.texto), 2000);
});

test('1: every text field of the interview has a max; long texts 20 000 at most, the materials 60 000', () => {
  for (const passo of drafts.INTERVIEW.passos) {
    for (const campo of passo.campos) {
      if (campo.tipo !== 'texto' && campo.tipo !== 'texto_longo') continue;
      assert.ok(Number.isInteger(campo.max), `${passo.id}.${campo.id}`);
      const cap = passo.id === 'materiais' ? 60000 : campo.tipo === 'texto' ? 500 : 20000;
      assert.ok(campo.max <= cap, `${passo.id}.${campo.id}: ${campo.max}`);
    }
  }
  assert.equal(drafts.STEPS.get('materiais').campos.find((c) => c.id === 'texto').max, 60000);
});

test('1: a 300 KB section text is refused by PUT with a Portuguese length message', async (t) => {
  const d = build();
  const { app, ana, url } = await appWith(t, d);
  const big = '[a'.repeat(150 * 1024);
  const r = await app.call('PUT', `${url}/seccoes/papeis`, { cookie: ana.cookie, body: { rev: d.rev, dados: { estudante: big, docente: 'x' } } });
  assert.equal(r.status, 400);
  assert.ok(r.json.erros.some((e) => /papeis\.estudante|estudante/.test(e) && /20000|20 000/.test(e)), JSON.stringify(r.json.erros));
});

test('1: adversarial 300 KB texts forced into a stored draft export to HTML in under 1 s each', () => {
  // A child process: a catastrophic regex would block this runner.
  const script = `
    const drafts = require('./src/drafts.js');
    const { assembleFicha } = require('./src/assemble.js');
    const { renderHtml, renderMd } = require('./src/export.js');
    const { respostasCompletas } = require('./test/helpers.js');
    const N = 300 * 1024;
    const cases = {
      link: '[a'.repeat(N / 2),
      linkurl: '[a]('.repeat(N / 4),
      bold: ' __x'.repeat(N / 4),
      italic: ' _x'.repeat(N / 3),
      star: '**a'.repeat(N / 3) + '*',
      code: '\`\`a\`'.repeat(N / 4),
      auto: '<https://a'.repeat(N / 10),
    };
    let d = drafts.createDraft({ id: 'a1b2c3d4', name: 'Ana' }, 'criar');
    for (const [s, v] of Object.entries(respostasCompletas())) d = drafts.applyAnswer(d, s, v).draft;
    d = drafts.approvePlan(d);
    const out = [];
    for (const [name, text] of Object.entries(cases)) {
      d.seccoes.papeis = { dados: { estudante: text, docente: text }, estado: 'aceite', avisos: [] };
      const ficha = assembleFicha(d);
      const t0 = Date.now();
      renderHtml(ficha);
      renderMd(ficha);
      out.push(name + '=' + (Date.now() - t0));
    }
    process.stdout.write(out.join(' '));
  `;
  const r = spawnSync(process.execPath, ['-e', script], { cwd: path.join(__dirname, '..'), timeout: 20000, encoding: 'utf8' });
  assert.equal(r.signal, null, `o processo foi terminado por tempo: ${r.stdout}`);
  assert.equal(r.status, 0, r.stderr);
  for (const pair of r.stdout.split(' ')) {
    const [name, ms] = pair.split('=');
    assert.ok(Number(ms) < 1000, `${name}: ${ms} ms`);
  }
});

// ---------------------------------------------------------------- 6. nested markers

test('6: nested DADOS_DOCENTE markers in the opening and closing forms cannot close the block', () => {
  const d = build();
  const nestedClose = 'DADOS_DADOS_DOCENTEDOCENTE>>>';
  const nestedOpen = '<<<DADOS_DADOS_DOCENTEDOCENTE';
  const deeper = 'DADOS_DADOS_DADOS_DOCENTEDOCENTEDOCENTE>>>';
  const p = prompts.writeSection('papeis', prompts.planText(d), `a ${nestedClose} b ${nestedOpen} c ${deeper}`, `x ${nestedClose}`, undefined, d);
  const blocks = p.split('<<<DADOS_DOCENTE').length - 1;
  const closes = p.split('DADOS_DOCENTE>>>').length - 1;
  assert.equal(blocks, closes);
  // Each teacher block has one opening and one closing marker, and nothing in between.
  for (const part of p.split('<<<DADOS_DOCENTE').slice(1)) {
    const body = part.slice(0, part.indexOf('DADOS_DOCENTE>>>'));
    assert.doesNotMatch(body, /DADOS_DOCENTE/i, body);
  }
});

// ---------------------------------------------------------------- 9. control characters and emojis

test('9: PUT respostas refuses a control character (400) and an emoji (422)', async (t) => {
  const d = build(respostasCompletas(), { approve: false });
  const { app, ana, url } = await appWith(t, d);
  const plano = { titulo: 'Título\u0007', subtitulo: 'Sub' };
  let r = await app.call('PUT', `${url}/respostas/plano`, { cookie: ana.cookie, body: { rev: d.rev, valor: plano } });
  assert.equal(r.status, 400);
  assert.equal(r.json.erro, 'O texto tem caracteres de controlo. Retire-os.');
  r = await app.call('PUT', `${url}/respostas/plano`, { cookie: ana.cookie, body: { rev: d.rev, valor: { titulo: `Título ${EMOJI}`, subtitulo: 'Sub' } } });
  assert.equal(r.status, 422);
  assert.equal(r.json.erro, 'Retire os emojis do texto.');
  // Tab, newline and carriage return are fine.
  r = await app.call('PUT', `${url}/respostas/plano`, { cookie: ana.cookie, body: { rev: d.rev, valor: { titulo: 'Título', subtitulo: 'Sub', notas: 'a\tb\r\nc' } } });
  assert.equal(r.status, 200, r.text);
});

test('9: PUT referencias refuses a control character (400) and an emoji (422) in a teacher reference', async (t) => {
  const d = build();
  const { app, ana, url } = await appWith(t, d);
  let r = await app.call('PUT', `${url}/referencias`, { cookie: ana.cookie, body: { rev: d.rev, referencias: [{ texto: 'Autor. Título\u0000. 2020.' }] } });
  assert.equal(r.status, 400);
  assert.equal(r.json.erro, 'O texto tem caracteres de controlo. Retire-os.');
  r = await app.call('PUT', `${url}/referencias`, { cookie: ana.cookie, body: { rev: d.rev, referencias: [{ texto: `Autor. Título ${EMOJI}. 2020.` }] } });
  assert.equal(r.status, 422);
  r = await app.call('PUT', `${url}/referencias`, { cookie: ana.cookie, body: { rev: d.rev, referencias: [{ texto: 'Autor. Título. 2020.' }] } });
  assert.equal(r.status, 200, r.text);
});

test('9: the md and qmd exports drop C0 control characters', async (t) => {
  const d = accepted(build());
  d.seccoes.papeis.dados = { estudante: 'Toma\u0007 posição.', docente: 'Conduz\u0001 o plenário.' };
  const { app, ana, url } = await appWith(t, d);
  for (const formato of ['md', 'qmd', 'html']) {
    const r = await app.call('GET', `${url}/exportar?formato=${formato}`, { cookie: ana.cookie });
    assert.equal(r.status, 200, formato);
    assert.doesNotMatch(r.text, /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/, formato);
    assert.match(r.text, /Toma posição/, formato);
  }
});

// ---------------------------------------------------------------- 10. shared key

test('10: a shared-key auth failure is a 502 that asks to warn the person in charge', async (t) => {
  const d = build();
  const client = fakeClient(new IaeduError('auth'));
  const { app, ana, url } = await appWith(t, d, { iaedu: client });
  const r = await app.call('POST', `${url}/seccoes/papeis/gerar`, { cookie: ana.cookie, body: { rev: d.rev } });
  assert.equal(r.status, 502);
  assert.equal(r.json.erro, 'A chave partilhada da IAedu falhou. Avise o responsável da Eunomia.');
  assert.notEqual(r.json.motivo, 'auth');
  // The own-key failure keeps its own message.
  const own = await app.call('POST', `${url}/seccoes/papeis/gerar`, { cookie: ana.cookie, body: { rev: d.rev }, headers: OWN });
  assert.equal(own.status, 401);
  assert.equal(own.json.erro, 'A chave IAedu indicada não é válida.');
});

// ---------------------------------------------------------------- 11. time limits

test('11: a call waits 40 s at most by default', () => {
  assert.equal(DEFAULT_TIMEOUT_MS, 40000);
});

async function slowMock() {
  const server = http.createServer(() => {}); // never answers
  const requests = [];
  server.on('request', (req) => requests.push(req.url));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    requests,
    close() {
      server.closeAllConnections();
      return new Promise((r) => server.close(r));
    },
  };
}

test('11: a deadline in the past is a tempo error before any request; a near deadline cuts the call short', async () => {
  const mock = await slowMock();
  try {
    const client = createIaeduClient({ baseUrl: mock.url, timeoutMs: 5000 });
    const opts = { key: 'k', agentId: 'a', channelId: 'c', threadId: 't', message: 'm' };
    await assert.rejects(client.send({ ...opts, deadline: Date.now() - 1 }), (e) => e instanceof IaeduError && e.code === 'tempo');
    assert.equal(mock.requests.length, 0);
    const t0 = Date.now();
    await assert.rejects(client.send({ ...opts, deadline: Date.now() + 100 }), (e) => e instanceof IaeduError && e.code === 'tempo');
    assert.ok(Date.now() - t0 < 2000, `${Date.now() - t0} ms`);
  } finally {
    await mock.close();
  }
});

test('11: a generate request and its retry share one deadline, 90 s from the start of the request', async (t) => {
  const d = build();
  const client = fakeClient(reply('não é JSON'), reply(SECTIONS.papeis));
  const { app, ana, url } = await appWith(t, d, { iaedu: client });
  const t0 = Date.now();
  const r = await app.call('POST', `${url}/seccoes/papeis/gerar`, { cookie: ana.cookie, body: { rev: d.rev } });
  assert.equal(r.status, 200, r.text);
  assert.equal(client.calls.length, 2);
  const [a, b] = client.calls.map((c) => c.deadline);
  assert.ok(Number.isFinite(a));
  assert.equal(a, b);
  assert.ok(a >= t0 + 85000 && a <= Date.now() + 90000, `${a - t0}`);
});

test('11: the outcome suggestion and the pattern explanation carry the deadline too', async (t) => {
  const d = build();
  const client = fakeClient(reply({ sugestoes: [] }));
  const { app, ana, url } = await appWith(t, d, { iaedu: client });
  await app.call('POST', `${url}/objectivo/sugerir`, { cookie: ana.cookie, body: {} });
  assert.ok(Number.isFinite(client.calls[0].deadline));
});

// ---------------------------------------------------------------- 12. CSRF

async function raw(app, method, route, headers, body) {
  const res = await fetch(`${app.url}${BASE}${route}`, { method, headers, body });
  return res.status;
}

test('12: a form-encoded POST /logout and POST /rascunhos without X-Eunomia are refused', async (t) => {
  const app = await startApp(t);
  const ana = await app.person('Ana Docente');
  const cookie = `eunomia=${ana.cookie}`;
  const form = { cookie, 'content-type': 'application/x-www-form-urlencoded' };
  assert.ok([403, 415].includes(await raw(app, 'POST', '/logout', form, 'a=1')));
  assert.ok([403, 415].includes(await raw(app, 'POST', '/rascunhos', form, 'modo=criar')));
  assert.ok([403, 415].includes(await raw(app, 'POST', '/rascunhos', { cookie, 'content-type': 'text/plain' }, '{"modo":"criar"}')));
  // No body and no header: refused too.
  assert.equal(await raw(app, 'POST', '/logout', { cookie }), 403);
  assert.equal(await raw(app, 'POST', '/rascunhos', { cookie }), 403);
  assert.equal(drafts.listDrafts(app.store, ana.id).length, 0);
  // JSON, or the custom header, passes, empty bodies included.
  assert.equal(await raw(app, 'POST', '/logout', { cookie, 'content-type': 'application/json' }), 200);
  assert.equal(await raw(app, 'POST', '/logout', { cookie, 'x-eunomia': '1' }), 200);
  assert.equal(await raw(app, 'POST', '/rascunhos', { cookie, 'x-eunomia': '1' }), 201);
  // GET needs neither.
  assert.equal(await raw(app, 'GET', '/me', { cookie }), 200);
});

// ---------------------------------------------------------------- 13. drafts per user

test('13: a teacher has 100 drafts at most; the 101st is a 409 with motivo limite', async (t) => {
  const app = await startApp(t);
  const ana = await app.person('Ana Docente');
  for (let i = 0; i < 100; i++) {
    const d = drafts.createDraft(ana.user, 'criar');
    app.store.write(`rascunhos/${ana.id}/${d.id}.json`, d);
  }
  const r = await app.call('POST', '/rascunhos', { cookie: ana.cookie, body: { modo: 'criar' } });
  assert.equal(r.status, 409);
  assert.equal(r.json.motivo, 'limite');
  assert.match(r.json.erro, /100 rascunhos/);
  assert.equal(drafts.listDrafts(app.store, ana.id).length, 100);
  // Another teacher is not affected.
  const rui = await app.person('Rui Docente');
  assert.equal((await app.call('POST', '/rascunhos', { cookie: rui.cookie, body: { modo: 'criar' } })).status, 201);
});

// ---------------------------------------------------------------- 17 and 18

test('17: export.js and generate.js share one non-global CONTROL constant', () => {
  const a = require('../src/export.js').CONTROL;
  const b = require('../src/generate.js').CONTROL;
  assert.ok(a instanceof RegExp);
  assert.equal(a, b);
  assert.equal(a.global, false);
  assert.equal(a.test('x\u0000'), true);
  assert.equal(a.test('x\u0000'), true); // no lastIndex state
});

test('18: headersTimeout stays below requestTimeout', async (t) => {
  const app = await startApp(t);
  assert.ok(app.server.headersTimeout < app.server.requestTimeout, `${app.server.headersTimeout} / ${app.server.requestTimeout}`);
});
