'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const drafts = require('../src/drafts.js');
const { generateSection } = require('../src/generate.js');
const prompts = require('../src/prompts.js');
const { IaeduError } = require('../src/iaedu.js');
const { CATALOGUE } = require('../src/patterns.js');
const { startApp, respostasCompletas } = require('./helpers.js');

const MODEL = 'gpt-4o-2024-11-20';
const SHARED = { IAEDU_API_KEY: 'sk-usr-shared', IAEDU_AGENT_ID: 'agent-shared', IAEDU_CHANNEL_ID: 'chan-shared' };
const ALT = { IAEDU_ALT_API_KEY: 'sk-usr-alt', IAEDU_ALT_AGENT_ID: 'agent-alt', IAEDU_ALT_CHANNEL_ID: 'chan-alt' };
const CREDS = { key: 'sk-usr-shared', agentId: 'agent-shared', channelId: 'chan-shared', source: 'shared' };

// Valid section data for the plan of respostasCompletas (40 to 50 minutes, AI as counterpart).
const VALID = {
  objectivo: {
    texto: 'No fim da actividade, o estudante sustenta uma posição sobre uma questão controversa e responde às objecções mais fortes.',
    competencia_protegida: 'A competência protegida é a argumentação.',
  },
  formato: {
    blocos: [
      { minutos: 5, texto: 'O docente enuncia a questão e cada grupo toma posição por escrito.' },
      { minutos: 10, texto: 'Cada grupo pede à ferramenta as objecções à sua posição.' },
      { minutos: 15, texto: 'O grupo responde por escrito a cada objecção.' },
      { minutos: 15, texto: 'Plenário.' },
    ],
  },
  prompt_base: { texto: 'Vais assumir o papel de um oponente num debate. Responde só com objecções.' },
  papeis: { estudante: 'Toma posição e responde às objecções.', docente: 'Escolhe a questão e conduz o plenário.' },
  correccao: { texto: '1. **Que objecção obrigou a rever a posição?** Cada grupo responde.' },
  armadilhas: [
    { lead: 'Deriva para o consenso.', texto: 'O modelo tende a fechar com uma síntese conciliadora.' },
    { lead: 'Evidência inventada.', texto: 'Um contra-argumento pode invocar um estudo que não existe.' },
    { lead: 'Adopção da posição da ferramenta.', texto: 'A posição é tomada antes da consulta.' },
  ],
  plano_b: { texto: 'O docente imprime as objecções antes da aula.' },
};

const reply = (data, model = MODEL) => ({ text: typeof data === 'string' ? data : '```json\n' + JSON.stringify(data) + '\n```', model });

// A fake IAedu client: returns the queued replies in order (an Error is thrown) and records each call.
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

function approvedDraft(user = { id: 'a1b2c3d4', name: 'Ana Docente' }, respostas = respostasCompletas()) {
  let d = drafts.createDraft(user, 'criar');
  for (const [step, value] of Object.entries(respostas)) d = drafts.applyAnswer(d, step, value).draft;
  return drafts.approvePlan(d);
}

// A server whose model is the given fake client, a teacher, and a draft with an approved plan.
async function appWithDraft(t, client, { approve = true, env = SHARED, respostas } = {}) {
  const app = await startApp(t, { iaedu: client, env });
  const ana = await app.person('Ana Docente');
  let d = drafts.createDraft(ana.user, 'criar');
  for (const [step, value] of Object.entries(respostas || respostasCompletas())) d = drafts.applyAnswer(d, step, value).draft;
  if (approve) d = drafts.approvePlan(d);
  app.store.write(`rascunhos/${ana.id}/${d.id}.json`, d);
  return { app, ana, draft: d };
}

// ---------------------------------------------------------------- prompts

