'use strict';

// The worked examples (eunomia/exemplos.json): one per reference ficha, each a set of interview
// answers that passes the server's validation and leads to its ficha. Examples 1 to 6 follow the
// six training fichas; example 7 is written for Eunomia (an activity without AI).

const test = require('node:test');
const assert = require('node:assert/strict');

const drafts = require('../src/drafts.js');
const { findPattern, filterPatterns } = require('../src/patterns.js');
const { lintSection, lintEmoji } = require('../src/lint.js');
const { validateFicha, renderSection } = require('../src/ficha.js');
const { composeRegime, REGIMES, MISMATCH } = require('../src/regime.js');
const { EXEMPLOS, findExample, referenceFicha, draftFromExample } = require('../src/exemplos.js');
const { startApp } = require('./helpers.js');

const USER = { id: 'u1', name: 'Ana' };
const NS = [1, 2, 3, 4, 5, 6, 7];
// The examples that follow a training ficha (training/fichas).
const TRAINING = [1, 2, 3, 4, 5, 6];

test('there are seven examples, n 1 to 7, one per reference ficha', () => {
  assert.equal(EXEMPLOS.versao, 1);
  assert.equal(typeof EXEMPLOS.nota, 'string');
  assert.deepEqual(EXEMPLOS.exemplos.map((e) => e.n), NS);
  for (const n of NS) {
    const ficha = referenceFicha(n);
    assert.ok(ficha && ficha.meta, `ficha ${n}`);
    const e = findExample(n);
    assert.ok(e.titulo && typeof e.titulo === 'string', `exemplo ${n}: titulo`);
  }
  assert.equal(referenceFicha(8), null);
});

test('every example passes the answer validation and the plan gate', () => {
  for (const n of NS) {
    const d = draftFromExample(USER, n, Date.now());
    assert.deepEqual(drafts.missingSteps(d), [], `exemplo ${n}`);
    assert.equal(d.plano_aprovado, false);
    assert.equal(d.estado, 'rascunho');
    assert.doesNotThrow(() => drafts.approvePlan(d), `exemplo ${n}`);
  }
});

test('every example leads to its ficha', () => {
  for (const n of NS) {
    const e = findExample(n);
    const r = e.respostas;
    const p = findPattern(r.padrao.padrao);
    assert.ok(p, `exemplo ${n}: padrão ${r.padrao.padrao}`);
    if (TRAINING.includes(n)) assert.ok(p.ficha_exemplo.includes(`/${n}-`), `exemplo ${n}: padrão ${r.padrao.padrao}`);
    assert.equal(p.papel_ia, r.papel_ia.papel, `exemplo ${n}: papel`);
    const ficha = referenceFicha(n);
    if (typeof ficha.meta.duracao.min === 'number') {
      assert.equal(r.contexto.duracao_min, ficha.meta.duracao.min, `exemplo ${n}: duração mínima`);
      assert.equal(r.contexto.duracao_max, ficha.meta.duracao.max, `exemplo ${n}: duração máxima`);
    } else {
      assert.ok(e.nota && typeof e.nota.contexto === 'string' && e.nota.contexto.trim() !== '', `exemplo ${n}: nota.contexto`);
    }
    // The plan title is the ficha title without "Ficha N.", the subtitle is the ficha's.
    assert.equal(r.plano.titulo, ficha.meta.titulo.replace(/^Ficha \d+\.\s*/, ''), `exemplo ${n}: titulo`);
    assert.equal(r.plano.subtitulo, ficha.meta.subtitulo, `exemplo ${n}: subtitulo`);
  }
});

test('every answered step has a porque sentence, and por_passo names examples that answer the step', () => {
  for (const e of EXEMPLOS.exemplos) {
    for (const step of Object.keys(e.respostas)) {
      assert.ok(typeof e.porque[step] === 'string' && e.porque[step].trim() !== '', `exemplo ${e.n}: porque ${step}`);
      const sentences = e.porque[step].split(/[.!?](?:\s|$)/).filter((x) => x.trim() !== '');
      assert.equal(sentences.length, 1, `exemplo ${e.n}: porque ${step} tem ${sentences.length} frases`);
    }
    for (const step of Object.keys(e.porque)) assert.ok(e.respostas[step] !== undefined, `exemplo ${e.n}: porque sem resposta ${step}`);
    for (const [step, text] of Object.entries(e.nota || {})) {
      assert.ok(e.respostas[step] !== undefined && typeof text === 'string' && text.trim() !== '', `exemplo ${e.n}: nota ${step}`);
    }
  }
  const steps = drafts.INTERVIEW.passos.map((s) => s.id).filter((id) => id !== 'plano');
  assert.deepEqual(Object.keys(EXEMPLOS.por_passo).sort(), [...steps].sort());
  for (const [step, list] of Object.entries(EXEMPLOS.por_passo)) {
    const [min, max] = step === 'regime_themis' ? [0, 3] : [2, 3];
    assert.ok(list.length >= min && list.length <= max, `por_passo ${step}: ${list.length}`);
    for (const n of list) assert.ok(findExample(n).respostas[step] !== undefined, `por_passo ${step}: exemplo ${n}`);
  }
});

