'use strict';

// The pilot routes of 0.2 (spec D6, D7, D10): the "Foi útil?" opinion of a section, the submission of
// a ficha, the review queue and decisions of the admin, and the usage summary.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const drafts = require('../src/drafts.js');
const { createStore } = require('../src/store.js');
const { REFERENCES } = require('../src/assemble.js');
const { startApp, respostasCompletas } = require('./helpers.js');

const MODEL = 'gpt-4o-2024-11-20';
const T = Date.UTC(2026, 10, 16, 12, 0, 0);
const NOW = new Date(T).toISOString();
const DAY_MS = 24 * 60 * 60 * 1000;
const SHARED = { IAEDU_API_KEY: 'sk-usr-shared', IAEDU_AGENT_ID: 'agent-shared', IAEDU_CHANNEL_ID: 'chan-shared' };

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

// A complete draft: every answer, the plan approved, every section accepted and written by the model.
function fullDraft(user = { id: 'a1b2c3d4', name: 'Ana Docente' }, over = {}) {
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

// Writes a complete draft of this person to the store.
function put(app, person, over = {}) {
  const d = fullDraft(person.user, over);
  app.store.write(fileOf(person, d), d);
  return d;
}

const stored = (app, person, d) => app.store.read(fileOf(person, d));
const opinion = (d, sec, body) => ({ method: 'POST', route: `/rascunhos/${d.id}/seccoes/${sec}/opiniao`, body: { rev: d.rev, ...body } });

async function ask(app, person, { method, route, body }) {
  return app.call(method, route, { cookie: person.cookie, body });
}

// ---------------------------------------------------------------- opinion

test('opiniao stores util, comentario, data and modelo in the section and bumps rev', async (t) => {
  const app = await startApp(t, { now: () => T });
  const ana = await app.person('Ana Docente');
  const d = put(app, ana);
  const r = await ask(app, ana, opinion(d, 'objectivo', { util: true, comentario: '  Ficou claro.  ' }));
  assert.equal(r.status, 200);
  assert.equal(r.json.rascunho.rev, d.rev + 1);
  assert.deepEqual(r.json.rascunho.seccoes.objectivo.opiniao, { util: true, comentario: 'Ficou claro.', data: NOW, modelo: MODEL });
  assert.equal(r.json.rascunho.seccoes.objectivo.dados.texto, SECTIONS.objectivo.texto);
  assert.equal(r.json.rascunho.seccoes.objectivo.estado, 'aceite');
  assert.deepEqual(stored(app, ana, d).seccoes.objectivo.opiniao, r.json.rascunho.seccoes.objectivo.opiniao);
  assert.ok(r.json.proximo_passo === null || typeof r.json.proximo_passo === 'string');

  // A second opinion replaces the first; without a comment there is no comentario key.
  const again = await ask(app, ana, opinion(r.json.rascunho, 'objectivo', { util: false }));
  assert.equal(again.status, 200);
  assert.deepEqual(again.json.rascunho.seccoes.objectivo.opiniao, { util: false, data: NOW, modelo: MODEL });
  // A blank comment counts as none.
  const blank = await ask(app, ana, opinion(again.json.rascunho, 'objectivo', { util: true, comentario: '   ' }));
  assert.equal(blank.status, 200);
  assert.equal(Object.hasOwn(blank.json.rascunho.seccoes.objectivo.opiniao, 'comentario'), false);
});

test('opiniao: util "sim" is 400; a 501-character comment is 400; an emoji is 422; a comment with a valid NIF is 422 dados_pessoais and is stored with confirmo_sem_dados_pessoais', async (t) => {
  const app = await startApp(t, { now: () => T });
  const ana = await app.person('Ana Docente');
  const d = put(app, ana);

  for (const util of ['sim', 1, null, undefined]) {
    const r = await ask(app, ana, opinion(d, 'objectivo', { util }));
    assert.equal(r.status, 400, String(util));
    assert.equal(r.json.erro, 'Indique se a secção foi útil (sim ou não).');
  }
  const long = await ask(app, ana, opinion(d, 'objectivo', { util: true, comentario: 'x'.repeat(501) }));
  assert.equal(long.status, 400);
  const edge = await ask(app, ana, opinion(d, 'objectivo', { util: true, comentario: 'x'.repeat(500) }));
  assert.equal(edge.status, 200);

  const fresh = stored(app, ana, d);
  const bad = (body) => ask(app, ana, opinion(fresh, 'formato', body));
  assert.equal((await bad({ util: true, comentario: 42 })).status, 400);
  assert.equal((await bad({ util: true, comentario: 'Boa \u0007 ideia' })).status, 400);
  const emoji = await bad({ util: true, comentario: 'Muito bom \u{1F600}' });
  assert.equal(emoji.status, 422);
  assert.ok(emoji.json.erros.length > 0);

  const nif = await bad({ util: true, comentario: 'O contribuinte 123456789 gostou.' });
  assert.equal(nif.status, 422);
  assert.equal(nif.json.motivo, 'dados_pessoais');
  assert.deepEqual(nif.json.achados, ['Possível NIF: 123456789']);
  assert.equal(stored(app, ana, d).seccoes.formato.opiniao, undefined);
  const strict = await bad({ util: true, comentario: 'O contribuinte 123456789 gostou.', confirmo_sem_dados_pessoais: 'sim' });
  assert.equal(strict.status, 422);
  const ok = await bad({ util: true, comentario: 'O contribuinte 123456789 gostou.', confirmo_sem_dados_pessoais: true });
  assert.equal(ok.status, 200);
  assert.equal(stored(app, ana, d).seccoes.formato.opiniao.comentario, 'O contribuinte 123456789 gostou.');
  assert.equal(ok.json.rascunho.seccoes.formato.opiniao.confirmo_sem_dados_pessoais, undefined);
});

test('opiniao on a teacher-written or empty section is 409 incompleto; on regime_ia it is 400', async (t) => {
  const app = await startApp(t, { now: () => T });
  const ana = await app.person('Ana Docente');
  const d = put(app, ana);
  d.seccoes.papeis.origem = 'docente';
  d.seccoes.correccao = { estado: 'vazia', avisos: [], modelo: null };
  d.seccoes.armadilhas = { dados: SECTIONS.armadilhas, estado: 'aceite', avisos: [], modelo: null };
  app.store.write(fileOf(ana, d), d);

  for (const sec of ['papeis', 'correccao', 'armadilhas']) {
    const r = await ask(app, ana, opinion(d, sec, { util: true }));
    assert.equal(r.status, 409, sec);
    assert.equal(r.json.motivo, 'incompleto', sec);
    assert.equal(r.json.erro, 'Só pode dar opinião sobre texto escrito pelo modelo.', sec);
  }
  for (const sec of ['regime_ia', 'referencias', 'meta', 'declaracao']) {
    assert.equal((await ask(app, ana, opinion(d, sec, { util: true }))).status, 400, sec);
  }
  assert.equal((await ask(app, ana, opinion(d, 'inexistente', { util: true }))).status, 404);
  assert.equal(stored(app, ana, d).rev, d.rev);
});

test('opiniao follows the rules of every draft write: rev, author, state', async (t) => {
  const app = await startApp(t, { now: () => T });
  const ana = await app.person('Ana Docente');
  const rui = await app.person('Rui Docente');
  const admin = await app.person('Tiago', 'admin');
  const d = put(app, ana);
  const route = `/rascunhos/${d.id}/seccoes/objectivo/opiniao`;

  const noRev = await app.call('POST', route, { cookie: ana.cookie, body: { util: true } });
  assert.equal(noRev.status, 400);
  const stale = await app.call('POST', route, { cookie: ana.cookie, body: { rev: d.rev + 5, util: true } });
  assert.equal(stale.status, 409);
  assert.equal(stale.json.motivo, 'rev');
  assert.equal((await app.call('POST', route, { cookie: rui.cookie, body: { rev: d.rev, util: true } })).status, 404);
  assert.equal((await app.call('POST', route, { cookie: admin.cookie, body: { rev: d.rev, util: true } })).status, 403);
  assert.equal((await app.call('POST', route, { body: { rev: d.rev, util: true } })).status, 401);
  assert.equal((await app.call('POST', route, { cookie: ana.cookie, csrf: false })).status, 403);

  const locked = put(app, ana, { estado: 'submetida' });
  const r = await ask(app, ana, opinion(locked, 'objectivo', { util: true }));
  assert.equal(r.status, 409);
  assert.equal(r.json.motivo, 'bloqueado');
});

test('a new version keeps the opinion in anterior; an edit and an accept keep it in the section', async (t) => {
  const client = {
    async send() {
      const ficha = SECTIONS.objectivo;
      return { text: '```json\n' + JSON.stringify({ ...ficha, texto: 'No fim, o estudante defende e revê uma posição.' }) + '\n```', model: MODEL };
    },
  };
  const app = await startApp(t, { now: () => T, iaedu: client, env: SHARED });
  const ana = await app.person('Ana Docente');
  const d = put(app, ana);
  const op = await ask(app, ana, opinion(d, 'objectivo', { util: false, comentario: 'Demasiado genérico.' }));
  assert.equal(op.status, 200);
  const opiniao = op.json.rascunho.seccoes.objectivo.opiniao;

  // Nova versão: the old section, with its opinion, becomes anterior; the new section has none.
  const gen = await app.call('POST', `/rascunhos/${d.id}/seccoes/objectivo/gerar`, { cookie: ana.cookie, body: { rev: op.json.rascunho.rev } });
  assert.equal(gen.status, 200);
  const s = gen.json.rascunho.seccoes.objectivo;
  assert.equal(s.opiniao, undefined);
  assert.deepEqual(s.anterior.opiniao, opiniao);
  assert.equal(s.dados.texto, 'No fim, o estudante defende e revê uma posição.');

  // Repor brings the old section back with its opinion.
  const back = await app.call('POST', `/rascunhos/${d.id}/seccoes/objectivo/repor`, { cookie: ana.cookie, body: { rev: gen.json.rascunho.rev } });
  assert.equal(back.status, 200);
  assert.deepEqual(back.json.rascunho.seccoes.objectivo.opiniao, opiniao);

  // An edit keeps the opinion in the section.
  const edit = await app.call('PUT', `/rascunhos/${d.id}/seccoes/objectivo`, {
    cookie: ana.cookie,
    body: { rev: back.json.rascunho.rev, dados: { ...SECTIONS.objectivo, texto: 'No fim, o estudante sustenta e justifica uma posição.' } },
  });
  assert.equal(edit.status, 200);
  assert.equal(edit.json.rascunho.seccoes.objectivo.origem, 'docente');
  assert.deepEqual(edit.json.rascunho.seccoes.objectivo.opiniao, opiniao);

  // An accept keeps it too: a section that the model wrote and that is not accepted yet.
  const e = stored(app, ana, d);
  e.seccoes.formato = { ...e.seccoes.formato, estado: 'gerada' };
  app.store.write(fileOf(ana, d), e);
  const op2 = await ask(app, ana, opinion(e, 'formato', { util: true }));
  const accept = await app.call('POST', `/rascunhos/${d.id}/seccoes/formato/aceitar`, { cookie: ana.cookie, body: { rev: op2.json.rascunho.rev } });
  assert.equal(accept.status, 200);
  assert.equal(accept.json.rascunho.seccoes.formato.estado, 'aceite');
  assert.equal(accept.json.rascunho.seccoes.formato.opiniao.util, true);
});

// ---------------------------------------------------------------- submission

test('submeter makes a complete draft submetida; the next PUT is 409 bloqueado', async (t) => {
  const app = await startApp(t, { now: () => T });
  const ana = await app.person('Ana Docente');
  const d = put(app, ana);
  const r = await ask(app, ana, { method: 'POST', route: `/rascunhos/${d.id}/submeter`, body: { rev: d.rev } });
  assert.equal(r.status, 200);
  assert.equal(r.json.rascunho.estado, 'submetida');
  assert.equal(r.json.rascunho.submetida, NOW);
  assert.equal(r.json.rascunho.rev, d.rev + 1);
  assert.equal(r.json.rascunho.revisao, undefined);
  assert.equal(stored(app, ana, d).estado, 'submetida');

  const rev = r.json.rascunho.rev;
  const put1 = await app.call('PUT', `/rascunhos/${d.id}/seccoes/objectivo`, { cookie: ana.cookie, body: { rev, dados: SECTIONS.objectivo } });
  assert.equal(put1.status, 409);
  assert.equal(put1.json.motivo, 'bloqueado');
  const put2 = await app.call('PUT', `/rascunhos/${d.id}/respostas/objectivo`, { cookie: ana.cookie, body: { rev, valor: {} } });
  assert.equal(put2.status, 409);
  assert.equal(put2.json.motivo, 'bloqueado');
  const twice = await ask(app, ana, { method: 'POST', route: `/rascunhos/${d.id}/submeter`, body: { rev } });
  assert.equal(twice.status, 409);
  assert.equal(twice.json.motivo, 'bloqueado');
});

test('submeter with a section not accepted is 409 incompleto; with schema errors 409 invalido with erros', async (t) => {
  const app = await startApp(t, { now: () => T });
  const ana = await app.person('Ana Docente');

  const open = put(app, ana);
  open.seccoes.formato.estado = 'gerada';
  app.store.write(fileOf(ana, open), open);
  const a = await ask(app, ana, { method: 'POST', route: `/rascunhos/${open.id}/submeter`, body: { rev: open.rev } });
  assert.equal(a.status, 409);
  assert.equal(a.json.motivo, 'incompleto');
  assert.deepEqual(a.json.seccoes, ['formato']);
  assert.equal(stored(app, ana, open).estado, 'rascunho');

  const noPlan = put(app, ana, { plano_aprovado: false });
  const p = await ask(app, ana, { method: 'POST', route: `/rascunhos/${noPlan.id}/submeter`, body: { rev: noPlan.rev } });
  assert.equal(p.status, 409);
  assert.equal(p.json.motivo, 'plano');

  const bad = put(app, ana);
  bad.seccoes.armadilhas.dados = [{ lead: 'Só uma.', texto: 'Texto.' }];
  app.store.write(fileOf(ana, bad), bad);
  const b = await ask(app, ana, { method: 'POST', route: `/rascunhos/${bad.id}/submeter`, body: { rev: bad.rev } });
  assert.equal(b.status, 409);
  assert.equal(b.json.motivo, 'invalido');
  assert.equal(b.json.erro, 'A ficha tem erros. Corrija-os antes de submeter.');
  assert.ok(Array.isArray(b.json.erros) && b.json.erros.some((e) => /armadilhas/.test(e)), JSON.stringify(b.json.erros));
  const after = stored(app, ana, bad);
  assert.equal(after.estado, 'rascunho');
  assert.equal(after.rev, bad.rev);
  assert.equal(after.submetida, undefined);

  const stale = await ask(app, ana, { method: 'POST', route: `/rascunhos/${open.id}/submeter`, body: { rev: open.rev + 3 } });
  assert.equal(stale.status, 409);
  assert.equal(stale.json.motivo, 'rev');
  const noRev = await ask(app, ana, { method: 'POST', route: `/rascunhos/${open.id}/submeter`, body: {} });
  assert.equal(noRev.status, 400);
});

test('submeter removes the revisao of an earlier return', async (t) => {
  const app = await startApp(t, { now: () => T });
  const ana = await app.person('Ana Docente');
  const d = put(app, ana, { estado: 'devolvida', revisao: { decisao: 'devolvida', comentario: 'Reveja o formato.', data: NOW, revisor: 'Tiago' } });
  const r = await ask(app, ana, { method: 'POST', route: `/rascunhos/${d.id}/submeter`, body: { rev: d.rev } });
  assert.equal(r.status, 200);
  assert.equal(r.json.rascunho.estado, 'submetida');
  assert.equal(r.json.rascunho.revisao, undefined);
  assert.equal(Object.hasOwn(stored(app, ana, d), 'revisao'), false);
});

// ---------------------------------------------------------------- the review queue

test('GET /revisao lists the submitted drafts of every teacher, oldest first; a teacher gets 403', async (t) => {
  const app = await startApp(t, { now: () => T });
  const ana = await app.person('Ana Docente');
  const rui = await app.person('Rui Docente');
  const admin = await app.person('Tiago', 'admin');
  const newest = put(app, ana, { estado: 'submetida', submetida: new Date(T - 1 * DAY_MS).toISOString(), rev: 4 });
  const oldest = put(app, rui, { estado: 'submetida', submetida: new Date(T - 3 * DAY_MS).toISOString(), rev: 6 });
  oldest.respostas.plano.titulo = 'Plano do Rui';
  app.store.write(fileOf(rui, oldest), oldest);
  const middle = put(app, rui, { estado: 'submetida', submetida: new Date(T - 2 * DAY_MS).toISOString() });
  middle.respostas = { ...middle.respostas, plano: undefined };
  middle.respostas.contexto.uc = 'Bioética Clínica';
  app.store.write(fileOf(rui, middle), middle);
  // Not in the queue: a draft, a returned draft, an approved draft, a deleted draft.
  put(app, ana);
  put(app, ana, { estado: 'devolvida' });
  put(app, ana, { estado: 'aprovada' });
  const deleted = put(app, ana, { estado: 'submetida', submetida: new Date(T - 5 * DAY_MS).toISOString() });
  app.store.move(fileOf(ana, deleted), `apagados/${ana.id}/${deleted.id}.json`);

  const r = await app.call('GET', '/revisao', { cookie: admin.cookie });
  assert.equal(r.status, 200);
  assert.deepEqual(
    r.json.revisao.map((x) => x.id),
    [oldest.id, middle.id, newest.id],
  );
  assert.deepEqual(r.json.revisao[0], {
    id: oldest.id,
    titulo: 'Plano do Rui',
    autor: 'Rui Docente',
    submetida: new Date(T - 3 * DAY_MS).toISOString(),
    rev: 6,
  });
  assert.equal(r.json.revisao[1].titulo, 'Bioética Clínica');
  assert.equal(r.json.revisao[2].autor, 'Ana Docente');
  assert.equal(r.json.revisao[2].rev, 4);

  const forbidden = await app.call('GET', '/revisao', { cookie: ana.cookie });
  assert.equal(forbidden.status, 403);
  assert.equal((await app.call('GET', '/revisao')).status, 401);
});

test('aprovar sets aprovada and revisao.decisao; a rascunho is 409 estado; a stale rev is 409 rev', async (t) => {
  const app = await startApp(t, { now: () => T });
  const ana = await app.person('Ana Docente');
  const admin = await app.person('Tiago Jacinto', 'admin');
  const waiting = put(app, ana, { estado: 'submetida', submetida: NOW, rev: 3 });
  const open = put(app, ana);
  const aprovar = (d, rev = d.rev) => app.call('POST', `/revisao/${d.id}/aprovar`, { cookie: admin.cookie, body: { rev } });

  const notWaiting = await aprovar(open);
  assert.equal(notWaiting.status, 409);
  assert.equal(notWaiting.json.motivo, 'estado');
  assert.equal(notWaiting.json.erro, 'Esta actividade não está à espera de revisão.');
  assert.equal(stored(app, ana, open).estado, 'rascunho');

  const stale = await aprovar(waiting, 2);
  assert.equal(stale.status, 409);
  assert.equal(stale.json.motivo, 'rev');
  assert.equal((await aprovar(waiting, null)).status, 400);
  assert.equal((await app.call('POST', '/revisao/aaaaaaaaaaaa/aprovar', { cookie: admin.cookie, body: { rev: 1 } })).status, 404);
  assert.equal((await app.call('POST', `/revisao/${waiting.id}/aprovar`, { cookie: ana.cookie, body: { rev: 3 } })).status, 403);

  const ok = await aprovar(waiting);
  assert.equal(ok.status, 200);
  assert.equal(ok.json.rascunho.estado, 'aprovada');
  assert.deepEqual(ok.json.rascunho.revisao, { decisao: 'aprovada', data: NOW, revisor: 'Tiago Jacinto' });
  assert.equal(ok.json.rascunho.rev, 4);
  assert.deepEqual(stored(app, ana, waiting).revisao, ok.json.rascunho.revisao);
  assert.equal(stored(app, ana, waiting).autor.id, ana.id);

  const again = await aprovar(ok.json.rascunho);
  assert.equal(again.status, 409);
  assert.equal(again.json.motivo, 'estado');
  // The author can not change an approved draft.
  const edit = await app.call('PUT', `/rascunhos/${waiting.id}/seccoes/objectivo`, { cookie: ana.cookie, body: { rev: 4, dados: SECTIONS.objectivo } });
  assert.equal(edit.status, 409);
  assert.equal(edit.json.motivo, 'bloqueado');
});

test('devolver without a comment is 400; with one it sets devolvida and the comment; the author can PUT again', async (t) => {
  const app = await startApp(t, { now: () => T });
  const ana = await app.person('Ana Docente');
  const admin = await app.person('Tiago Jacinto', 'admin');
  const d = put(app, ana, { estado: 'submetida', submetida: NOW, rev: 3 });
  const devolver = (body, id = d.id) => app.call('POST', `/revisao/${id}/devolver`, { cookie: admin.cookie, body: { rev: 3, ...body } });

  for (const body of [{}, { comentario: '' }, { comentario: '   ' }, { comentario: null }]) {
    const r = await devolver(body);
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.equal(r.json.erro, 'Escreva o comentário para o autor.');
  }
  assert.equal((await devolver({ comentario: 'x'.repeat(2001) })).status, 400);
  assert.equal((await devolver({ comentario: 42 })).status, 400);
  assert.equal((await devolver({ comentario: 'Falta \u0007 algo.' })).status, 400);
  assert.equal((await devolver({ comentario: 'Bom \u{1F600}' })).status, 422);
  const pd = await devolver({ comentario: 'O contribuinte 123456789 precisa de ajuda.' });
  assert.equal(pd.status, 422);
  assert.equal(pd.json.motivo, 'dados_pessoais');
  assert.equal((await devolver({ comentario: 'Reveja.', rev: 2 })).status, 409);
  assert.equal(stored(app, ana, d).estado, 'submetida');

  const ok = await devolver({ comentario: '  Reveja o formato: a soma dos blocos.  ' });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.rascunho.estado, 'devolvida');
  assert.deepEqual(ok.json.rascunho.revisao, {
    decisao: 'devolvida',
    comentario: 'Reveja o formato: a soma dos blocos.',
    data: NOW,
    revisor: 'Tiago Jacinto',
  });
  assert.equal(ok.json.rascunho.rev, 4);

  // The draft is not waiting any more.
  const again = await devolver({ comentario: 'Outra vez.', rev: 4 });
  assert.equal(again.status, 409);
  assert.equal(again.json.motivo, 'estado');

  // The author can write again, and the comment stays until the next submission.
  const edit = await app.call('PUT', `/rascunhos/${d.id}/seccoes/objectivo`, {
    cookie: ana.cookie,
    body: { rev: 4, dados: { ...SECTIONS.objectivo, texto: 'No fim, o estudante defende uma posição.' } },
  });
  assert.equal(edit.status, 200);
  assert.equal(edit.json.rascunho.estado, 'devolvida');
  assert.equal(edit.json.rascunho.revisao.comentario, 'Reveja o formato: a soma dos blocos.');

  // PD confirmed by the reviewer is stored.
  const e = put(app, ana, { estado: 'submetida', submetida: NOW, rev: 3 });
  const confirmed = await devolver({ comentario: 'O contribuinte 123456789 precisa de ajuda.', confirmo_sem_dados_pessoais: true }, e.id);
  assert.equal(confirmed.status, 200);
});

