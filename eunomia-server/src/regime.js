'use strict';

// The AI regime of an activity (design, 6.5 step 5 and 6.8 regime_ia). Code writes it, never the
// model. For an assessed activity the clause and its warnings come from Themis itself: the rule
// function (themis/policy-rules.js), the statement generator (themis/i18n/pt.js) and the rules
// (themis/policy.json). Nothing of Themis is copied here.

const fs = require('node:fs');
const vm = require('node:vm');
const { repoPath } = require('./paths.js');
const { renderSection } = require('./ficha.js');

const THEMIS_RULES = require(repoPath('themis', 'policy-rules.js'));
const POLICY = JSON.parse(fs.readFileSync(repoPath('themis', 'policy.json'), 'utf8'));

// pt.js is a browser script that sets window.I18N_PT. It runs here in its own context.
function loadThemisPt() {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(repoPath('themis', 'i18n', 'pt.js'), 'utf8'), sandbox, { filename: 'themis/i18n/pt.js' });
  const pt = sandbox.window.I18N_PT;
  if (!pt || !pt.statements || typeof pt.statements.teacherSyllabus !== 'function') {
    throw new Error('themis/i18n/pt.js não define statements.teacherSyllabus.');
  }
  return pt;
}
const I18N_PT = loadThemisPt();

// The Themis version (themis.versao in _variables.yml), which Themis prints in the clause footer.
function themisVersion() {
  const text = fs.readFileSync(repoPath('_variables.yml'), 'utf8');
  const m = /(?:^|\n)themis:[ \t]*\n(?:[ \t]+.*\n)*?[ \t]+versao:[ \t]*"?([^"\n]+)"?/.exec(text);
  if (!m) throw new Error('_variables.yml não tem themis.versao.');
  return m[1].trim();
}
const THEMIS_VERSION = themisVersion();

const PAPEIS = ['nenhum', 'contraparte', 'ferramenta', 'objecto_de_critica'];

const REGIMES = {
  permitido: { cor: 'verde', rotulo: 'verde: permitido', policy: 'without_restrictions' },
  condicionado: { cor: 'amarelo', rotulo: 'amarelo: permitido com condições', policy: 'with_disclosure' },
  proibido: { cor: 'vermelho', rotulo: 'vermelho: proibido', policy: 'not_permitted' },
};

// Themis starts the clause with a traffic-light emoji and a label ("<emoji> Proibido — "). The
// ficha shows the regime as text, so the marker goes.
const MARKER = /^\p{Extended_Pictographic}\s[^—]+—\s/u;
const PICTOGRAPH = /\p{Extended_Pictographic}️?/gu;

const MISMATCH = 'O regime da actividade e a política da avaliação são diferentes. Confirme que é intencional.';

const MISSING_THEMIS =
  'A actividade é sumativa, mas faltam o tipo de trabalho e a política de uso de IA: sem eles, a ficha não tem a cláusula para o enunciado.';

const isObject = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

// respostas: the answers of the interview. Returns
// { papel, regime: { valor, cor, rotulo, condicoes? }, clausula?, avisos: string[] }.
function composeRegime(respostas) {
  const r = respostas || {};
  const papel = isObject(r.papel_ia) ? r.papel_ia.papel : undefined;
  if (!PAPEIS.includes(papel)) throw new TypeError('Falta o papel da IA na actividade.');
  const valor = isObject(r.regime) ? r.regime.regime : undefined;
  if (!REGIMES[valor]) throw new TypeError('Falta o regime de IA para os estudantes.');

  const out = {
    papel,
    regime: { valor, cor: REGIMES[valor].cor, rotulo: REGIMES[valor].rotulo },
    avisos: [],
  };
  if (valor === 'condicionado' && typeof r.regime.condicoes === 'string' && r.regime.condicoes.trim() !== '') {
    out.regime.condicoes = r.regime.condicoes.trim();
  }

  const summative = isObject(r.evidencia) && r.evidencia.avaliacao === 'sumativa';
  if (!summative) return out;

  const t = isObject(r.regime_themis) ? r.regime_themis : {};
  const assignment = Array.isArray(t.assignment) ? t.assignment : [];
  if (assignment.length === 0) {
    out.avisos.push(MISSING_THEMIS);
    return out;
  }
  // The policy defaults from the regime; the teacher may choose another one, with a warning.
  const policy = t.policy || REGIMES[valor].policy;
  const state = {
    role: 'teacher',
    policy,
    assignment,
    assignmentOther: t.assignmentOther || '',
    courseType: isObject(r.contexto) ? r.contexto.nivel : undefined,
  };
  const full = I18N_PT.statements.teacherSyllabus(state, THEMIS_VERSION, POLICY);
  // A second pass catches a marker in another shape, so that no emoji reaches the ficha.
  out.clausula = full.replace(MARKER, '').replace(PICTOGRAPH, '').trim();
  // avisos_themis: the policy warnings of Themis, which the ficha prints next to the clause.
  // avisos: those and the warnings for the teacher.
  out.avisos_themis = THEMIS_RULES.evaluateRisk(state, POLICY).matches.map((m) => m.message_pt);
  out.avisos = [...out.avisos_themis];
  if (policy !== REGIMES[valor].policy) out.avisos.push(MISMATCH);
  return out;
}

// The regime_ia section of the ficha (ficha.schema.json).
function toFichaRegime(r) {
  const data = { papel: r.papel, regime: r.regime.valor };
  if (r.regime.condicoes) data.condicoes = r.regime.condicoes;
  if (r.clausula) data.themis = { clausula: r.clausula, avisos: (r.avisos_themis || r.avisos).slice() };
  return data;
}

// Markdown of the regime_ia section, the same text as in the rendered ficha.
function renderRegime(r) {
  return renderSection('regime_ia', toFichaRegime(r));
}

module.exports = { composeRegime, toFichaRegime, renderRegime, THEMIS_VERSION, REGIMES, MISMATCH };