test('each prompt is in Portuguese, asks for JSON only, shows the shape and carries the spelling rules', () => {
  const d = approvedDraft();
  const plano = prompts.planText(d);
  const list = [
    prompts.sharpenOutcome(d.respostas),
    prompts.explainPatterns(d.respostas, CATALOGUE.slice(0, 2)),
    ...drafts.MODEL_SECTIONS.map((s) => prompts.writeSection(s, plano, '', undefined)),
    prompts.mapExisting('Uma actividade antiga.'),
    prompts.reviewAlignment({ objectivo: VALID.objectivo }),
  ];
  for (const p of list) {
    assert.match(p, /Responda só com JSON/);
    assert.match(p, /actividade, objectivo, correcção/);
    assert.match(p, /estudantes, nunca alunos/);
    assert.match(p, /doentes, nunca pacientes/);
    assert.match(p, /\{/);
    assert.ok(p.length < 6000, `prompt longo: ${p.length}`);
  }
});

test('writeSection asks for the JSON of that section only, with the plan, the materials and the comment', () => {
  const d = approvedDraft();
  const p = prompts.writeSection('armadilhas', prompts.planText(d), 'Texto dos materiais da UC.', 'Mais curtas, por favor.');
  assert.match(p, /"lead"/);
  assert.match(p, /entre 3 e 6/);
  assert.doesNotMatch(p, /"blocos"/);
  assert.match(p, /Debate sobre o fim de vida/);
  assert.match(p, /Texto dos materiais da UC\./);
  assert.match(p, /Mais curtas, por favor\./);
  const f = prompts.writeSection('formato', prompts.planText(d), '', undefined);
  assert.match(f, /"blocos"/);
  assert.match(f, /entre 40 e 50 minutos/);
  assert.throws(() => prompts.writeSection('regime_ia', '', '', undefined), /código/);
});

// ---------------------------------------------------------------- generateSection

test('invalid JSON then valid JSON: two calls, a valid result and no avisos', async () => {
  const client = fakeClient(reply('isto não é JSON'), reply(VALID.armadilhas));
  const r = await generateSection({ draft: approvedDraft(), sectionId: 'armadilhas', client, creds: CREDS });
  assert.equal(client.calls.length, 2);
  assert.deepEqual(r.dados, VALID.armadilhas);
  assert.deepEqual(r.avisos, []);
  assert.equal(r.modelo, MODEL);
  assert.match(client.calls[1].message, /JSON/);
  assert.equal(client.calls[0].threadId, client.calls[1].threadId);
  assert.match(client.calls[0].threadId, /^thr-[0-9a-f-]{36}$/);
});

test('seven armadilhas twice: two calls, the result is returned and the avisos have the count error', async () => {
  const seven = Array.from({ length: 7 }, (_, i) => ({ lead: `Armadilha ${i + 1}.`, texto: 'Texto.' }));
  const client = fakeClient(reply(seven));
  const r = await generateSection({ draft: approvedDraft(), sectionId: 'armadilhas', client, creds: CREDS });
  assert.equal(client.calls.length, 2);
  assert.equal(r.dados.length, 7);
  assert.ok(r.avisos.some((a) => a.regra === 'esquema' && /7 itens/.test(a.texto)), JSON.stringify(r.avisos));
  // The retry carries the error list.
  assert.match(client.calls[1].message, /7 itens/);
});

test('a reply with doi:10.1000/x gets a referencia aviso', async () => {
  const data = { texto: 'Ver doi:10.1000/x para a base da discussão.' };
  const client = fakeClient(reply(data));
  const r = await generateSection({ draft: approvedDraft(), sectionId: 'correccao', client, creds: CREDS });
  assert.ok(r.avisos.some((a) => a.regra === 'referencia' && a.trecho === '10.1000/x'), JSON.stringify(r.avisos));
});

test('a reply wrapped in an object with the section name is unwrapped', async () => {
  const client = fakeClient(reply({ armadilhas: VALID.armadilhas }));
  const r = await generateSection({ draft: approvedDraft(), sectionId: 'armadilhas', client, creds: CREDS });
  assert.equal(client.calls.length, 1);
  assert.deepEqual(r.dados, VALID.armadilhas);
});

test('a language lint triggers the retry; a number lint does not', async () => {
  const client = fakeClient(reply({ texto: 'O objetivo é discutir com os alunos.' }), reply(VALID.correccao));
  const r = await generateSection({ draft: approvedDraft(), sectionId: 'correccao', client, creds: CREDS });
  assert.equal(client.calls.length, 2);
  assert.deepEqual(r.avisos, []);

  const numbers = fakeClient(reply({ texto: 'A taxa de erro foi de 37 % nos grupos.' }));
  const n = await generateSection({ draft: approvedDraft(), sectionId: 'correccao', client: numbers, creds: CREDS });
  assert.equal(numbers.calls.length, 1);
  assert.ok(n.avisos.some((a) => a.regra === 'numero'));
});

test('formato blocks outside the planned duration are an error for the retry', async () => {
  const long = { blocos: [{ minutos: 90, texto: 'Tudo.' }] };
  const client = fakeClient(reply(long), reply(VALID.formato));
  const r = await generateSection({ draft: approvedDraft(), sectionId: 'formato', client, creds: CREDS });
  assert.equal(client.calls.length, 2);
  assert.match(client.calls[1].message, /fora da duração/);
  assert.deepEqual(r.avisos, []);
});

test('invalid JSON twice is a format error', async () => {
  const client = fakeClient(reply('nada'));
  await assert.rejects(
    generateSection({ draft: approvedDraft(), sectionId: 'papeis', client, creds: CREDS }),
    (e) => e instanceof IaeduError && e.code === 'formato',
  );
  assert.equal(client.calls.length, 2);
});

test('beforeCall runs before each call; a refused retry keeps the first result with its avisos', async () => {
  const seven = Array.from({ length: 7 }, (_, i) => ({ lead: `A${i}.`, texto: 'T.' }));
  const client = fakeClient(reply(seven));
  let n = 0;
  const beforeCall = () => {
    n += 1;
    if (n > 1) throw new Error('limite');
  };
  const r = await generateSection({ draft: approvedDraft(), sectionId: 'armadilhas', client, creds: CREDS, beforeCall });
  assert.equal(client.calls.length, 1);
  assert.ok(r.avisos.some((a) => /7 itens/.test(a.texto)));
  assert.ok(r.avisos.some((a) => a.regra === 'limite'));
});

// ---------------------------------------------------------------- routes

test('gerar before the plan is approved returns 409', async (t) => {
  const client = fakeClient(reply(VALID.formato));
  const { app, ana, draft } = await appWithDraft(t, client, { approve: false });
  const r = await app.call('POST', `/rascunhos/${draft.id}/seccoes/formato/gerar`, { cookie: ana.cookie, body: { rev: draft.rev } });
  assert.equal(r.status, 409);
  assert.equal(r.json.erro, 'Aprove o plano antes de gerar secções.');
  assert.equal(client.calls.length, 0);
});

test('gerar for regime_ia, referencias or declaracao returns 400', async (t) => {
  const client = fakeClient(reply({}));
  const { app, ana, draft } = await appWithDraft(t, client);
  for (const sec of ['regime_ia', 'referencias', 'declaracao', 'meta']) {
    const r = await app.call('POST', `/rascunhos/${draft.id}/seccoes/${sec}/gerar`, { cookie: ana.cookie, body: { rev: draft.rev } });
    assert.equal(r.status, 400, sec);
    assert.match(r.json.erro, /código/);
  }
  assert.equal((await app.call('POST', `/rascunhos/${draft.id}/seccoes/inexistente/gerar`, { cookie: ana.cookie, body: { rev: draft.rev } })).status, 404);
  assert.equal(client.calls.length, 0);
});

test('gerar stores the section with the model name, a new thread and a new rev', async (t) => {
  const client = fakeClient(reply(VALID.formato));
  const { app, ana, draft } = await appWithDraft(t, client);
  const r = await app.call('POST', `/rascunhos/${draft.id}/seccoes/formato/gerar`, { cookie: ana.cookie, body: { rev: draft.rev } });
  assert.equal(r.status, 200, r.text);
  const sec = r.json.rascunho.seccoes.formato;
  assert.equal(sec.estado, 'gerada');
  assert.equal(sec.modelo, MODEL);
  assert.deepEqual(sec.dados, VALID.formato);
  assert.equal(r.json.rascunho.rev, draft.rev + 1);
  const thread1 = r.json.rascunho.threads.formato;
  assert.match(thread1, /^thr-/);
  assert.equal(client.calls[0].key, 'sk-usr-shared');

  const again = await app.call('POST', `/rascunhos/${draft.id}/seccoes/formato/gerar`, {
    cookie: ana.cookie,
    body: { rev: draft.rev + 1, comentario: 'Menos tempo no plenário.' },
  });
  assert.equal(again.status, 200);
  assert.notEqual(again.json.rascunho.threads.formato, thread1);
  assert.match(client.calls[1].message, /Menos tempo no plenário\./);
  assert.match(client.calls[1].message, /Plenário\./); // the previous version
  const stored = app.store.read(`rascunhos/${ana.id}/${draft.id}.json`);
  assert.equal(stored.seccoes.formato.modelo, MODEL);
});

test('gerar with an old rev returns 409 and calls no model', async (t) => {
  const client = fakeClient(reply(VALID.formato));
  const { app, ana, draft } = await appWithDraft(t, client);
  const r = await app.call('POST', `/rascunhos/${draft.id}/seccoes/formato/gerar`, { cookie: ana.cookie, body: { rev: draft.rev - 1 } });
  assert.equal(r.status, 409);
  assert.equal(client.calls.length, 0);
});

test('own key: an auth error returns 401 with the key message, and the shared key is not tried', async (t) => {
  const client = fakeClient(new IaeduError('auth'));
  const { app, ana, draft } = await appWithDraft(t, client);
  const r = await app.call('POST', `/rascunhos/${draft.id}/seccoes/formato/gerar`, {
    cookie: ana.cookie,
    body: { rev: draft.rev },
    headers: { 'x-iaedu-key': 'sk-usr-own', 'x-iaedu-agent': 'agent-own', 'x-iaedu-channel': 'chan-own' },
  });
  assert.equal(r.status, 401);
  assert.equal(r.json.erro, 'A chave IAedu indicada não é válida.');
  assert.equal(r.json.motivo, 'auth');
  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0].key, 'sk-usr-own');
  // The session is still valid.
  assert.equal((await app.call('GET', '/me', { cookie: ana.cookie })).status, 200);
});