// ---------------------------------------------------------------- usage

test('GET /uso has, per user, the drafts by state, the calls today and in 30 days and the limit; per section, Sim and Não counts and the comments, and no section text', async (t) => {
  const app = await startApp(t);
  const ana = await app.person('Ana Docente');
  const rui = await app.person('Rui Docente');
  const admin = await app.person('Tiago Jacinto', 'admin');
  const gone = await app.person('Zita Antiga');
  assert.equal(app.config.auth.revoke(gone.id), true);

  // Drafts: Ana has two rascunhos, a submetida and a deleted one; Rui has an aprovada.
  const a1 = put(app, ana);
  put(app, ana);
  put(app, ana, { estado: 'submetida' });
  const deleted = put(app, ana, { estado: 'devolvida' });
  app.store.move(fileOf(ana, deleted), `apagados/${ana.id}/${deleted.id}.json`);
  const r1 = put(app, rui, { estado: 'aprovada' });

  // Opinions: in sections, in anterior, in two states of draft, with and without comment.
  const op = (d, person, sec, util, comentario, extra = {}) => {
    const x = app.store.read(fileOf(person, d));
    x.seccoes[sec].opiniao = { util, ...(comentario ? { comentario } : {}), data: NOW, modelo: MODEL, ...extra };
    app.store.write(fileOf(person, d), x);
  };
  op(a1, ana, 'objectivo', true);
  op(a1, ana, 'formato', false, 'Os blocos não somam.', { data: '2026-11-15T10:00:00.000Z' });
  op(r1, rui, 'objectivo', true, 'Serviu bem.', { data: '2026-11-16T09:00:00.000Z', modelo: null });
  const withPrev = app.store.read(fileOf(rui, r1));
  withPrev.seccoes.objectivo.anterior = {
    dados: { texto: 'Versão antiga do objectivo.', competencia_protegida: 'Outra.' },
    estado: 'aceite',
    avisos: [],
    modelo: MODEL,
    origem: 'modelo',
    opiniao: { util: false, comentario: 'Era vago.', data: '2026-11-14T08:00:00.000Z', modelo: MODEL },
  };
  app.store.write(fileOf(rui, r1), withPrev);
  // An opinion on a deleted draft does not count.
  const dd = app.store.read(`apagados/${ana.id}/${deleted.id}.json`);
  dd.seccoes.papeis.opiniao = { util: true, comentario: 'Apagada.', data: NOW, modelo: MODEL };
  app.store.write(`apagados/${ana.id}/${deleted.id}.json`, dd);

  // Calls: today, the 29th day before (counted) and the 30th (not counted).
  const day = (n) => new Date(Date.now() - n * DAY_MS).toISOString().slice(0, 10);
  app.store.write('usage.json', {
    [day(0)]: { [ana.id]: 7, [rui.id]: 1 },
    [day(29)]: { [ana.id]: 5 },
    [day(30)]: { [ana.id]: 100, [rui.id]: 100 },
  });

  const r = await app.call('GET', '/uso', { cookie: admin.cookie });
  assert.equal(r.status, 200);
  assert.equal(r.json.limite_diario, 200);
  assert.deepEqual(
    r.json.utilizadores.map((u) => u.nome),
    ['Ana Docente', 'Rui Docente', 'Tiago Jacinto', 'Zita Antiga'],
  );
  const by = Object.fromEntries(r.json.utilizadores.map((u) => [u.nome, u]));
  assert.deepEqual(by['Ana Docente'], {
    id: ana.id,
    nome: 'Ana Docente',
    perfil: 'teacher',
    revogado: false,
    rascunhos: { rascunho: 2, submetida: 1 },
    pedidos_hoje: 7,
    pedidos_30_dias: 12,
  });
  assert.deepEqual(by['Rui Docente'].rascunhos, { aprovada: 1 });
  assert.equal(by['Rui Docente'].pedidos_hoje, 1);
  assert.equal(by['Rui Docente'].pedidos_30_dias, 1);
  assert.equal(by['Tiago Jacinto'].perfil, 'admin');
  assert.deepEqual(by['Tiago Jacinto'].rascunhos, {});
  assert.equal(by['Tiago Jacinto'].pedidos_30_dias, 0);
  assert.equal(by['Zita Antiga'].revogado, true);

  // The seven model sections, in order, zeros included.
  assert.deepEqual(
    r.json.seccoes.map((s) => s.id),
    drafts.MODEL_SECTIONS,
  );
  const sec = Object.fromEntries(r.json.seccoes.map((s) => [s.id, s]));
  assert.equal(sec.objectivo.sim, 2);
  assert.equal(sec.objectivo.nao, 1);
  assert.deepEqual(sec.objectivo.comentarios, [
    { util: true, texto: 'Serviu bem.', data: '2026-11-16T09:00:00.000Z', modelo: null },
    { util: false, texto: 'Era vago.', data: '2026-11-14T08:00:00.000Z', modelo: MODEL },
  ]);
  assert.equal(sec.formato.sim, 0);
  assert.equal(sec.formato.nao, 1);
  assert.deepEqual(sec.formato.comentarios, [{ util: false, texto: 'Os blocos não somam.', data: '2026-11-15T10:00:00.000Z', modelo: MODEL }]);
  assert.deepEqual(sec.papeis, { id: 'papeis', sim: 0, nao: 0, comentarios: [] });
  assert.deepEqual(sec.plano_b, { id: 'plano_b', sim: 0, nao: 0, comentarios: [] });

  // No section text, no author name in the sections.
  const text = JSON.stringify(r.json);
  for (const dados of Object.values(SECTIONS)) assert.equal(text.includes(JSON.stringify(dados)), false);
  for (const phrase of ['sustenta uma posição', 'Conduz o plenário', 'Versão antiga do objectivo', 'Vais assumir o papel']) {
    assert.equal(text.includes(phrase), false, phrase);
  }
  const sections = JSON.stringify(r.json.seccoes);
  for (const name of ['Ana', 'Rui', 'Tiago', 'Zita', ana.id, rui.id]) assert.equal(sections.includes(name), false, name);
  assert.equal(Object.hasOwn(r.json, 'rascunhos'), false);

  assert.equal((await app.call('GET', '/uso', { cookie: ana.cookie })).status, 403);
  assert.equal((await app.call('GET', '/uso')).status, 401);
});

