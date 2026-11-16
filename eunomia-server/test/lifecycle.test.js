'use strict';

// The draft lifecycle of 0.2 (spec D3, D4): start from an example, duplicate, soft delete, and the
// public reference ficha of an example.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const drafts = require('../src/drafts.js');
const { createStore } = require('../src/store.js');
const { draftFromExample, referenceFicha } = require('../src/exemplos.js');
const { startApp, respostasCompletas } = require('./helpers.js');

const DAY_MS = 24 * 60 * 60 * 1000;

// A draft of this user with every answer, the plan approved and sections in several states, written
// straight to the store.
function storedDraft(app, person, over = {}) {
  let d = drafts.createDraft({ id: person.user.id, name: person.user.name }, 'criar', Date.now());
  for (const [step, value] of Object.entries(respostasCompletas())) {
    const r = drafts.applyAnswer(d, step, value);
    assert.deepEqual(r.errors, [], step);
    d = r.draft;
  }
  d = drafts.approvePlan(d);
  Object.assign(d, over);
  app.store.write(`rascunhos/${person.user.id}/${d.id}.json`, d);
  return d;
}

const OBJECTIVO = { texto: 'No fim, o estudante sustenta uma posição.', competencia_protegida: 'A argumentação.' };

test('POST /rascunhos with exemplo 1 makes a draft with the example answers and the plan not approved', async (t) => {
  const app = await startApp(t);
  const ana = await app.person('Ana Docente');
  const r = await app.call('POST', '/rascunhos', { cookie: ana.cookie, body: { modo: 'criar', exemplo: 1 } });
  assert.equal(r.status, 201);
  const expected = draftFromExample(ana.user, 1, Date.now());
  assert.deepEqual(r.json.rascunho.respostas, expected.respostas);
  assert.equal(r.json.rascunho.plano_aprovado, false);
  assert.equal(r.json.rascunho.estado, 'rascunho');
  assert.equal(r.json.rascunho.autor.id, ana.user.id);
  assert.equal(r.json.proximo_passo, 'plano');
  assert.ok(app.store.read(`rascunhos/${ana.user.id}/${r.json.rascunho.id}.json`, null));
});

test('exemplo 0, 7, "1" and 1.5 are 400 Exemplo desconhecido.', async (t) => {
  const app = await startApp(t);
  const ana = await app.person('Ana Docente');
  for (const exemplo of [0, 7, '1', 1.5, null]) {
    const r = await app.call('POST', '/rascunhos', { cookie: ana.cookie, body: { modo: 'criar', exemplo } });
    assert.equal(r.status, 400, String(exemplo));
    assert.equal(r.json.erro, 'Exemplo desconhecido.');
  }
  assert.deepEqual(app.store.list(`rascunhos/${ana.user.id}`), []);
});

test('at 100 drafts, a new draft, an example and a duplicate are 409 limite', async (t) => {
  const app = await startApp(t);
  const ana = await app.person('Ana Docente');
  const source = storedDraft(app, ana);
  for (let i = 1; i < 100; i += 1) {
    const d = drafts.createDraft({ id: ana.user.id, name: 'Ana' }, 'criar', Date.now());
    app.store.write(`rascunhos/${ana.user.id}/${d.id}.json`, d);
  }
  assert.equal(app.store.list(`rascunhos/${ana.user.id}`).length, 100);
  const calls = [
    ['POST', '/rascunhos', { modo: 'criar' }],
    ['POST', '/rascunhos', { modo: 'criar', exemplo: 2 }],
    ['POST', `/rascunhos/${source.id}/duplicar`, undefined],
  ];
  for (const [method, route, body] of calls) {
    const r = await app.call(method, route, { cookie: ana.cookie, body });
    assert.equal(r.status, 409, route);
    assert.equal(r.json.motivo, 'limite', route);
  }
  assert.equal(app.store.list(`rascunhos/${ana.user.id}`).length, 100);
});

