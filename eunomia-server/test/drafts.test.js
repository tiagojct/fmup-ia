'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  INTERVIEW,
  createDraft,
  applyAnswer,
  nextStep,
  approvePlan,
  markStale,
  checkOutcomeVerb,
  purgeOldDrafts,
  DraftError,
} = require('../src/drafts.js');
const { createStore } = require('../src/store.js');
const { lintSection } = require('../src/lint.js');
const { repoPath } = require('../src/paths.js');
const { startApp, respostasCompletas } = require('./helpers.js');

const USER = { id: 'a1b2c3d4', name: 'Ana Docente', role: 'teacher' };
const ORDER = ['contexto', 'objectivo', 'evidencia', 'papel_ia', 'regime', 'regime_themis', 'padrao', 'materiais', 'plano'];

function answerAll(draft, respostas) {
  let d = draft;
  for (const [step, value] of Object.entries(respostas)) {
    const r = applyAnswer(d, step, value);
    assert.deepEqual(r.errors, [], `erros no passo ${step}`);
    d = r.draft;
  }
  return d;
}

// ---------------------------------------------------------------- interview.json

test('interview.json has the nine steps in the order of the design', () => {
  assert.deepEqual(INTERVIEW.passos.map((p) => p.id), ORDER);
});

test('every step has a titulo, fields, a short porque and a link to a page of the site that exists', () => {
  for (const step of INTERVIEW.passos) {
    assert.ok(step.titulo, step.id);
    assert.ok(Array.isArray(step.campos) && step.campos.length > 0, step.id);
    const sentences = step.porque.split(/[.!?](?:\s|$)/).filter((s) => s.trim() !== '');
    assert.ok(sentences.length >= 1 && sentences.length <= 2, `${step.id}: porque com ${sentences.length} frases`);
    assert.ok(step.ligacao && step.ligacao.rotulo, step.id);
    const m = /^https:\/\/tiagojacinto\.eu\/fmup-ia\/([^#]*?)(?:\.html)?(?:#.*)?$/.exec(step.ligacao.url);
    assert.ok(m, `${step.id}: ligação fora do site: ${step.ligacao.url}`);
    const rel = m[1];
    const exists =
      fs.existsSync(repoPath(`${rel}.qmd`)) || fs.existsSync(repoPath(rel, 'index.html')) || fs.existsSync(repoPath(rel, 'index.qmd'));
    assert.ok(exists, `${step.id}: a página ${rel} não existe no repositório`);
  }
});

test('contexto has the seven areas and the Themis course types', () => {
  const contexto = INTERVIEW.passos.find((p) => p.id === 'contexto');
  const area = contexto.campos.find((c) => c.id === 'area');
  assert.deepEqual(area.opcoes.map((o) => o.id), [
    'cuidados_primarios',
    'bioetica',
    'cuidados_paliativos',
    'informatica',
    'saude_digital',
    'ia',
    'ats',
  ]);
  const nivel = contexto.campos.find((c) => c.id === 'nivel');
  assert.deepEqual(nivel.opcoes.map((o) => o.id), ['uc_undergrad', 'uc_master', 'uc_phd', 'cpd', 'other']);
});

test('the evidence step carries the Annex I texts for bioethics, health informatics and AI only', () => {
  const evidencia = INTERVIEW.passos.find((p) => p.id === 'evidencia');
  assert.deepEqual(Object.keys(evidencia.porque_area).sort(), ['bioetica', 'ia', 'informatica']);
  const annex = fs.readFileSync(repoPath('quadro', 'I-perfis-disciplinares.qmd'), 'utf8');
  const plain = (s) => s.replace(/[*_]/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  for (const { perfil, texto } of Object.values(evidencia.porque_area)) {
    assert.ok(annex.includes(`## ${perfil}`.replace(/software/, '_software_')), `perfil ${perfil}`);
    // The first sentence is copied from the Annex.
    assert.ok(plain(annex).includes(texto.split('. ')[0]), `texto do perfil ${perfil}`);
  }
});

test('the authored interview, pattern and verb texts pass the language and emoji lints', () => {
  const texts = [];
  const walk = (x) => {
    if (typeof x === 'string') texts.push(x);
    else if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === 'object') Object.values(x).forEach(walk);
  };
  for (const file of ['interview.json', 'patterns.json', 'verbos.json']) {
    walk(JSON.parse(fs.readFileSync(repoPath('eunomia', file), 'utf8')));
  }
  for (const text of texts) {
    const found = lintSection('correccao', text, {}).filter((w) => w.rule === 'lingua' || w.rule === 'estilo');
    assert.deepEqual(found, [], text);
  }
});

// ---------------------------------------------------------------- the state machine

test('nextStep walks the steps in order and skips regime_themis for a formative activity', () => {
  let d = createDraft(USER, 'criar');
  assert.equal(nextStep(d), 'contexto');
  const respostas = respostasCompletas();
  const seen = [];
  for (const [step, value] of Object.entries(respostas)) {
    seen.push(nextStep(d));
    d = applyAnswer(d, step, value).draft;
  }
  assert.deepEqual(seen, ORDER.filter((s) => s !== 'regime_themis'));
  assert.equal(nextStep(d), 'plano'); // answered, not yet approved
  d = approvePlan(d);
  assert.equal(nextStep(d), null);
});

test('nextStep asks regime_themis for a summative activity', () => {
  const respostas = respostasCompletas();
  respostas.evidencia.avaliacao = 'sumativa';
  let d = createDraft(USER, 'criar');
  for (const step of ['contexto', 'objectivo', 'evidencia', 'papel_ia', 'regime']) d = applyAnswer(d, step, respostas[step]).draft;
  assert.equal(nextStep(d), 'regime_themis');
  d = applyAnswer(d, 'regime_themis', { policy: 'not_permitted', assignment: ['case_discussion'] }).draft;
  assert.equal(nextStep(d), 'padrao');
});

test('applyAnswer checks required fields, options, numbers and conditional fields', () => {
  const d = createDraft(USER, 'criar');
  const ctx = respostasCompletas().contexto;

  assert.match(applyAnswer(d, 'contexto', { ...ctx, uc: '' }).errors.join(' '), /Unidade curricular/);
  assert.match(applyAnswer(d, 'contexto', { ...ctx, area: 'cardiologia' }).errors.join(' '), /Área/);
  assert.match(applyAnswer(d, 'contexto', { ...ctx, estudantes: 'muitos' }).errors.join(' '), /Número de estudantes/);
  assert.match(applyAnswer(d, 'contexto', { ...ctx, duracao_max: 20 }).errors.join(' '), /duração máxima/i);
  assert.match(applyAnswer(d, 'contexto', { ...ctx, extra: 1 }).errors.join(' '), /não previsto/);
  assert.match(applyAnswer(d, 'regime', { regime: 'condicionado' }).errors.join(' '), /Condições/);
  assert.deepEqual(applyAnswer(d, 'regime', { regime: 'condicionado', condicoes: 'Com registo do prompt.' }).errors, []);
  assert.match(applyAnswer(d, 'padrao', { padrao: 'inexistente' }).errors.join(' '), /Padrão/);
  assert.match(applyAnswer(d, 'nao_existe', {}).errors.join(' '), /Passo desconhecido/);

  // regime_themis does not apply to a formative activity.
  const formative = applyAnswer(d, 'evidencia', respostasCompletas().evidencia).draft;
  assert.match(applyAnswer(formative, 'regime_themis', { policy: 'not_permitted', assignment: ['essay'] }).errors.join(' '), /não se aplica/);

  // A valid answer does not change the draft that was passed in.
  const ok = applyAnswer(d, 'contexto', ctx);
  assert.deepEqual(ok.errors, []);
  assert.equal(d.respostas.contexto, undefined);
  assert.equal(ok.draft.respostas.contexto.uc, 'Bioética Clínica');
});

test('an outcome without an observable verb is kept, with a warning', () => {
  const d = createDraft(USER, 'criar');
  const r = applyAnswer(d, 'objectivo', { texto: 'Compreender a anamnese', competencia_protegida: 'A recolha.', competencia: 'Anamnese' });
  assert.deepEqual(r.errors, []);
  assert.equal(r.draft.respostas.objectivo.texto, 'Compreender a anamnese');
  assert.match(r.avisos.join(' '), /verbo observável/);
});

test('approvePlan refuses a draft with missing steps', () => {
  const d = createDraft(USER, 'criar');
  assert.throws(() => approvePlan(d), (e) => e instanceof DraftError && /contexto/i.test(e.erros.join(' ')));
});

test('after approvePlan, changing objectivo marks objectivo, formato, correccao and armadilhas as a-actualizar', () => {
  let d = approvePlan(answerAll(createDraft(USER, 'criar'), respostasCompletas()));
  assert.equal(d.plano_aprovado, true);
  assert.deepEqual(Object.keys(d.seccoes).sort(), ['armadilhas', 'correccao', 'formato', 'objectivo', 'papeis', 'plano_b', 'prompt_base']);
  for (const s of Object.values(d.seccoes)) assert.equal(s.estado, 'vazia');
  for (const id of Object.keys(d.seccoes)) d.seccoes[id] = { dados: { texto: 'x' }, estado: 'aceite', avisos: [], modelo: null };

  const objectivo = { ...d.respostas.objectivo, texto: 'No fim da actividade, o estudante defende uma posição.' };
  d = applyAnswer(d, 'objectivo', objectivo).draft;
  const stale = Object.entries(d.seccoes).filter(([, s]) => s.estado === 'a-actualizar').map(([id]) => id).sort();
  assert.deepEqual(stale, ['armadilhas', 'correccao', 'formato', 'objectivo']);

  // The same answer again changes nothing.
  for (const id of Object.keys(d.seccoes)) d.seccoes[id].estado = 'aceite';
  d = applyAnswer(d, 'objectivo', objectivo).draft;
  assert.ok(Object.values(d.seccoes).every((s) => s.estado === 'aceite'));
});

test('markStale leaves empty sections empty', () => {
  const d = createDraft(USER, 'criar');
  d.seccoes = { formato: { estado: 'vazia', avisos: [] }, papeis: { estado: 'gerada', dados: {}, avisos: [] } };
  const out = markStale(d, ['padrao']);
  assert.equal(out.seccoes.formato.estado, 'vazia');
  assert.equal(out.seccoes.papeis.estado, 'a-actualizar');
});

test('with AI role nenhum, no prompt_base and no plano_b section', () => {
  const respostas = respostasCompletas();
  respostas.papel_ia = { papel: 'nenhum' };
  respostas.padrao = { padrao: 'debate_posicoes' };
  const d = approvePlan(answerAll(createDraft(USER, 'criar'), respostas));
  assert.deepEqual(Object.keys(d.seccoes).sort(), ['armadilhas', 'correccao', 'formato', 'objectivo', 'papeis']);
});

// ---------------------------------------------------------------- the outcome verb

test('checkOutcomeVerb: the examples of the brief', () => {
  assert.equal(checkOutcomeVerb('Compreender a anamnese').ok, false);
  assert.equal(checkOutcomeVerb('Compreender a anamnese').verbo, null);
  const r = checkOutcomeVerb('Conduzir uma anamnese estruturada');
  assert.equal(r.ok, true);
  assert.equal(r.verbo, 'conduzir');
});

test('checkOutcomeVerb finds conjugated verbs in the objectives of the reference fichas', () => {
  const expected = { 1: 'conduzir', 2: 'identificar', 3: 'enunciar', 4: 'sustentar', 5: 'comparar' };
  for (const [n, verbo] of Object.entries(expected)) {
    const ficha = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'referencia', `ficha-${n}.json`), 'utf8'));
    assert.deepEqual(checkOutcomeVerb(ficha.objectivo.texto).verbo, verbo, `ficha ${n}`);
  }
});

