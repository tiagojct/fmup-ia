'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const { composeRegime, renderRegime, toFichaRegime, THEMIS_VERSION } = require('../src/regime.js');
const { validateSection } = require('../src/ficha.js');
const { lintEmoji } = require('../src/lint.js');
const { repoPath } = require('../src/paths.js');

// Themis, loaded here on its own, so that the expected values do not come from the module under test.
const THEMIS_RULES = require(repoPath('themis', 'policy-rules.js'));
const POLICY = JSON.parse(fs.readFileSync(repoPath('themis', 'policy.json'), 'utf8'));
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(repoPath('themis', 'i18n', 'pt.js'), 'utf8'), sandbox);
const I18N_PT = sandbox.window.I18N_PT;
// The Themis footer has the time of generation; two calls can fall in different minutes.
const sameMinute = (s) => s.replace(/Declaração gerada a .+? através/, 'Declaração gerada a X através');
const VERSAO = /\nthemis:\n(?:[ \t]+.*\n)*?[ \t]+versao:\s*"([^"]+)"/.exec(fs.readFileSync(repoPath('_variables.yml'), 'utf8'))[1];

function respostas({ avaliacao = 'formativa', papel = 'nenhum', regime = 'proibido', condicoes, themis, nivel = 'uc_undergrad' } = {}) {
  const r = {
    contexto: { nivel },
    evidencia: { descricao: 'x', avaliacao },
    papel_ia: { papel },
    regime: { regime },
  };
  if (condicoes) r.regime.condicoes = condicoes;
  if (themis) r.regime_themis = themis;
  return r;
}

test('formative, papel nenhum, proibido: starts with "Esta actividade não usa IA." and has no clause', () => {
  const r = composeRegime(respostas());
  assert.equal(r.papel, 'nenhum');
  assert.deepEqual(r.regime, { valor: 'proibido', cor: 'vermelho', rotulo: 'vermelho: proibido' });
  assert.equal(r.clausula, undefined);
  assert.deepEqual(r.avisos, []);
  const md = renderRegime(r);
  assert.ok(md.startsWith('Esta actividade não usa IA.'), md);
  assert.match(md, /vermelho: proibido/);
});

test('the three regimes map to colour, label and Themis policy', () => {
  const map = {
    permitido: ['verde', 'verde: permitido'],
    condicionado: ['amarelo', 'amarelo: permitido com condições'],
    proibido: ['vermelho', 'vermelho: proibido'],
  };
  for (const [valor, [cor, rotulo]] of Object.entries(map)) {
    const r = composeRegime(respostas({ papel: 'ferramenta', regime: valor, condicoes: valor === 'condicionado' ? 'Com registo do prompt.' : undefined }));
    assert.equal(r.regime.cor, cor);
    assert.equal(r.regime.rotulo, rotulo);
  }
  const c = composeRegime(respostas({ papel: 'ferramenta', regime: 'condicionado', condicoes: 'Com registo do prompt.' }));
  assert.equal(c.regime.condicoes, 'Com registo do prompt.');
  assert.match(renderRegime(c), /Condições: Com registo do prompt\./);
});

test('summative not_permitted: the clause is the Themis teacherSyllabus text without the marker', () => {
  const themis = { policy: 'not_permitted', assignment: ['case_discussion'] };
  const r = composeRegime(respostas({ avaliacao: 'sumativa', themis }));
  const state = { role: 'teacher', policy: 'not_permitted', assignment: ['case_discussion'], courseType: 'uc_undergrad' };
  const full = I18N_PT.statements.teacherSyllabus(state, VERSAO, POLICY);
  assert.ok(full.startsWith(String.fromCodePoint(0x1f7e5)), 'Themis puts the red marker first');
  const expected = full.replace(String.fromCodePoint(0x1f7e5) + ' Proibido — ', '');
  assert.equal(sameMinute(r.clausula), sameMinute(expected));
  assert.ok(![...r.clausula].some((ch) => ch.codePointAt(0) >= 0x1f000 && ch.codePointAt(0) <= 0x1ffff));
  assert.deepEqual(lintEmoji(renderRegime(r)), []);
  assert.equal(THEMIS_VERSION, VERSAO);
});

test('the avisos are the message_pt of the Themis rules that the teacher state triggers', () => {
  const regimeFor = { not_permitted: 'proibido', with_disclosure: 'condicionado', without_restrictions: 'permitido' };
  for (const policy of ['not_permitted', 'with_disclosure', 'without_restrictions']) {
    const assignment = ['data_analysis', 'essay'];
    const regime = regimeFor[policy];
    const r = composeRegime(
      respostas({ avaliacao: 'sumativa', nivel: 'uc_master', regime, condicoes: regime === 'condicionado' ? 'Com declaração.' : undefined, themis: { policy, assignment } }),
    );
    const ev = THEMIS_RULES.evaluateRisk({ role: 'teacher', policy, assignment, courseType: 'uc_master' }, POLICY);
    assert.ok(ev.matches.length > 0, policy);
    assert.deepEqual(r.avisos, ev.matches.map((m) => m.message_pt), policy);
  }
});

test('the clause uses the course type and the other assignment text', () => {
  const r = composeRegime(
    respostas({ avaliacao: 'sumativa', nivel: 'uc_phd', themis: { policy: 'with_disclosure', assignment: ['other'], assignmentOther: 'revisão narrativa' } }),
  );
  assert.match(r.clausula, /^No âmbito desta UC de doutoramento, para as actividades avaliadas descritas como revisão narrativa,/);
});

test('a formative activity gets no clause, even with an old regime_themis answer', () => {
  const r = composeRegime(respostas({ themis: { policy: 'not_permitted', assignment: ['essay'] } }));
  assert.equal(r.clausula, undefined);
  assert.deepEqual(r.avisos, []);
});

test('a summative activity without the Themis answers says that the clause is missing', () => {
  const r = composeRegime(respostas({ avaliacao: 'sumativa' }));
  assert.equal(r.clausula, undefined);
  assert.equal(r.avisos.length, 1);
  assert.match(r.avisos[0], /cláusula/);
});

test('toFichaRegime fits the regime_ia schema of the ficha', () => {
  const cases = [
    respostas(),
    respostas({ papel: 'contraparte', regime: 'condicionado', condicoes: 'Só em aula.' }),
    respostas({ papel: 'objecto_de_critica', regime: 'permitido', avaliacao: 'sumativa', themis: { policy: 'with_disclosure', assignment: ['report'] } }),
  ];
  for (const r of cases) {
    const data = toFichaRegime(composeRegime(r));
    assert.deepEqual(validateSection('regime_ia', data, 'new'), []);
  }
  const summative = toFichaRegime(composeRegime(cases[2]));
  assert.ok(summative.themis.clausula.length > 0);
  assert.ok(summative.themis.avisos.length > 0);
});

test('composeRegime refuses answers without papel_ia or regime', () => {
  assert.throws(() => composeRegime({}), /papel/);
  assert.throws(() => composeRegime({ papel_ia: { papel: 'nenhum' } }), /regime/);
});
