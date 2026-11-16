// Tests of the link from the preview to Themis (spec D9) and of the docx and student handout
// buttons (spec D5, D8): the state that themis-link.js builds, that Themis decodes it, the link on
// the preview page and the three new download buttons.
// Run: npm test --prefix eunomia/test
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { ROOT, INTERVIEW, DRAFT_ID, TEACHER, ANSWERS, approvedDraft, FakeApi, json, boot } = require('./harness.js');
const THEMIS = require('../themis-link.js');

const THEMIS_ROOT = path.join(ROOT, '..', 'themis');
const read = (...p) => fs.readFileSync(path.join(...p), 'utf8');
const field = (stepId, fieldId) => INTERVIEW.passos.find((p) => p.id === stepId).campos.find((c) => c.id === fieldId);
const ids = (stepId, fieldId) => field(stepId, fieldId).opcoes.map((o) => o.id);
const copy = (x) => JSON.parse(JSON.stringify(x));

// The Themis texts: the keys that decodeState accepts for courseType, level, policy and assignment.
const themisPt = (() => {
  const w = {};
  new Function('window', read(THEMIS_ROOT, 'i18n', 'pt.js'))(w);
  return w.I18N_PT;
})();

// The three answer sets of the Review Focus.
const UNDERGRAD = copy(ANSWERS); // uc_undergrad, formativa, permitido, no regime_themis
const CPD = copy(ANSWERS);
CPD.contexto.nivel = 'cpd';
CPD.evidencia.avaliacao = 'sumativa';
CPD.regime = { regime: 'condicionado', condicoes: 'Só depois da resolução individual.' };
CPD.regime_themis = { assignment: ['essay', 'other'], assignmentOther: 'Podcast clínico: gravação e transcrição' };
const OTHER = copy(ANSWERS);
OTHER.contexto.nivel = 'other';
OTHER.regime = { regime: 'proibido' };

// ---------------------------------------------------------------- the state

test('every contexto nivel id is a Themis courseType key, and the mapped level and policy values are Themis keys', () => {
  const courseTypes = Object.keys(themisPt.teacher.courseType);
  for (const id of ids('contexto', 'nivel')) assert.ok(courseTypes.includes(id), `nivel ${id} is not a Themis courseType`);
  for (const id of ids('regime_themis', 'assignment')) assert.ok(Object.hasOwn(themisPt.teacher.assignment, id), `assignment ${id}`);
  for (const id of ids('regime_themis', 'policy')) assert.ok(Object.hasOwn(themisPt.teacher.policy, id), `policy ${id}`);
  const levels = Object.keys(themisPt.teacher.level);
  const policies = Object.keys(themisPt.teacher.policy);
  for (const nivel of ids('contexto', 'nivel')) {
    const level = THEMIS.state({ contexto: { nivel } }).level;
    assert.ok(level === null || levels.includes(level), `level ${level} of ${nivel}`);
  }
  for (const regime of ids('regime', 'regime')) {
    const policy = THEMIS.state({ regime: { regime } }).policy;
    assert.ok(policies.includes(policy), `policy ${policy} of ${regime}`);
  }
  // The schema version is the one that Themis accepts.
  assert.equal(THEMIS.state({}).v, Number(/const HASH_V = (\d+);/.exec(read(THEMIS_ROOT, 'app.js'))[1]));
});

test('state maps undergrad formativa permitido to level undergraduate, policy without_restrictions, no assignment', () => {
  assert.deepEqual(THEMIS.state(UNDERGRAD), {
    v: 3, lang: 'pt', role: 'teacher', level: 'undergraduate', courseType: 'uc_undergrad',
    policy: 'without_restrictions', assignment: [], assignmentOther: '',
  });
  assert.equal(THEMIS.state({ contexto: { nivel: 'uc_master' } }).level, 'postgraduate');
  assert.equal(THEMIS.state({ contexto: { nivel: 'uc_phd' } }).level, 'doctoral');
  assert.equal(THEMIS.state({ regime: { regime: 'condicionado' } }).policy, 'with_disclosure');
  assert.equal(THEMIS.state({ regime: { regime: 'proibido' } }).policy, 'not_permitted');
});

