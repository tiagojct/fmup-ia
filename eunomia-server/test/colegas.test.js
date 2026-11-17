'use strict';

// Eunomia 0.3, colleagues who are reluctant to share: the admin reads the draft of another author
// only after the author has submitted it. Before that, the draft does not exist for the admin: every
// route answers as for a missing draft (404, same message), so the admin cannot tell it is there.

const test = require('node:test');
const assert = require('node:assert/strict');

const drafts = require('../src/drafts.js');
const { REFERENCES } = require('../src/assemble.js');
const { startApp, respostasCompletas } = require('./helpers.js');

const MODEL = 'gpt-4o-2024-11-20';
const T = Date.UTC(2026, 10, 17, 12, 0, 0);
const SHARED = { IAEDU_API_KEY: 'sk-usr-shared', IAEDU_AGENT_ID: 'agent-shared', IAEDU_CHANNEL_ID: 'chan-shared' };
const NOT_FOUND = 'Rascunho não encontrado.';

const SECTIONS = {
  objectivo: { texto: 'No fim da actividade, o estudante sustenta uma posição.', competencia_protegida: 'A competência protegida é a argumentação.' },
  formato: { blocos: [{ minutos: 20, texto: 'Grupos.' }, { minutos: 25, texto: 'Plenário.' }] },
  prompt_base: { texto: '```text\nVais assumir o papel de um oponente.\n```' },
  papeis: { estudante: 'Toma posição.', docente: 'Conduz o plenário.' },
  correccao: { texto: '1. **O que mudou?** Cada grupo responde.' },
  armadilhas: [
    { lead: 'Deriva para o consenso.', texto: 'Texto.' },
    { lead: 'Evidência inventada.', texto: 'Texto.' },
    { lead: 'Posição da ferramenta.', texto: 'Texto.' },
  ],
  plano_b: { texto: 'Imprimir as objecções.' },
};

// A complete draft: every answer, the plan approved, every section accepted, ready to submit.
function fullDraft(user, over = {}) {
  let d = drafts.createDraft(user, 'criar', T);
  for (const [step, value] of Object.entries(respostasCompletas())) d = drafts.applyAnswer(d, step, value).draft;
  d = drafts.approvePlan(d);
  for (const [id, dados] of Object.entries(SECTIONS)) {
    d.seccoes[id] = { dados, estado: 'aceite', avisos: [], modelo: MODEL, origem: 'modelo' };
  }
  d.referencias = [{ id: 'nicol-2006', texto: REFERENCES.find((r) => r.id === 'nicol-2006').texto, origem: 'curada' }];
  return Object.assign(d, over);
}

const fileOf = (person, d) => `rascunhos/${person.id}/${d.id}.json`;

function put(app, person, over = {}) {
  const d = fullDraft(person.user, over);
  app.store.write(fileOf(person, d), d);
  return d;
}

// An app with a teacher, a second teacher and an admin. The model client counts its calls, so that a
// test can show that a refused request never reached the model.
async function setup(t) {
  const calls = { n: 0 };
  const iaedu = {
    send: async () => {
      calls.n += 1;
      return { text: '{}', model: MODEL };
    },
  };
  const app = await startApp(t, { now: () => T, iaedu, env: SHARED });
  const ana = await app.person('Ana Docente');
  const rui = await app.person('Rui Docente');
  const admin = await app.person('Tiago', 'admin');
  return { app, ana, rui, admin, calls };
}

const get = (app, who, route) => app.call('GET', route, { cookie: who.cookie });
const submit = (app, ana, d) => app.call('POST', `/rascunhos/${d.id}/submeter`, { cookie: ana.cookie, body: { rev: d.rev } });

// What an admin gets for a draft that does not exist.
async function missing(app, admin) {
  const r = await get(app, admin, '/rascunhos/aaaaaaaaaaaa');
  assert.equal(r.status, 404);
  assert.equal(r.json.erro, NOT_FOUND);
  return r.json;
}

// ---------------------------------------------------------------- reading

test('the admin gets 404 on GET /rascunhos/:id of a draft in rascunho, with or without an approved plan', async (t) => {
  const { app, ana, admin } = await setup(t);
  const gone = await missing(app, admin);
  const approved = put(app, ana);
  const open = put(app, ana, { plano_aprovado: false });
  for (const d of [approved, open]) {
    assert.equal(d.estado, 'rascunho');
    const r = await get(app, admin, `/rascunhos/${d.id}`);
    assert.equal(r.status, 404, `plano_aprovado ${d.plano_aprovado}`);
    // The same body as for a draft that does not exist: the admin cannot tell the two apart.
    assert.deepEqual(r.json, gone);
  }
});