test('duplicar copies the answers and the accepted sections only', async (t) => {
  const app = await startApp(t);
  const ana = await app.person('Ana Docente');
  const source = storedDraft(app, ana, { estado: 'submetida', rev: 7, threads: { objectivo: 'thread-1' } });
  source.seccoes.objectivo = {
    dados: OBJECTIVO,
    estado: 'aceite',
    avisos: [],
    modelo: 'gpt-4o',
    origem: 'modelo',
    anterior: { dados: { texto: 'Antes.', competencia_protegida: 'Antes.' }, estado: 'gerada', avisos: [], modelo: 'gpt-4o' },
    opiniao: { util: true, comentario: '', data: new Date().toISOString(), modelo: 'gpt-4o' },
  };
  source.seccoes.formato = { dados: { fases: [] }, estado: 'gerada', avisos: [], modelo: 'gpt-4o', origem: 'modelo' };
  source.referencias = [{ texto: 'Uma referência.', origem: 'docente' }];
  const file = `rascunhos/${ana.user.id}/${source.id}.json`;
  app.store.write(file, source);
  const before = fs.readFileSync(path.join(app.dir, file), 'utf8');

  const r = await app.call('POST', `/rascunhos/${source.id}/duplicar`, { cookie: ana.cookie });
  assert.equal(r.status, 201);
  const copy = r.json.rascunho;
  assert.notEqual(copy.id, source.id);
  assert.match(copy.id, /^[0-9a-f]{12}$/);
  assert.equal(copy.estado, 'rascunho');
  assert.equal(copy.rev, 1);
  assert.equal(copy.autor.id, ana.user.id);
  assert.equal(copy.plano_aprovado, true);
  assert.equal(copy.respostas.plano.titulo, 'Cópia de Debate sobre o fim de vida');
  assert.deepEqual(copy.respostas.contexto, source.respostas.contexto);
  assert.deepEqual(copy.referencias, source.referencias);
  assert.deepEqual(copy.seccoes.objectivo, { dados: OBJECTIVO, estado: 'aceite', avisos: [], modelo: 'gpt-4o', origem: 'modelo' });
  assert.deepEqual(copy.seccoes.formato, { estado: 'vazia', avisos: [], modelo: null });
  assert.deepEqual(copy.threads, {});
  for (const key of ['revisao', 'submetida', 'apagado']) assert.equal(copy[key], undefined, key);
  assert.ok(app.store.read(`rascunhos/${ana.user.id}/${copy.id}.json`, null));
  // The source is not changed.
  assert.equal(fs.readFileSync(path.join(app.dir, file), 'utf8'), before);
  assert.equal(app.store.read(file).rev, 7);
});

test('a copy of a 150-character title has 150 characters', async (t) => {
  const app = await startApp(t);
  const ana = await app.person('Ana Docente');
  const source = storedDraft(app, ana);
  source.respostas.plano.titulo = 'T'.repeat(150);
  app.store.write(`rascunhos/${ana.user.id}/${source.id}.json`, source);
  const r = await app.call('POST', `/rascunhos/${source.id}/duplicar`, { cookie: ana.cookie });
  assert.equal(r.status, 201);
  assert.equal(r.json.rascunho.respostas.plano.titulo.length, 150);
  assert.ok(r.json.rascunho.respostas.plano.titulo.startsWith('Cópia de T'));

  // No title, no change.
  const empty = (await app.call('POST', '/rascunhos', { cookie: ana.cookie, body: {} })).json.rascunho;
  const c2 = await app.call('POST', `/rascunhos/${empty.id}/duplicar`, { cookie: ana.cookie });
  assert.equal(c2.status, 201);
  assert.equal(c2.json.rascunho.respostas.plano, undefined);
  assert.equal(c2.json.rascunho.plano_aprovado, false);
  assert.deepEqual(c2.json.rascunho.seccoes, {});
});