test('state of a summative activity takes policy, assignment and assignmentOther from regime_themis', () => {
  const r = copy(CPD);
  r.regime_themis.policy = 'not_permitted';
  assert.deepEqual(THEMIS.state(r), {
    v: 3, lang: 'pt', role: 'teacher', level: null, courseType: 'cpd',
    policy: 'not_permitted', assignment: ['essay', 'other'], assignmentOther: 'Podcast clínico: gravação e transcrição',
  });
  // Without a policy of its own, the policy follows the regime of the activity.
  assert.equal(THEMIS.state(CPD).policy, 'with_disclosure');
  // No safe mapping: everything stays empty.
  assert.deepEqual(THEMIS.state(undefined), { v: 3, lang: 'pt', role: 'teacher', level: null, courseType: null, policy: null, assignment: [], assignmentOther: '' });
  assert.deepEqual(THEMIS.state({ contexto: { nivel: 'x' }, regime: { regime: 'x' }, regime_themis: { assignment: 'essay', policy: 'x', assignmentOther: 4 } }),
    { v: 3, lang: 'pt', role: 'teacher', level: null, courseType: 'x', policy: null, assignment: [], assignmentOther: '' });
});

test('href is ../themis/#s= and the base64url of the UTF-8 JSON, with no padding', () => {
  const h = THEMIS.href(CPD);
  assert.match(h, /^\.\.\/themis\/#s=[A-Za-z0-9_-]+$/);
  assert.deepEqual(JSON.parse(Buffer.from(h.slice('../themis/#s='.length), 'base64url').toString('utf8')), THEMIS.state(CPD));
});

// ---------------------------------------------------------------- Themis reads the link

async function bootThemis(t, hash) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push(e.message));
  const dom = new JSDOM(read(THEMIS_ROOT, 'index.html'), { runScripts: 'outside-only', url: 'https://example.test/themis/' + hash, virtualConsole: vc });
  const w = dom.window;
  t.after(() => {
    w.close();
    assert.deepEqual(errors, [], 'no unhandled application errors in Themis');
  });
  w.POLICY_DATA = JSON.parse(read(THEMIS_ROOT, 'policy.json'));
  w.fetch = async () => ({ ok: false });
  w.requestAnimationFrame = (fn) => w.setTimeout(fn, 0);
  w.localStorage.setItem('fmup-ai-lang', 'pt');
  for (const f of ['i18n/pt.js', 'i18n/en.js', 'policy-rules.js', 'app.js']) w.eval(read(THEMIS_ROOT, f));
  await new Promise((r) => setTimeout(r, 300)); // the invalid-link toast is deferred by 200 ms
  return w;
}

const CASES = [
  ['undergrad formativa permitido', UNDERGRAD, 'without_restrictions', 'uc_undergrad', []],
  ['cpd sumativa condicionado with essay and other', CPD, 'with_disclosure', 'cpd', ['essay', 'other']],
  ['other formativa proibido, no regime_themis', OTHER, 'not_permitted', 'other', []],
];
for (const [name, answers, policy, courseType, assignment] of CASES) {
  test(`Themis decodes the link without the invalid-link toast and shows the teacher choices: ${name}`, async (t) => {
    const hash = THEMIS.href(answers).slice('../themis/'.length);
    const w = await bootThemis(t, hash);
    const $ = (q) => w.document.querySelector(q);
    assert.ok(!$('#toast').classList.contains('is-visible'), 'no invalid-link toast');
    assert.ok(w.location.hash.startsWith('#s='), `Themis keeps the state in the hash: ${w.location.hash.slice(0, 20)}`);
    assert.equal($(`input[name="policy"][value="${policy}"]`).checked, true, 'policy');
    assert.equal($('input[name="policy"]:checked').value, policy, 'only that policy');
    assert.equal($(`input[name="courseType"][value="${courseType}"]`).checked, true, 'courseType');
    const ticked = [...w.document.querySelectorAll('input[name="assignment"]:checked')].map((x) => x.value).sort();
    assert.deepEqual(ticked, [...assignment].sort(), 'assignment');
    if (assignment.includes('other')) assert.equal($('#teacher-assignment-other-input').value, answers.regime_themis.assignmentOther);
  });
}

// ---------------------------------------------------------------- the preview page

// A complete draft: the plan approved, every section accepted, the final check with no problems.
function completeApi(over = {}) {
  const d = approvedDraft(over);
  const api = new FakeApi({ user: TEACHER, draft: d });
  api.on('GET', /\/verificacao-final$/, () => json(200, { erros: [], seccoes_em_falta: [], referencias_a_verificar: 0 }));
  api.on('GET', /\/exportar$/, (call) => {
    const f = call.query.get('formato');
    const name = { docx: 'doente-virtual.docx', folheto: 'doente-virtual-folheto.html', 'folheto-md': 'doente-virtual-folheto.md', html: 'doente-virtual.html' }[f] || `doente-virtual.${f}`;
    const body = f === 'html' || f === 'folheto' ? '<!doctype html><title>x</title><h1>Doente virtual</h1>' : 'x';
    return new Response(body, { status: 200, headers: { 'Content-Disposition': `attachment; filename="${name}"`, 'X-Eunomia-Avisos': '0' } });
  });
  return api;
}