test('?modelo=amalia uses the alternative credentials', async (t) => {
  const client = fakeClient(reply(VALID.papeis, 'amalia-llm/amalia-v1.0'));
  const { app, ana, draft } = await appWithDraft(t, client, { env: { ...SHARED, ...ALT } });
  const r = await app.call('POST', `/rascunhos/${draft.id}/seccoes/papeis/gerar?modelo=amalia`, { cookie: ana.cookie, body: { rev: draft.rev } });
  assert.equal(r.status, 200, r.text);
  assert.equal(client.calls[0].key, 'sk-usr-alt');
  assert.equal(r.json.rascunho.seccoes.papeis.modelo, 'amalia-llm/amalia-v1.0');
});

test('call 201 of the day returns 429 and calls no model', async (t) => {
  const client = fakeClient(reply(VALID.formato));
  const { app, ana, draft } = await appWithDraft(t, client);
  const day = new Date().toISOString().slice(0, 10);
  app.store.write('usage.json', { [day]: { [ana.id]: 200 } });
  const r = await app.call('POST', `/rascunhos/${draft.id}/seccoes/formato/gerar`, { cookie: ana.cookie, body: { rev: draft.rev } });
  assert.equal(r.status, 429);
  assert.equal(r.json.erro, 'Atingiu o limite diário de pedidos ao modelo.');
  assert.equal(client.calls.length, 0);
});