test('another teacher gets 404 on duplicar and DELETE; an admin gets 403', async (t) => {
  const app = await startApp(t);
  const ana = await app.person('Ana Docente');
  const rui = await app.person('Rui Docente');
  const tiago = await app.person('Tiago', 'admin');
  const d = storedDraft(app, ana);
  assert.equal((await app.call('POST', `/rascunhos/${d.id}/duplicar`, { cookie: rui.cookie })).status, 404);
  assert.equal((await app.call('DELETE', `/rascunhos/${d.id}`, { cookie: rui.cookie, body: { rev: d.rev } })).status, 404);
  const dup = await app.call('POST', `/rascunhos/${d.id}/duplicar`, { cookie: tiago.cookie });
  assert.equal(dup.status, 403);
  assert.equal(dup.json.erro, 'Só o autor pode duplicar este rascunho.');
  const del = await app.call('DELETE', `/rascunhos/${d.id}`, { cookie: tiago.cookie, body: { rev: d.rev } });
  assert.equal(del.status, 403);
  assert.equal(del.json.erro, 'Só o autor pode apagar este rascunho.');
  assert.deepEqual(app.store.list(`rascunhos/${rui.user.id}`), []);
  assert.deepEqual(app.store.list(`rascunhos/${tiago.user.id}`), []);
  assert.ok(app.store.read(`rascunhos/${ana.user.id}/${d.id}.json`, null));
  assert.equal((await app.call('POST', '/rascunhos/aaaaaaaaaaaa/duplicar', { cookie: ana.cookie })).status, 404);
});