test('the preview has the Abrir no Themis link to ../themis/#s=', async (t) => {
  const api = completeApi();
  const a = await boot(t, { api, hash: `#/rascunho/${DRAFT_ID}/previsao` });
  await a.page('previsao');
  await a.waitFor(() => a.$('#previsao-ficha'), 'preview frame');
  const link = a.$('#abrir-themis');
  assert.ok(link, 'the link');
  assert.equal(link.tagName, 'A');
  assert.equal(link.getAttribute('href'), THEMIS.href(ANSWERS));
  assert.match(link.getAttribute('href'), /^\.\.\/themis\/#s=/);
  assert.equal(link.getAttribute('target'), '_blank');
  assert.match(link.getAttribute('rel'), /noopener/);
  assert.match(link.textContent, /Abrir no Themis/);
  assert.match(a.text(), /Themis/);
  // The state in the link is the one of this draft: an undergraduate, formative, permitted activity.
  const state = JSON.parse(Buffer.from(link.getAttribute('href').split('#s=')[1], 'base64url').toString('utf8'));
  assert.deepEqual([state.role, state.level, state.courseType, state.policy], ['teacher', 'undergraduate', 'uc_undergrad', 'without_restrictions']);
  // The link makes no request of its own (no model call).
  assert.equal(api.calls.filter((c) => /themis/i.test(c.path)).length, 0);
});

test('the Abrir no Themis link follows the regime step: with the step unanswered there is no link', async (t) => {
  const answers = copy(ANSWERS);
  delete answers.regime;
  const a = await boot(t, { api: completeApi({ respostas: answers }), hash: `#/rascunho/${DRAFT_ID}/previsao` });
  await a.page('previsao');
  await a.waitFor(() => a.$('#exportar-qmd'), 'export buttons');
  assert.equal(a.$('#abrir-themis'), null);
});

test('the Abrir no Themis link is also there while sections are still to accept', async (t) => {
  const api = new FakeApi({ user: TEACHER, draft: approvedDraft() });
  const a = await boot(t, { api, hash: `#/rascunho/${DRAFT_ID}/previsao` });
  await a.page('previsao');
  assert.match(a.$('#verificacao').textContent, /Formato e duração em aula/);
  assert.equal(a.$('#exportar-qmd'), null, 'no export yet');
  assert.ok(a.$('#abrir-themis'));
});

test('the docx, folheto and folheto-md buttons download with formato=docx, folheto and folheto-md', async (t) => {
  const api = completeApi();
  const a = await boot(t, { api, hash: `#/rascunho/${DRAFT_ID}/previsao` });
  await a.page('previsao');
  await a.waitFor(() => a.$('#exportar-docx'), 'export buttons');
  for (const [f, file] of [['docx', 'doente-virtual.docx'], ['folheto', 'doente-virtual-folheto.html'], ['folheto-md', 'doente-virtual-folheto.md']]) {
    const before = api.calls.length;
    a.$(`#exportar-${f}`).click();
    await a.waitFor(() => a.downloads.some((d) => d.download === file), `download ${file}`);
    const call = api.calls.slice(before).find((c) => /\/exportar$/.test(c.path));
    assert.equal(call.method, 'GET');
    assert.equal(call.query.get('formato'), f);
    assert.match(call.path, new RegExp(`^/rascunhos/${DRAFT_ID}/exportar$`));
  }
  // Next to the three of 0.1, each with its own text.
  assert.deepEqual(a.$$('[id^="exportar-"]').map((b) => b.id.replace('exportar-', '')).filter((x) => x !== 'titulo'), ['qmd', 'md', 'html', 'docx', 'folheto', 'folheto-md']);
  assert.match(a.$('#exportar-docx').textContent, /\.docx/);
  assert.match(a.$('#exportar-folheto').textContent, /folheto/);
  assert.match(a.$('#exportar-folheto-md').textContent, /folheto/);
  assert.match(a.$('#exportar-titulo').parentNode.textContent, /Word/);
  assert.match(a.$('#exportar-titulo').parentNode.textContent, /folheto/i);
});