test('every model call counts: a retry counts twice', async (t) => {
  const client = fakeClient(reply('não é JSON'), reply(VALID.formato));
  const { app, ana, draft } = await appWithDraft(t, client);
  await app.call('POST', `/rascunhos/${draft.id}/seccoes/formato/gerar`, { cookie: ana.cookie, body: { rev: draft.rev } });
  const day = new Date().toISOString().slice(0, 10);
  assert.equal(app.store.read('usage.json')[day][ana.id], 2);
});

test('teacher edit: schema errors are 400; the model lints do not run; the section is accepted as the teacher text', async (t) => {
  const { app, ana, draft } = await appWithDraft(t, fakeClient(reply({})));
  const url = `/rascunhos/${draft.id}/seccoes/armadilhas`;
  const bad = await app.call('PUT', url, { cookie: ana.cookie, body: { rev: draft.rev, dados: VALID.armadilhas.slice(0, 2) } });
  assert.equal(bad.status, 400);
  assert.ok(bad.json.erros.some((e) => /2 itens/.test(e)));

  // Language, number and reference lints are for model text only (an emoji is refused: see review-7-9.test.js).
  const dados = [...VALID.armadilhas.slice(0, 2), { lead: 'O objetivo dos alunos.', texto: 'Com 37 % de erros. Ver doi:10.1000/x.' }];
  const ok = await app.call('PUT', url, { cookie: ana.cookie, body: { rev: draft.rev, dados } });
  assert.equal(ok.status, 200, ok.text);
  const sec = ok.json.rascunho.seccoes.armadilhas;
  assert.equal(sec.estado, 'aceite');
  assert.equal(sec.origem, 'docente');
  assert.deepEqual(sec.avisos, []);

  for (const code of ['regime_ia', 'referencias', 'declaracao']) {
    const r = await app.call('PUT', `/rascunhos/${draft.id}/seccoes/${code}`, { cookie: ana.cookie, body: { rev: draft.rev + 1, dados: {} } });
    assert.equal(r.status, 400, code);
  }
});

