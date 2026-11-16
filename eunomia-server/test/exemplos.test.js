'use strict';

// The worked examples (eunomia/exemplos.json): one per reference ficha, each a set of interview
// answers that passes the server's validation and leads to its ficha.

const test = require('node:test');
const assert = require('node:assert/strict');

const drafts = require('../src/drafts.js');
const { findPattern } = require('../src/patterns.js');
const { lintSection } = require('../src/lint.js');
const { EXEMPLOS, findExample, referenceFicha, draftFromExample } = require('../src/exemplos.js');

const USER = { id: 'u1', name: 'Ana' };
const NS = [1, 2, 3, 4, 5, 6];

test('there are six examples, n 1 to 6, one per reference ficha', () => {
  assert.equal(EXEMPLOS.versao, 1);
  assert.equal(typeof EXEMPLOS.nota, 'string');
  assert.deepEqual(EXEMPLOS.exemplos.map((e) => e.n), NS);
  for (const n of NS) {
    const ficha = referenceFicha(n);
    assert.ok(ficha && ficha.meta, `ficha ${n}`);
    const e = findExample(n);
    assert.ok(e.titulo && typeof e.titulo === 'string', `exemplo ${n}: titulo`);
  }
  assert.equal(referenceFicha(7), null);
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
    assert.ok(p && p.ficha_exemplo.includes(`/${n}-`), `exemplo ${n}: padrão ${r.padrao.padrao}`);
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

test('findExample accepts only an integer from 1 to 6', () => {
  for (const bad of [0, 7, '1', 1.5, null, undefined, NaN, {}]) assert.equal(findExample(bad), null, String(bad));
  assert.equal(findExample(3).n, 3);
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