test('DELETE moves the draft to apagados and the list no longer shows it', async (t) => {
  const app = await startApp(t);
  const ana = await app.person('Ana Docente');
  const d = storedDraft(app, ana);
  const keep = storedDraft(app, ana);
  const r = await app.call('DELETE', `/rascunhos/${d.id}`, { cookie: ana.cookie, body: { rev: d.rev } });
  assert.equal(r.status, 200);
  assert.equal(r.json.ok, true);
  assert.match(r.json.apagado, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  const moved = app.store.read(`apagados/${ana.user.id}/${d.id}.json`);
  assert.equal(moved.apagado, r.json.apagado);
  assert.equal(moved.id, d.id);
  assert.equal(app.store.read(`rascunhos/${ana.user.id}/${d.id}.json`, null), null);
  assert.equal((await app.call('GET', `/rascunhos/${d.id}`, { cookie: ana.cookie })).status, 404);
  const list = await app.call('GET', '/rascunhos', { cookie: ana.cookie });
  assert.deepEqual(list.json.rascunhos.map((x) => x.id), [keep.id]);
});

test('DELETE without rev is 400, with an old rev 409 rev, on a submetida draft 409 bloqueado', async (t) => {
  const app = await startApp(t);
  const ana = await app.person('Ana Docente');
  const d = storedDraft(app, ana, { rev: 4 });
  const none = await app.call('DELETE', `/rascunhos/${d.id}`, { cookie: ana.cookie, body: {} });
  assert.equal(none.status, 400);
  const old = await app.call('DELETE', `/rascunhos/${d.id}`, { cookie: ana.cookie, body: { rev: 3 } });
  assert.equal(old.status, 409);
  assert.equal(old.json.motivo, 'rev');
  const sub = storedDraft(app, ana, { estado: 'submetida' });
  const locked = await app.call('DELETE', `/rascunhos/${sub.id}`, { cookie: ana.cookie, body: { rev: sub.rev } });
  assert.equal(locked.status, 409);
  assert.equal(locked.json.motivo, 'bloqueado');
  assert.equal(locked.json.erro, 'Uma actividade submetida para revisão não pode ser apagada.');
  // An approved draft may be deleted.
  const ok = storedDraft(app, ana, { estado: 'aprovada' });
  assert.equal((await app.call('DELETE', `/rascunhos/${ok.id}`, { cookie: ana.cookie, body: { rev: ok.rev } })).status, 200);
  assert.ok(app.store.read(`rascunhos/${ana.user.id}/${d.id}.json`, null));
  assert.ok(app.store.read(`rascunhos/${ana.user.id}/${sub.id}.json`, null));
});

test('a stale tab that writes after the delete gets 404', async (t) => {
  const app = await startApp(t);
  const ana = await app.person('Ana Docente');
  const d = storedDraft(app, ana);
  assert.equal((await app.call('DELETE', `/rascunhos/${d.id}`, { cookie: ana.cookie, body: { rev: d.rev } })).status, 200);
  const put = await app.call('PUT', `/rascunhos/${d.id}/respostas/contexto`, {
    cookie: ana.cookie,
    body: { rev: d.rev, valor: respostasCompletas().contexto },
  });
  assert.equal(put.status, 404);
  assert.equal(put.json.erro, 'Rascunho não encontrado.');
  assert.equal(app.store.read(`rascunhos/${ana.user.id}/${d.id}.json`, null), null);
  const again = await app.call('DELETE', `/rascunhos/${d.id}`, { cookie: ana.cookie, body: { rev: d.rev } });
  assert.equal(again.status, 404);
});

test('a model call on a draft deleted meanwhile gets 404 and does not re-create the file', async (t) => {
  const SHARED = { IAEDU_API_KEY: 'sk-usr-shared', IAEDU_AGENT_ID: 'agent-shared', IAEDU_CHANNEL_ID: 'chan-shared' };
  let app;
  let ana;
  let d;
  const iaedu = {
    send: async () => {
      // Another window deletes the draft while the model writes.
      const del = await app.call('DELETE', `/rascunhos/${d.id}`, { cookie: ana.cookie, body: { rev: d.rev } });
      assert.equal(del.status, 200);
      return { text: JSON.stringify({ texto: 'No fim, o estudante sustenta uma posição.', competencia_protegida: 'A argumentação.' }), model: 'm' };
    },
  };
  app = await startApp(t, { iaedu, env: SHARED });
  ana = await app.person('Ana Docente');
  d = storedDraft(app, ana);
  const r = await app.call('POST', `/rascunhos/${d.id}/seccoes/objectivo/gerar`, { cookie: ana.cookie, body: { rev: d.rev } });
  assert.equal(r.status, 404);
  assert.equal(r.json.erro, 'Rascunho não encontrado.');
  assert.equal(app.store.read(`rascunhos/${ana.user.id}/${d.id}.json`, null), null);
  assert.ok(app.store.read(`apagados/${ana.user.id}/${d.id}.json`));
});

test('purgeDeleted removes a draft deleted 31 days ago, keeps one deleted 29 days ago, a damaged file and a file without apagado', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eunomia-apagados-'));
  try {
    const store = createStore(dir);
    const now = Date.parse('2027-01-31T12:00:00Z');
    const ago = (days) => new Date(now - days * DAY_MS).toISOString();
    store.write('apagados/u1/aaaaaaaaaaaa.json', { id: 'aaaaaaaaaaaa', apagado: ago(31) });
    store.write('apagados/u1/bbbbbbbbbbbb.json', { id: 'bbbbbbbbbbbb', apagado: ago(29) });
    store.write('apagados/u2/cccccccccccc.json', { id: 'cccccccccccc' });
    store.write('apagados/u2/eeeeeeeeeeee.json', { id: 'eeeeeeeeeeee', apagado: 'ontem' });
    fs.writeFileSync(path.join(dir, 'apagados', 'u2', 'dddddddddddd.json'), '{"apagado":');
    assert.equal(drafts.DELETED_DAYS, 30);
    assert.equal(drafts.purgeDeleted(store, now), 1);
    assert.deepEqual(store.list('apagados/u1'), ['bbbbbbbbbbbb.json']);
    assert.deepEqual(store.list('apagados/u2'), ['cccccccccccc.json', 'dddddddddddd.json', 'eeeeeeeeeeee.json']);
    assert.equal(drafts.purgeDeleted(store, now, 28), 1);
    assert.deepEqual(store.list('apagados/u1'), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('listAllDrafts reads every user folder of rascunhos', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eunomia-todos-'));
  try {
    const store = createStore(dir);
    const a = drafts.createDraft({ id: 'u1', name: 'A' });
    const b = drafts.createDraft({ id: 'u2', name: 'B' });
    store.write(`rascunhos/u1/${a.id}.json`, a);
    store.write(`rascunhos/u2/${b.id}.json`, b);
    store.write('apagados/u1/aaaaaaaaaaaa.json', { id: 'aaaaaaaaaaaa' });
    assert.deepEqual(drafts.listAllDrafts(store).map((d) => d.id).sort(), [a.id, b.id].sort());
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('GET /exemplos/3 without a session returns the reference ficha 3; /exemplos/9 is 404', async (t) => {
  const app = await startApp(t);
  const r = await app.call('GET', '/exemplos/3');
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.ficha, referenceFicha(3));
  for (const n of ['9', '0', 'abc', '03']) {
    const bad = await app.call('GET', `/exemplos/${n}`);
    assert.equal(bad.status, 404, n);
    assert.equal(bad.json.erro, 'Exemplo não encontrado.', n);
  }
});
