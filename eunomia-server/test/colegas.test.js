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

// ---------------------------------------------------------------- adapt an activity (Task 4)

const prompts = require('../src/prompts.js');
const { IaeduError } = require('../src/iaedu.js');

const ACTIVIDADE =
  'Aula prática de Anatomia I, 1.º ano do Mestrado Integrado em Medicina. Trinta estudantes em grupos identificam estruturas do membro superior em peças e discutem os casos no fim. Noventa minutos, sem IA.';

const CONTEXTO = {
  uc: 'Anatomia I',
  programa: 'Mestrado Integrado em Medicina, 1.º ano',
  area: 'ciencias_basicas',
  nivel: 'uc_undergrad',
  estudantes: 30,
  modalidade: 'em_aula',
  duracao_min: 90,
};
const OBJECTIVO = {
  texto: 'No fim da actividade, o estudante identifica as estruturas do membro superior numa peça anatómica.',
  competencia_protegida: 'A competência protegida é o reconhecimento das estruturas sem ajuda.',
  competencia: 'Reconhecimento anatómico',
};

// An app whose model answers with `reply` (a string, or a function that returns one or throws). The
// log lines are kept, so that a test can read them.
async function adaptSetup(t, reply = '{}') {
  const calls = { n: 0, messages: [] };
  const lines = [];
  const iaedu = {
    send: async ({ message }) => {
      calls.n += 1;
      calls.messages.push(message);
      return { text: typeof reply === 'function' ? reply() : reply, model: MODEL };
    },
  };
  const logStream = { write: (s) => lines.push(...String(s).split('\n').filter(Boolean)) && true };
  const app = await startApp(t, { now: () => T, iaedu, env: SHARED, logStream });
  const ana = await app.person('Ana Docente');
  return { app, ana, calls, lines };
}

const adapt = (app, who, body) => app.call('POST', '/rascunhos/adaptar', { cookie: who.cookie, body });
const ownDrafts = (app, who) => app.store.list(`rascunhos/${who.id}`).filter((n) => n.endsWith('.json'));
const json = (x) => JSON.stringify(x);

