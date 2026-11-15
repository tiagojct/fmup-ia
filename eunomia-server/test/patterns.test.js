'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const { CATALOGUE, filterPatterns } = require('../src/patterns.js');
const { repoPath } = require('../src/paths.js');
const { respostasCompletas } = require('./helpers.js');

// The same values as the interview and regime_ia.papel in the ficha schema.
const PAPEIS = ['nenhum', 'contraparte', 'ferramenta', 'objecto_de_critica'];

function answers({ papel = 'contraparte', min = 40, max = 50, modalidade = 'em_aula', area = 'bioetica' } = {}) {
  const r = respostasCompletas();
  r.papel_ia = { papel };
  r.contexto = { ...r.contexto, duracao_min: min, modalidade, area };
  if (max === null) delete r.contexto.duracao_max;
  else r.contexto.duracao_max = max;
  return r;
}

test('the catalogue has the six ficha mechanisms (revisto) and six patterns without AI (rascunho)', () => {
  assert.equal(CATALOGUE.length, 12);
  const revisto = CATALOGUE.filter((p) => p.estado === 'revisto');
  const rascunho = CATALOGUE.filter((p) => p.estado === 'rascunho');
  assert.equal(revisto.length, 6);
  assert.equal(rascunho.length, 6);
  assert.ok(revisto.every((p) => p.papel_ia !== 'nenhum' && p.ficha_exemplo));
  assert.ok(rascunho.every((p) => p.papel_ia === 'nenhum' && p.ficha_exemplo === undefined));
  assert.equal(new Set(CATALOGUE.map((p) => p.id)).size, 12);
});

test('every pattern has the fields of the design', () => {
  for (const p of CATALOGUE) {
    for (const f of ['id', 'nome', 'mecanismo', 'competencia', 'quando_serve', 'quando_nao_serve', 'formato_grupo']) {
      assert.ok(typeof p[f] === 'string' && p[f].trim() !== '', `${p.id}.${f}`);
    }
    assert.ok(PAPEIS.includes(p.papel_ia), p.id);
    if (p.duracao_tipica !== null) {
      assert.ok(Number.isInteger(p.duracao_tipica.min) && Number.isInteger(p.duracao_tipica.max), p.id);
      assert.ok(p.duracao_tipica.min <= p.duracao_tipica.max, p.id);
    }
    assert.ok(Array.isArray(p.armadilhas) && p.armadilhas.length >= 3, p.id);
  }
});

test('the example fichas exist in training/fichas, and their pitfalls are the ficha pitfalls', () => {
  for (const p of CATALOGUE.filter((x) => x.ficha_exemplo)) {
    const m = /^https:\/\/tiagojacinto\.eu\/fmup-ia\/training\/fichas\/([\w-]+)\.html$/.exec(p.ficha_exemplo);
    assert.ok(m, p.ficha_exemplo);
    assert.ok(fs.existsSync(repoPath('training', 'fichas', `${m[1]}.qmd`)), p.ficha_exemplo);
    const n = m[1].split('-')[0];
    const ficha = JSON.parse(fs.readFileSync(repoPath('eunomia-server', 'referencia', `ficha-${n}.json`), 'utf8'));
    assert.deepEqual(p.armadilhas, ficha.armadilhas.map((a) => a.lead), p.id);
    assert.equal(p.formato_grupo, ficha.meta.formato, p.id);
  }
});

test('filterPatterns with papel nenhum returns only patterns without AI', () => {
  const found = filterPatterns(answers({ papel: 'nenhum', min: 60, max: 90 }), CATALOGUE);
  assert.ok(found.length >= 2);
  assert.ok(found.every((p) => p.papel_ia === 'nenhum'));
});

test('filterPatterns keeps the patterns with the AI role of the interview', () => {
  for (const [papel, min, max] of [['contraparte', 40, 50], ['objecto_de_critica', 60, 60], ['ferramenta', 40, 50]]) {
    const found = filterPatterns(answers({ papel, min, max }), CATALOGUE);
    assert.ok(found.length >= 1, papel);
    assert.ok(found.every((p) => p.papel_ia === papel), papel);
  }
});

test('filterPatterns with 30 minutes excludes patterns whose typical minimum is over 30', () => {
  for (const papel of ['nenhum', 'contraparte', 'objecto_de_critica', 'ferramenta']) {
    const found = filterPatterns(answers({ papel, min: 30, max: null }), CATALOGUE);
    assert.ok(found.every((p) => p.duracao_tipica && p.duracao_tipica.min <= 30), papel);
  }
});

test('filterPatterns never returns more than 3', () => {
  const wide = filterPatterns(answers({ papel: 'nenhum', min: 120, max: 240 }), CATALOGUE);
  assert.equal(wide.length, 3);
});

test('a continuous pattern (no typical duration) appears only outside class', () => {
  const inClass = filterPatterns(answers({ papel: 'ferramenta', min: 600, max: 600 }), CATALOGUE);
  assert.ok(inClass.every((p) => p.duracao_tipica !== null));
  const outside = filterPatterns(answers({ papel: 'ferramenta', modalidade: 'autonomo' }), CATALOGUE);
  assert.ok(outside.some((p) => p.duracao_tipica === null));
});

test('filterPatterns ranks the patterns that name the area first', () => {
  const ats = filterPatterns(answers({ papel: 'nenhum', min: 60, max: 90, area: 'ats' }), CATALOGUE);
  assert.equal(ats[0].id, 'apreciacao_checklist');
});

test('filterPatterns without answers returns at most 3 and does not throw', () => {
  assert.ok(filterPatterns({}, CATALOGUE).length <= 3);
});

test('the catalogue uses the AI role values of the ficha schema', () => {
  const schema = JSON.parse(fs.readFileSync(repoPath('eunomia', 'ficha.schema.json'), 'utf8'));
  const values = schema.$defs.regime_ia.properties.papel.enum;
  assert.deepEqual(values, PAPEIS);
  for (const p of CATALOGUE) assert.ok(values.includes(p.papel_ia), p.id);
});