test('the admin reads the draft once the author submits it, and after it is returned or approved', async (t) => {
  const { app, ana, admin } = await setup(t);
  const d = put(app, ana);
  assert.equal((await get(app, admin, `/rascunhos/${d.id}`)).status, 404);

  const sent = await submit(app, ana, d);
  assert.equal(sent.status, 200);
  assert.equal(sent.json.rascunho.estado, 'submetida');
  const seen = await get(app, admin, `/rascunhos/${d.id}`);
  assert.equal(seen.status, 200);
  assert.equal(seen.json.rascunho.id, d.id);
  assert.equal(seen.json.rascunho.autor.id, ana.id);

  const back = await app.call('POST', `/revisao/${d.id}/devolver`, {
    cookie: admin.cookie,
    body: { rev: sent.json.rascunho.rev, comentario: 'Reveja o formato.' },
  });
  assert.equal(back.status, 200);
  assert.equal(back.json.rascunho.estado, 'devolvida');
  assert.equal((await get(app, admin, `/rascunhos/${d.id}`)).status, 200);

  // The author edits and submits again, and the admin approves.
  const again = await submit(app, ana, back.json.rascunho);
  assert.equal(again.status, 200);
  const ok = await app.call('POST', `/revisao/${d.id}/aprovar`, { cookie: admin.cookie, body: { rev: again.json.rascunho.rev } });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.rascunho.estado, 'aprovada');
  assert.equal((await get(app, admin, `/rascunhos/${d.id}`)).status, 200);
});

test('the admin gets 404 on a draft in rejeitada or substituida', async (t) => {
  const { app, ana, admin } = await setup(t);
  for (const estado of ['rejeitada', 'substituida']) {
    const d = put(app, ana, { estado });
    assert.equal((await get(app, admin, `/rascunhos/${d.id}`)).status, 404, estado);
  }
});

test('the admin reads a submitted draft of any teacher, and a draft of their own in any state', async (t) => {
  const { app, ana, rui, admin } = await setup(t);
  const a = put(app, ana, { estado: 'submetida', submetida: new Date(T).toISOString() });
  const r = put(app, rui, { estado: 'submetida', submetida: new Date(T).toISOString() });
  assert.equal((await get(app, admin, `/rascunhos/${a.id}`)).status, 200);
  assert.equal((await get(app, admin, `/rascunhos/${r.id}`)).status, 200);
  // The admin is also an author: the drafts of their own stay readable in estado rascunho.
  const own = put(app, admin);
  assert.equal(own.estado, 'rascunho');
  assert.equal((await get(app, admin, `/rascunhos/${own.id}`)).status, 200);
  assert.equal((await get(app, admin, `/rascunhos/${own.id}/exportar?formato=md`)).status, 200);
});

// ---------------------------------------------------------------- exports, final check, patterns

test('exportar, verificacao-final and /padroes are 404 for the admin until the draft is submitted', async (t) => {
  const { app, ana, admin } = await setup(t);
  const d = put(app, ana);
  const routes = [
    `/rascunhos/${d.id}/exportar?formato=html`,
    `/rascunhos/${d.id}/exportar?formato=qmd`,
    `/rascunhos/${d.id}/exportar?formato=docx`,
    `/rascunhos/${d.id}/exportar?formato=folheto`,
    `/rascunhos/${d.id}/verificacao-final`,
    `/padroes?rascunho=${d.id}`,
  ];
  for (const route of routes) {
    const r = await get(app, admin, route);
    assert.equal(r.status, 404, route);
    assert.equal(r.json.erro, NOT_FOUND, route);
  }
  // The author reads all of them.
  for (const route of routes) assert.equal((await get(app, ana, route)).status, 200, `author ${route}`);

  assert.equal((await submit(app, ana, d)).status, 200);
  for (const route of routes) assert.equal((await get(app, admin, route)).status, 200, `after submitting ${route}`);
});

// ---------------------------------------------------------------- writes and model routes

test('every write and every model route is 404 for the admin on an unsubmitted draft, and the model is not called', async (t) => {
  const { app, ana, admin, calls } = await setup(t);
  const d = put(app, ana, { plano_aprovado: true });
  const before = app.store.read(fileOf(ana, d));
  const body = { rev: d.rev };
  const attempts = [
    ['PUT', `/rascunhos/${d.id}/respostas/contexto`, { rev: d.rev, valor: respostasCompletas().contexto }],
    ['POST', `/rascunhos/${d.id}/plano/aprovar`, body],
    ['POST', `/rascunhos/${d.id}/objectivo/sugerir`, { ...body, texto: 'Que o estudante argumente.' }],
    ['POST', `/rascunhos/${d.id}/padroes/explicar`, body],
    ['POST', `/rascunhos/${d.id}/seccoes/objectivo/gerar`, body],
    ['PUT', `/rascunhos/${d.id}/seccoes/objectivo`, { ...body, dados: SECTIONS.objectivo }],
    ['POST', `/rascunhos/${d.id}/seccoes/objectivo/repor`, body],
    ['POST', `/rascunhos/${d.id}/seccoes/objectivo/aceitar`, body],
    ['POST', `/rascunhos/${d.id}/seccoes/objectivo/opiniao`, { ...body, util: true }],
    ['PUT', `/rascunhos/${d.id}/referencias`, { ...body, referencias: [] }],
    ['POST', `/rascunhos/${d.id}/submeter`, body],
    ['POST', `/rascunhos/${d.id}/duplicar`, {}],
    ['DELETE', `/rascunhos/${d.id}`, body],
    ['POST', `/revisao/${d.id}/aprovar`, body],
    ['POST', `/revisao/${d.id}/devolver`, { ...body, comentario: 'Reveja.' }],
  ];
  for (const [method, route, payload] of attempts) {
    const r = await app.call(method, route, { cookie: admin.cookie, body: payload });
    assert.equal(r.status, 404, `${method} ${route}`);
    assert.equal(r.json.erro, NOT_FOUND, `${method} ${route}`);
  }
  assert.equal(calls.n, 0);
  assert.deepEqual(app.store.read(fileOf(ana, d)), before);
  assert.deepEqual(app.store.list(`rascunhos/${admin.id}`), []);
});