test('proposeAnswers lists the five steps with every field id and option id from interview.json', () => {
  const p = prompts.proposeAnswers(ACTIVIDADE);
  for (const id of ['contexto', 'objectivo', 'evidencia', 'papel_ia', 'regime']) {
    const step = drafts.STEPS.get(id);
    assert.ok(p.includes(id), id);
    for (const campo of step.campos) {
      assert.ok(p.includes(campo.id), `${id}.${campo.id}`);
      for (const o of Array.isArray(campo.opcoes) ? campo.opcoes : []) assert.ok(p.includes(o.id), `${id}.${campo.id}=${o.id}`);
    }
  }
  // The other steps are not asked for.
  for (const other of ['regime_themis', 'assignment', 'padrao', 'advogado_diabo', 'materiais', 'titulo']) assert.ok(!p.includes(other), other);
  assert.match(p, /\{"respostas": \{/);
  assert.match(p, /Não invente/);
  assert.match(p, /dados pessoais/);
  // The teacher's text is data between markers, and the rules close the prompt.
  assert.ok(p.includes(`<<<DADOS_DOCENTE\n${ACTIVIDADE}\nDADOS_DOCENTE>>>`));
  assert.ok(p.endsWith(prompts.RULES));
  // Long text is cut as for the materials.
  const long = prompts.proposeAnswers(`${'a'.repeat(prompts.MAX_MATERIALS)}FIM-DO-TEXTO`);
  assert.ok(!long.includes('FIM-DO-TEXTO'));
  assert.ok(long.includes('[...]'));
});

test('final review I3: the example answer in proposeAnswers is valid: each step in it passes applyAnswer', () => {
  const p = prompts.proposeAnswers(ACTIVIDADE);
  const line = p.split('\n').find((l) => l.startsWith('Forma da resposta: '));
  assert.ok(line, 'the example line');
  const example = JSON.parse(line.slice('Forma da resposta: '.length));
  const steps = Object.keys(example.respostas);
  assert.ok(steps.length > 0);
  let d = drafts.createDraft({ id: 'u1', nome: 'Ana' }, 'refinar', new Date(T).toISOString());
  for (const passo of drafts.ADAPT_STEPS.filter((id) => steps.includes(id))) {
    const r = drafts.applyAnswer(d, passo, example.respostas[passo]);
    assert.deepEqual(r.errors, [], `${passo} in the example is complete and valid`);
    d = r.draft;
  }
  for (const passo of steps) assert.ok(drafts.ADAPT_STEPS.includes(passo), `${passo} is a step the prompt asks for`);
});

test('adaptar: valid contexto and papel_ia make a refinar draft with the text in materials and propostos', async (t) => {
  const { app, ana, calls } = await adaptSetup(t, json({ respostas: { contexto: CONTEXTO, papel_ia: { papel: 'nenhum' } } }));
  const r = await adapt(app, ana, { texto: ACTIVIDADE });
  assert.equal(r.status, 201);
  assert.equal(calls.n, 1);
  assert.ok(calls.messages[0].includes(ACTIVIDADE));
  const d = r.json.rascunho;
  assert.equal(d.modo, 'refinar');
  assert.equal(d.estado, 'rascunho');
  assert.equal(d.plano_aprovado, false);
  assert.deepEqual(r.json.propostos, ['contexto', 'papel_ia']);
  assert.deepEqual(d.propostos, ['contexto', 'papel_ia']);
  assert.equal(d.respostas.materiais.texto, ACTIVIDADE);
  assert.deepEqual(d.respostas.contexto, CONTEXTO);
  assert.deepEqual(d.respostas.papel_ia, { papel: 'nenhum' });
  assert.equal(r.json.proximo_passo, 'objectivo');
  // Stored, and the view of the stored draft carries propostos.
  assert.deepEqual(ownDrafts(app, ana), [`${d.id}.json`]);
  const back = await get(app, ana, `/rascunhos/${d.id}`);
  assert.deepEqual(back.json.propostos, ['contexto', 'papel_ia']);
  // The route is POST /rascunhos/adaptar, never a draft id: GET of that path is the 404 of a draft.
  assert.equal((await get(app, ana, '/rascunhos/adaptar')).status, 404);
});

test('adaptar: a step with one invalid field is dropped whole, the other steps are kept', async (t) => {
  const reply = json({
    respostas: {
      contexto: { ...CONTEXTO, duracao_min: '45 min' },
      objectivo: OBJECTIVO,
      evidencia: { descricao: 'Identificação oral das estruturas.', avaliacao: 'continua' },
      papel_ia: { papel: 'assistente' },
      regime: { regime: 'proibido' },
    },
  });
  const { app, ana } = await adaptSetup(t, reply);
  const r = await adapt(app, ana, { texto: ACTIVIDADE });
  assert.equal(r.status, 201);
  assert.deepEqual(r.json.propostos, ['objectivo', 'regime']);
  const d = r.json.rascunho;
  for (const gone of ['contexto', 'evidencia', 'papel_ia']) assert.equal(d.respostas[gone], undefined, gone);
  assert.equal(d.respostas.objectivo.texto, OBJECTIVO.texto);
  assert.deepEqual(d.respostas.regime, { regime: 'proibido' });
});

test('adaptar: steps that are not objects, unknown steps, emoji or control characters are dropped', async (t) => {
  const reply = json({
    respostas: {
      contexto: [CONTEXTO],
      objectivo: { ...OBJECTIVO, texto: `${OBJECTIVO.texto} \u{1F600}` },
      evidencia: { descricao: 'Texto\u0007', avaliacao: 'formativa' },
      papel_ia: 'nenhum',
      regime: { regime: 'proibido' },
      padrao: { padrao: 'advogado_diabo' },
      plano: { titulo: 'T', subtitulo: 'S' },
    },
  });
  const { app, ana } = await adaptSetup(t, reply);
  const r = await adapt(app, ana, { texto: ACTIVIDADE });
  assert.equal(r.status, 201);
  assert.deepEqual(r.json.propostos, ['regime']);
  assert.deepEqual(Object.keys(r.json.rascunho.respostas).sort(), ['materiais', 'regime']);
});

test('adaptar: area_outra from the model is dropped when the area is not outra; outra keeps it', async (t) => {
  const { app, ana } = await adaptSetup(t, json({ respostas: { contexto: { ...CONTEXTO, area_outra: 'Farmacologia' } } }));
  const r = await adapt(app, ana, { texto: ACTIVIDADE });
  assert.deepEqual(r.json.propostos, ['contexto']);
  assert.deepEqual(r.json.rascunho.respostas.contexto, CONTEXTO);
});

test('adaptar: non-JSON, {} or a respostas that is not an object still make the draft with propostos []', async (t) => {
  for (const reply of ['não sei', '{}', '[]', json({ respostas: [] }), json({ respostas: 'nada' }), '```json\n{"respostas": {}}\n```']) {
    const { app, ana, calls } = await adaptSetup(t, reply);
    const r = await adapt(app, ana, { texto: ACTIVIDADE });
    assert.equal(r.status, 201, reply);
    assert.equal(calls.n, 1);
    assert.deepEqual(r.json.propostos, [], reply);
    assert.equal(r.json.rascunho.modo, 'refinar');
    assert.deepEqual(Object.keys(r.json.rascunho.respostas), ['materiais']);
    assert.equal(r.json.rascunho.respostas.materiais.texto, ACTIVIDADE);
    assert.equal(r.json.proximo_passo, 'contexto');
    assert.equal(ownDrafts(app, ana).length, 1);
  }
});

test('adaptar: a model error keeps its status and makes no draft', async (t) => {
  for (const [code, status] of [['limite', 429], ['servico', 502], ['tempo', 504]]) {
    const { app, ana } = await adaptSetup(t, () => {
      throw new IaeduError(code);
    });
    const r = await adapt(app, ana, { texto: ACTIVIDADE });
    assert.equal(r.status, status, code);
    assert.equal(r.json.motivo, code);
    assert.deepEqual(ownDrafts(app, ana), []);
  }
  // A wrong own key is 401 motivo auth, as on the other model routes.
  const { app, ana } = await adaptSetup(t, () => {
    throw new IaeduError('auth');
  });
  const own = { 'x-iaedu-key': 'sk-own', 'x-iaedu-agent': 'a', 'x-iaedu-channel': 'c' };
  const r = await app.call('POST', '/rascunhos/adaptar', { cookie: ana.cookie, body: { texto: ACTIVIDADE }, headers: own });
  assert.equal(r.status, 401);
  assert.equal(r.json.motivo, 'auth');
  assert.deepEqual(ownDrafts(app, ana), []);
});

test('adaptar: personal data is 422 dados_pessoais before the model; confirmo makes the draft', async (t) => {
  const { app, ana, calls } = await adaptSetup(t);
  const texto = `${ACTIVIDADE} Caso: Utente SNS 123456789.`;
  const r = await adapt(app, ana, { texto });
  assert.equal(r.status, 422);
  assert.equal(r.json.motivo, 'dados_pessoais');
  assert.ok(r.json.achados.length > 0);
  assert.equal(calls.n, 0);
  assert.deepEqual(ownDrafts(app, ana), []);
  // Only exactly true confirms.
  assert.equal((await adapt(app, ana, { texto, confirmo_sem_dados_pessoais: 'sim' })).status, 422);
  const ok = await adapt(app, ana, { texto, confirmo_sem_dados_pessoais: true });
  assert.equal(ok.status, 201);
  assert.equal(ok.json.rascunho.respostas.materiais.texto, texto);
  assert.equal(calls.n, 1);
});

test('final review M3: POST /rascunhos with another modo names the Adaptar route', async (t) => {
  const { app, ana } = await adaptSetup(t);
  const r = await app.call('POST', '/rascunhos', { cookie: ana.cookie, body: { modo: 'refinar' } });
  assert.equal(r.status, 400);
  assert.equal(r.json.erro, 'Modo desconhecido. Para partir de uma actividade que já faz, use «Adaptar uma actividade que já faço» (POST /rascunhos/adaptar).');
  assert.doesNotMatch(r.json.erro, /modo refinar/);
});

test('adaptar: texto is required, at most 60000 characters, without control characters or emoji', async (t) => {
  const { app, ana, calls } = await adaptSetup(t);
  for (const body of [{}, { texto: '' }, { texto: '   ' }, { texto: 5 }, { texto: ['a'] }]) {
    const r = await adapt(app, ana, body);
    assert.equal(r.status, 400, json(body));
    assert.equal(r.json.erro, 'Cole o texto da actividade.');
  }
  const long = await adapt(app, ana, { texto: 'a'.repeat(60001) });
  assert.equal(long.status, 400);
  assert.equal(long.json.erro, 'O texto da actividade tem no máximo 60 000 caracteres.', 'final review M4: the pt-PT number format');
  assert.equal((await adapt(app, ana, { texto: `${ACTIVIDADE}\u0000` })).status, 400);
  assert.equal((await adapt(app, ana, { texto: `${ACTIVIDADE} \u{1F600}` })).status, 422);
  assert.equal(calls.n, 0);
  assert.deepEqual(ownDrafts(app, ana), []);
  // 60000 is allowed.
  const max = await adapt(app, ana, { texto: 'a'.repeat(60000) });
  assert.equal(max.status, 201);
  assert.equal(max.json.rascunho.respostas.materiais.texto.length, 60000);
});

test('adaptar: the 101st draft is 409 limite and the model is not called', async (t) => {
  const { app, ana, calls } = await adaptSetup(t);
  for (let i = 0; i < 100; i++) {
    const d = drafts.createDraft(ana.user, 'criar', T);
    app.store.write(fileOf(ana, d), d);
  }
  const r = await adapt(app, ana, { texto: ACTIVIDADE });
  assert.equal(r.status, 409);
  assert.equal(r.json.motivo, 'limite');
  assert.equal(calls.n, 0);
  assert.equal(ownDrafts(app, ana).length, 100);
});

test('adaptar: saving a proposed step removes it from propostos; other steps stay', async (t) => {
  const { app, ana } = await adaptSetup(t, json({ respostas: { contexto: CONTEXTO, papel_ia: { papel: 'nenhum' } } }));
  const made = (await adapt(app, ana, { texto: ACTIVIDADE })).json.rascunho;
  const r = await app.call('PUT', `/rascunhos/${made.id}/respostas/contexto`, {
    cookie: ana.cookie,
    body: { rev: made.rev, valor: { ...CONTEXTO, estudantes: 32 } },
  });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.propostos, ['papel_ia']);
  assert.deepEqual(r.json.rascunho.propostos, ['papel_ia']);
  // A step that was not proposed leaves the list as it is.
  const o = await app.call('PUT', `/rascunhos/${made.id}/respostas/objectivo`, {
    cookie: ana.cookie,
    body: { rev: r.json.rascunho.rev, valor: OBJECTIVO },
  });
  assert.deepEqual(o.json.propostos, ['papel_ia']);
  // A refused answer does not change it either.
  const bad = await app.call('PUT', `/rascunhos/${made.id}/respostas/papel_ia`, {
    cookie: ana.cookie,
    body: { rev: o.json.rascunho.rev, valor: { papel: 'assistente' } },
  });
  assert.equal(bad.status, 400);
  assert.deepEqual((await get(app, ana, `/rascunhos/${made.id}`)).json.propostos, ['papel_ia']);
});

test('adaptar: a request without X-Eunomia and without the JSON type is refused, as other POSTs', async (t) => {
  const { app, ana, calls } = await adaptSetup(t);
  const bare = await app.call('POST', '/rascunhos/adaptar', { cookie: ana.cookie, csrf: false });
  assert.equal(bare.status, 403);
  const form = await app.call('POST', '/rascunhos/adaptar', {
    cookie: ana.cookie,
    csrf: false,
    raw: `texto=${encodeURIComponent(ACTIVIDADE)}`,
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
  });
  assert.equal(form.status, 415);
  // Without a session: 401.
  assert.equal((await app.call('POST', '/rascunhos/adaptar', { body: { texto: ACTIVIDADE } })).status, 401);
  assert.equal(calls.n, 0);
  assert.deepEqual(ownDrafts(app, ana), []);
});

test('adaptar: the log line has method, path, status and ms, and never the text', async (t) => {
  const { app, ana, lines } = await adaptSetup(t, json({ respostas: { contexto: CONTEXTO } }));
  const texto = `${ACTIVIDADE} Frase-unica-para-o-registo.`;
  assert.equal((await adapt(app, ana, { texto })).status, 201);
  assert.equal((await adapt(app, ana, { texto: `${texto} \u{1F600}` })).status, 422);
  await new Promise((resolve) => setTimeout(resolve, 20)); // 'finish' can come after the reply
  const entries = lines.map((l) => JSON.parse(l)).filter((e) => e.path && e.path.endsWith('/rascunhos/adaptar'));
  assert.equal(entries.length, 2);
  for (const e of entries) assert.deepEqual(Object.keys(e).sort(), ['method', 'ms', 'path', 'status']);
  assert.deepEqual(entries.map((e) => e.status), [201, 422]);
  const all = lines.join('\n');
  for (const secret of ['Frase-unica-para-o-registo', 'Anatomia', 'sk-usr-shared']) assert.ok(!all.includes(secret), secret);
});

test('a refinar draft works as a criar draft: list, plan, export, final check and duplicate', async (t) => {
  const { app, ana } = await setup(t);
  const d = put(app, ana, { modo: 'refinar', propostos: ['contexto'] });
  const list = await get(app, ana, '/rascunhos');
  assert.equal(list.json.rascunhos.find((x) => x.id === d.id).modo, 'refinar');
  assert.equal((await get(app, ana, `/rascunhos/${d.id}/exportar?formato=md`)).status, 200);
  const check = await get(app, ana, `/rascunhos/${d.id}/verificacao-final`);
  assert.equal(check.status, 200);
  assert.deepEqual(check.json.passos_em_falta, []);
  // The copy is a criar draft with an empty propostos.
  const copy = await app.call('POST', `/rascunhos/${d.id}/duplicar`, { cookie: ana.cookie });
  assert.equal(copy.status, 201);
  assert.equal(copy.json.rascunho.modo, 'criar');
  assert.deepEqual(copy.json.rascunho.propostos, []);
  assert.deepEqual(copy.json.propostos, []);
});

test('createDraft refinar starts with propostos []; a criar draft has none and its view gives []', async (t) => {
  assert.deepEqual(drafts.createDraft({ id: 'u1', name: 'A' }, 'refinar', T).propostos, []);
  assert.equal(drafts.createDraft({ id: 'u1', name: 'A' }, 'criar', T).propostos, undefined);
  const { app, ana } = await setup(t);
  const r = await app.call('POST', '/rascunhos', { cookie: ana.cookie, body: {} });
  assert.equal(r.status, 201);
  assert.deepEqual(r.json.propostos, []);
});