test('checkOutcomeVerb does not take a noun after an article for a verb', () => {
  assert.equal(checkOutcomeVerb('Saber fazer a análise e a crítica').ok, false);
  assert.equal(checkOutcomeVerb('Conhecer a lista de verificação').ok, false);
  assert.equal(checkOutcomeVerb('Os estudantes propõem um plano').verbo, 'propor');
  assert.equal(checkOutcomeVerb('O estudante constrói uma rubrica').verbo, 'construir');
});

// ---------------------------------------------------------------- purge

test('purgeOldDrafts removes a rascunho untouched for 366 days and keeps a submetida one', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eunomia-purge-'));
  try {
    const store = createStore(dir);
    const now = Date.parse('2027-11-15T12:00:00Z');
    const old = new Date(now - 366 * 86400000).toISOString();
    const recent = new Date(now - 10 * 86400000).toISOString();
    const base = { autor: { id: 'u1', nome: 'X' }, modo: 'criar', rev: 1, respostas: {}, seccoes: {} };
    store.write('rascunhos/u1/aaaaaaaaaaaa.json', { ...base, id: 'aaaaaaaaaaaa', estado: 'rascunho', actualizado: old, aberto: old });
    store.write('rascunhos/u1/bbbbbbbbbbbb.json', { ...base, id: 'bbbbbbbbbbbb', estado: 'submetida', actualizado: old, aberto: old });
    store.write('rascunhos/u1/cccccccccccc.json', { ...base, id: 'cccccccccccc', estado: 'rascunho', actualizado: recent, aberto: recent });
    store.write('rascunhos/u1/dddddddddddd.json', { ...base, id: 'dddddddddddd', estado: 'rascunho', actualizado: old, aberto: recent });
    const removed = purgeOldDrafts(store, now, 365);
    assert.equal(removed, 1);
    assert.deepEqual(store.list('rascunhos/u1'), ['bbbbbbbbbbbb.json', 'cccccccccccc.json', 'dddddddddddd.json']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- routes

test('routes: create, list, answer, approve; an old rev returns 409', async (t) => {
  const app = await startApp(t);
  const ana = await app.person('Ana Docente');

  const created = await app.call('POST', '/rascunhos', { cookie: ana.cookie, body: { modo: 'criar' } });
  assert.equal(created.status, 201);
  const { id, rev } = created.json.rascunho;
  assert.match(id, /^[0-9a-f]{12}$/);
  assert.equal(created.json.proximo_passo, 'contexto');

  const list = await app.call('GET', '/rascunhos', { cookie: ana.cookie });
  assert.deepEqual(list.json.rascunhos.map((r) => r.id), [id]);

  const put = await app.call('PUT', `/rascunhos/${id}/respostas/contexto`, {
    cookie: ana.cookie,
    body: { rev, valor: respostasCompletas().contexto },
  });
  assert.equal(put.status, 200);
  assert.equal(put.json.rascunho.rev, rev + 1);
  assert.equal(put.json.proximo_passo, 'objectivo');

  const stale = await app.call('PUT', `/rascunhos/${id}/respostas/objectivo`, {
    cookie: ana.cookie,
    body: { rev, valor: respostasCompletas().objectivo },
  });
  assert.equal(stale.status, 409);
  assert.equal(stale.json.erro, 'O rascunho foi alterado noutra janela. Recarregue a página.');

  const bad = await app.call('PUT', `/rascunhos/${id}/respostas/contexto`, {
    cookie: ana.cookie,
    body: { rev: rev + 1, valor: { uc: '' } },
  });
  assert.equal(bad.status, 400);
  assert.ok(bad.json.erros.length > 0);

  const early = await app.call('POST', `/rascunhos/${id}/plano/aprovar`, { cookie: ana.cookie, body: { rev: rev + 1 } });
  assert.equal(early.status, 409);
  assert.match(early.json.erro, /objectivo/i);
});

test('routes: a teacher reading another teacher draft gets 404; an admin gets 200', async (t) => {
  const app = await startApp(t);
  const ana = await app.person('Ana Docente');
  const rui = await app.person('Rui Docente');
  const tiago = await app.person('Tiago', 'admin');
  const { id } = (await app.call('POST', '/rascunhos', { cookie: ana.cookie, body: {} })).json.rascunho;

  assert.equal((await app.call('GET', `/rascunhos/${id}`, { cookie: rui.cookie })).status, 404);
  assert.equal((await app.call('PUT', `/rascunhos/${id}/respostas/contexto`, { cookie: rui.cookie, body: { rev: 1, valor: {} } })).status, 404);
  const admin = await app.call('GET', `/rascunhos/${id}`, { cookie: tiago.cookie });
  assert.equal(admin.status, 200);
  assert.equal(admin.json.rascunho.id, id);
  assert.equal((await app.call('GET', `/rascunhos/${id}`, { cookie: ana.cookie })).status, 200);
  assert.equal((await app.call('GET', '/rascunhos/naoexiste', { cookie: ana.cookie })).status, 404);
  assert.equal((await app.call('GET', `/rascunhos/${id}`)).status, 401);
});

test('routes: GET /padroes filters by the draft answers', async (t) => {
  const app = await startApp(t);
  const ana = await app.person('Ana Docente');
  let draft = (await app.call('POST', '/rascunhos', { cookie: ana.cookie, body: {} })).json.rascunho;
  for (const step of ['contexto', 'objectivo', 'evidencia', 'papel_ia']) {
    const valor = step === 'papel_ia' ? { papel: 'nenhum' } : respostasCompletas()[step];
    draft = (await app.call('PUT', `/rascunhos/${draft.id}/respostas/${step}`, { cookie: ana.cookie, body: { rev: draft.rev, valor } })).json.rascunho;
  }
  const r = await app.call('GET', `/padroes?rascunho=${draft.id}`, { cookie: ana.cookie });
  assert.equal(r.status, 200);
  assert.ok(r.json.padroes.length >= 2 && r.json.padroes.length <= 3);
  assert.ok(r.json.padroes.every((p) => p.papel_ia === 'nenhum'));
  const all = await app.call('GET', '/padroes', { cookie: ana.cookie });
  assert.equal(all.json.padroes.length, 12);
});