test('aceitar marks a generated section as accepted; an empty section cannot be accepted', async (t) => {
  const client = fakeClient(reply(VALID.papeis));
  const { app, ana, draft } = await appWithDraft(t, client);
  const empty = await app.call('POST', `/rascunhos/${draft.id}/seccoes/papeis/aceitar`, { cookie: ana.cookie, body: { rev: draft.rev } });
  assert.equal(empty.status, 409);
  const g = await app.call('POST', `/rascunhos/${draft.id}/seccoes/papeis/gerar`, { cookie: ana.cookie, body: { rev: draft.rev } });
  const a = await app.call('POST', `/rascunhos/${draft.id}/seccoes/papeis/aceitar`, { cookie: ana.cookie, body: { rev: g.json.rascunho.rev } });
  assert.equal(a.status, 200);
  assert.equal(a.json.rascunho.seccoes.papeis.estado, 'aceite');
  assert.equal(a.json.rascunho.seccoes.papeis.modelo, MODEL);
});

test('PUT referencias: curated ids take the catalogue text; typed entries are marked docente', async (t) => {
  const { app, ana, draft } = await appWithDraft(t, fakeClient(reply({})));
  const url = `/rascunhos/${draft.id}/referencias`;
  const r = await app.call('PUT', url, {
    cookie: ana.cookie,
    body: { rev: draft.rev, referencias: [{ id: 'nicol-2006' }, { texto: 'Silva A. Um livro que o docente leu. 2020.' }] },
  });
  assert.equal(r.status, 200, r.text);
  const refs = r.json.rascunho.referencias;
  assert.equal(refs[0].id, 'nicol-2006');
  assert.equal(refs[0].origem, 'curada');
  assert.match(refs[0].texto, /^Nicol DJ/);
  assert.deepEqual(refs[1], { texto: 'Silva A. Um livro que o docente leu. 2020.', origem: 'docente' });
  const unknown = await app.call('PUT', url, { cookie: ana.cookie, body: { rev: draft.rev + 1, referencias: [{ id: 'inventada-2099' }] } });
  assert.equal(unknown.status, 400);
  const list = await app.call('GET', '/referencias', { cookie: ana.cookie });
  assert.ok(list.json.referencias.some((x) => x.id === 'holderried-2024'));
});

test('objectivo/sugerir returns up to two suggestions with the verb check and does not change the draft', async (t) => {
  const client = fakeClient(
    reply({ sugestoes: ['Conduzir uma anamnese estruturada.', 'Compreender a anamnese.', 'Identificar sinais de alarme.'] }),
  );
  const { app, ana, draft } = await appWithDraft(t, client, { approve: false });
  const r = await app.call('POST', `/rascunhos/${draft.id}/objectivo/sugerir`, { cookie: ana.cookie, body: {} });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.sugestoes.length, 2);
  assert.deepEqual(r.json.sugestoes[0], { texto: 'Conduzir uma anamnese estruturada.', ok: true, verbo: 'conduzir', avisos: [] });
  assert.equal(r.json.sugestoes[1].ok, false);
  assert.match(client.calls[0].message, /sustenta uma posição/);
  assert.equal(app.store.read(`rascunhos/${ana.id}/${draft.id}.json`).rev, draft.rev);
});

test('padroes/explicar explains only the filtered patterns', async (t) => {
  const client = fakeClient((opts) =>
    reply({
      explicacoes: [
        { id: 'advogado_diabo', texto: 'Serve porque a posição é tomada antes.' },
        { id: 'jigsaw', texto: 'Não foi proposto.' },
      ],
    }),
  );
  const { app, ana, draft } = await appWithDraft(t, client, { approve: false });
  const r = await app.call('POST', `/rascunhos/${draft.id}/padroes/explicar`, { cookie: ana.cookie, body: {} });
  assert.equal(r.status, 200, r.text);
  const ids = r.json.padroes.map((p) => p.id);
  assert.ok(ids.includes('advogado_diabo'));
  assert.ok(!ids.includes('jigsaw'));
  assert.equal(r.json.padroes.find((p) => p.id === 'advogado_diabo').explicacao, 'Serve porque a posição é tomada antes.');
  assert.match(client.calls[0].message, /advogado_diabo/);
});