test('on a submitted draft the admin still cannot write: 403, and the model is not called', async (t) => {
  const { app, ana, admin, calls } = await setup(t);
  const d = put(app, ana, { estado: 'submetida', submetida: new Date(T).toISOString() });
  const attempts = [
    ['PUT', `/rascunhos/${d.id}/respostas/contexto`, { rev: d.rev, valor: respostasCompletas().contexto }],
    ['POST', `/rascunhos/${d.id}/objectivo/sugerir`, { rev: d.rev, texto: 'Que o estudante argumente.' }],
    ['POST', `/rascunhos/${d.id}/seccoes/objectivo/gerar`, { rev: d.rev }],
    ['POST', `/rascunhos/${d.id}/duplicar`, {}],
    ['DELETE', `/rascunhos/${d.id}`, { rev: d.rev }],
  ];
  for (const [method, route, payload] of attempts) {
    const r = await app.call(method, route, { cookie: admin.cookie, body: payload });
    assert.equal(r.status, 403, `${method} ${route}`);
  }
  assert.equal(calls.n, 0);
});

test('a decision on a draft in rascunho is 404 for the admin; on a returned draft it is still 409 estado', async (t) => {
  const { app, ana, admin } = await setup(t);
  const open = put(app, ana);
  const returned = put(app, ana, { estado: 'devolvida', revisao: { decisao: 'devolvida', comentario: 'Reveja.', data: new Date(T).toISOString(), revisor: 'Tiago' } });
  const aprovar = (d) => app.call('POST', `/revisao/${d.id}/aprovar`, { cookie: admin.cookie, body: { rev: d.rev } });
  const none = await aprovar(open);
  assert.equal(none.status, 404);
  assert.equal(none.json.erro, NOT_FOUND);
  const notWaiting = await aprovar(returned);
  assert.equal(notWaiting.status, 409);
  assert.equal(notWaiting.json.motivo, 'estado');
  assert.equal(app.store.read(fileOf(ana, open)).estado, 'rascunho');
});

// ---------------------------------------------------------------- unchanged

test('the author keeps full access in every state, and another teacher still gets 404', async (t) => {
  const { app, ana, rui, admin } = await setup(t);
  const d = put(app, ana);
  for (const route of [`/rascunhos/${d.id}`, `/rascunhos/${d.id}/exportar?formato=md`, `/rascunhos/${d.id}/verificacao-final`, `/padroes?rascunho=${d.id}`]) {
    assert.equal((await get(app, ana, route)).status, 200, route);
    assert.equal((await get(app, rui, route)).status, 404, `another teacher ${route}`);
  }
  const list = await get(app, ana, '/rascunhos');
  assert.deepEqual(list.json.rascunhos.map((x) => x.id), [d.id]);
  const edit = await app.call('PUT', `/rascunhos/${d.id}/seccoes/objectivo`, { cookie: ana.cookie, body: { rev: d.rev, dados: SECTIONS.objectivo } });
  assert.equal(edit.status, 200);
  const sent = await submit(app, ana, edit.json.rascunho);
  assert.equal(sent.status, 200);
  assert.equal((await get(app, ana, `/rascunhos/${d.id}`)).status, 200);
  assert.equal((await get(app, rui, `/rascunhos/${d.id}`)).status, 404);
  assert.equal((await get(app, admin, `/rascunhos/${d.id}`)).status, 200);
});

test('GET /uso still lists the counts of the drafts of a teacher, whatever their state', async (t) => {
  const { app, ana, admin } = await setup(t);
  put(app, ana);
  put(app, ana);
  const sent = put(app, ana);
  assert.equal((await submit(app, ana, sent)).status, 200);
  put(app, ana, { estado: 'devolvida' });
  const r = await get(app, admin, '/uso');
  assert.equal(r.status, 200);
  const row = r.json.utilizadores.find((u) => u.id === ana.id);
  assert.deepEqual(row.rascunhos, { rascunho: 2, submetida: 1, devolvida: 1 });
  // The usage page has the counts and never a title or a text of a draft.
  assert.equal(JSON.stringify(r.json).includes('Debate sobre o fim de vida'), false);
});