test('the example texts pass the language and emoji lints', () => {
  const texts = [];
  const walk = (x) => {
    if (typeof x === 'string') texts.push(x);
    else if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === 'object') Object.values(x).forEach(walk);
  };
  walk(EXEMPLOS);
  for (const text of texts) {
    const found = lintSection('correccao', text, {}).filter((w) => w.rule === 'lingua' || w.rule === 'estilo');
    assert.deepEqual(found, [], text);
  }
});

test('findExample accepts only an integer from 1 to 7', () => {
  for (const bad of [0, 8, '1', '7', 1.5, null, undefined, NaN, {}]) assert.equal(findExample(bad), null, String(bad));
  assert.equal(findExample(3).n, 3);
  assert.equal(findExample(7).n, 7);
});

// ---------------------------------------------------------------- example 7, without AI

test('example 7: anatomy without AI, prohibited regime, summative report with the matching Themis policy', () => {
  const e = findExample(7);
  const r = e.respostas;
  assert.equal(r.contexto.area, 'ciencias_basicas');
  assert.equal(r.contexto.area_outra, undefined);
  assert.equal(r.papel_ia.papel, 'nenhum');
  assert.equal(r.regime.regime, 'proibido');
  assert.equal(r.evidencia.avaliacao, 'sumativa');
  assert.deepEqual(r.regime_themis.assignment, ['report']);
  assert.equal(r.regime_themis.policy, REGIMES.proibido.policy);
  assert.equal(r.regime_themis.policy, 'not_permitted');
  assert.ok(drafts.checkOutcomeVerb(r.objectivo.texto).ok, 'observable verb');
  // The pattern is from the catalogue, has no AI, and the filter offers it for these answers.
  assert.ok(['jigsaw', 'discussao_caso'].includes(r.padrao.padrao));
  assert.equal(findPattern(r.padrao.padrao).papel_ia, 'nenhum');
  assert.ok(filterPatterns(r).map((p) => p.id).includes(r.padrao.padrao), 'filterPatterns offers the pattern');
  // The draft has the Themis clause and no mismatch warning.
  const reg = composeRegime(r);
  assert.ok(typeof reg.clausula === 'string' && reg.clausula.length > 0, 'clausula');
  assert.ok(!reg.avisos.includes(MISMATCH));
  const d = draftFromExample(USER, 7, Date.now());
  assert.deepEqual(drafts.applicableSections(d.respostas).filter((id) => id === 'prompt_base' || id === 'plano_b'), []);
});

test('example 7 is marked as fictitious and as not one of the six training fichas', () => {
  const e = findExample(7);
  for (const step of ['contexto', 'evidencia', 'regime', 'regime_themis']) {
    assert.ok(e.nota && typeof e.nota[step] === 'string' && e.nota[step].trim() !== '', `nota ${step}`);
  }
  assert.match(e.nota.contexto, /inventad/);
  assert.match(e.nota.contexto, /não é uma das seis fichas de formação/);
  assert.match(EXEMPLOS.nota, /sete exemplos/i);
});

test('reference ficha 7 is valid in the reference profile and passes the house-style lints', () => {
  const ficha = referenceFicha(7);
  assert.deepEqual(validateFicha(ficha, 'reference'), []);
  const r = findExample(7).respostas;
  assert.equal(ficha.meta.ferramenta, 'Nenhuma');
  assert.equal(ficha.meta.areas, drafts.areaLabel(r.contexto));
  assert.equal(ficha.meta.ano, r.contexto.programa);
  assert.equal(ficha.meta.competencia, r.objectivo.competencia);
  assert.equal(ficha.objectivo.texto, r.objectivo.texto);
  // No AI: no prompt and no plano B, as the real flow writes for papel nenhum.
  assert.equal(ficha.prompt_base, undefined);
  assert.equal(ficha.plano_b, undefined);
  // Only curated references, with the text of references.json.
  const curated = JSON.parse(require('node:fs').readFileSync(require('../src/paths.js').repoPath('eunomia', 'references.json'), 'utf8')).referencias;
  for (const ref of ficha.referencias) {
    const c = curated.find((x) => x.id === ref.id);
    assert.ok(c, `referência ${ref.id}`);
    assert.equal(ref.origem, 'curada');
    assert.ok(ref.texto.startsWith(c.texto), `referência ${ref.id}: texto`);
  }
  const ctx = { referencias: ficha.referencias, materials: '' };
  for (const id of ['meta', 'objectivo', 'formato', 'papeis', 'correccao', 'armadilhas']) {
    const md = renderSection(id, ficha[id]);
    const found = lintSection(id, md, ctx).filter((w) => w.rule === 'lingua' || w.rule === 'referencia' || w.rule === 'estilo');
    assert.deepEqual(found, [], `ficha 7, ${id}`);
    assert.deepEqual(lintEmoji(md), [], `ficha 7, ${id}`);
  }
});

test('GET /exemplos/7 without a session returns the reference ficha 7; /exemplos/8 is 404', async (t) => {
  const app = await startApp(t);
  const r = await app.call('GET', '/exemplos/7');
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.ficha, referenceFicha(7));
  const bad = await app.call('GET', '/exemplos/8');
  assert.equal(bad.status, 404);
});

test('draftFromExample throws when an example answer breaks the validation', () => {
  const e = findExample(1);
  const saved = e.respostas.contexto;
  e.respostas.contexto = { ...saved, area: 'nao_existe' };
  try {
    assert.throws(() => draftFromExample(USER, 1, Date.now()), /exemplos\.json: passo contexto: /);
  } finally {
    e.respostas.contexto = saved;
  }
});