test('GET /uso with no drafts and no calls has every user at zero and the seven sections at zero', async (t) => {
  const app = await startApp(t);
  const admin = await app.person('Tiago Jacinto', 'admin');
  const r = await app.call('GET', '/uso', { cookie: admin.cookie });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.utilizadores, [
    { id: admin.id, nome: 'Tiago Jacinto', perfil: 'admin', revogado: false, rascunhos: {}, pedidos_hoje: 0, pedidos_30_dias: 0 },
  ]);
  assert.equal(r.json.seccoes.length, 7);
  assert.ok(r.json.seccoes.every((s) => s.sim === 0 && s.nao === 0 && s.comentarios.length === 0));
});

// ---------------------------------------------------------------- a damaged file

test('GET /revisao and GET /uso skip a damaged draft file; listAllDrafts throws unless it is told to skip', async (t) => {
  const app = await startApp(t, { now: () => T });
  const ana = await app.person('Ana Docente');
  const admin = await app.person('Tiago Jacinto', 'admin');
  const good = put(app, ana, { estado: 'submetida', submetida: NOW });
  fs.writeFileSync(path.join(app.dir, 'rascunhos', ana.id, 'aaaaaaaaaaaa.json'), '{ not json');
  // Valid JSON that is not a draft.
  fs.writeFileSync(path.join(app.dir, 'rascunhos', ana.id, 'bbbbbbbbbbbb.json'), '[]');
  fs.writeFileSync(path.join(app.dir, 'rascunhos', ana.id, 'cccccccccccc.json'), '{"estado":"submetida"}');
  fs.writeFileSync(path.join(app.dir, 'rascunhos', ana.id, 'dddddddddddd.json'), 'null');

  const queue = await app.call('GET', '/revisao', { cookie: admin.cookie });
  assert.equal(queue.status, 200);
  assert.deepEqual(queue.json.revisao.map((x) => x.id), [good.id]);
  const usage = await app.call('GET', '/uso', { cookie: admin.cookie });
  assert.equal(usage.status, 200);
  assert.deepEqual(usage.json.utilizadores.find((u) => u.id === ana.id).rascunhos, { submetida: 1 });

  const store = createStore(app.dir);
  assert.throws(() => drafts.listAllDrafts(store), /Ficheiro de dados inválido/);
  assert.throws(() => drafts.listDrafts(store, ana.id), /Ficheiro de dados inválido/);
  assert.deepEqual(drafts.listAllDrafts(store, { skipDamaged: true }).map((d) => d.id), [good.id]);
  assert.deepEqual(drafts.listDrafts(store, ana.id, { skipDamaged: true }).map((d) => d.id), [good.id]);
});
