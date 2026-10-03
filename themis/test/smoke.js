// Exercise the real DOM and generated statements in both supported languages.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = path.join(__dirname, '..');
const policy = JSON.parse(fs.readFileSync(path.join(ROOT, 'policy.json')));
const hash = state => '#s=' + Buffer.from(JSON.stringify(state)).toString('base64url');
async function boot(t, { lang = 'pt', state, storageBlocked = false, loadedPolicy = policy } = {}) {
  const errors = [];
  const vc = new VirtualConsole(); vc.on('jsdomError', e => errors.push(e.message));
  const dom = new JSDOM(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), {
    runScripts: 'outside-only', url: 'https://example.test/themis/' + (state ? hash(state) : ''), virtualConsole: vc,
  });
  const w = dom.window;
  t.after(() => { w.close(); assert.deepEqual(errors, [], 'no unhandled application errors'); });
  w.POLICY_DATA = loadedPolicy;
  w.fetch = async () => ({ ok: false });
  w.requestAnimationFrame = fn => w.setTimeout(fn, 0);
  if (storageBlocked) Object.defineProperty(w, 'localStorage', { get() { throw new w.DOMException('blocked', 'SecurityError'); } });
  else w.localStorage.setItem('fmup-ai-lang', lang);
  for (const f of ['i18n/pt.js', 'i18n/en.js', 'app.js']) w.eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  await new Promise(r => setTimeout(r, 10));
  const $ = q => w.document.querySelector(q);
  const change = (q, value) => {
    const el = $(q); assert.ok(el, q);
    if (el.type === 'checkbox' || el.type === 'radio') { el.checked = value; el.dispatchEvent(new w.Event('change', { bubbles: true })); }
    else { el.value = value; el.dispatchEvent(new w.Event('input', { bubbles: true })); }
  };
  return { w, $, change,
    pick: (name, value) => change(`input[name="${name}"][value="${value}"]`, true),
    type: (id, value) => change('#' + id, value),
    check: (id, value = true) => change('#' + id, value),
    role: role => w.document.querySelectorAll('.role-card')[['student', 'teacher', 'researcher'].indexOf(role)].click(),
    generate() { assert.equal($('.nav-row .btn-primary').disabled, false); $('.nav-row .btn-primary').click(); return [...w.document.querySelectorAll('.output-block textarea')].map(el => el.value); },
  };
}
function fillUse(a, { role = 'researcher', scope = 'auxiliary' } = {}) {
  a.pick('tasks', 'drafting'); a.type('tools-input', 'Example model 1.0'); a.pick('scope', scope); a.check('contextReviewed');
  if (scope === 'substantive') {
    a.type('use-date-input', '2026-09-01');
    a.type('affectedSections-input', 'Methods and results');
    a.type('verifications-input', 'Recalculated the results');
    a.type('promptsRef-input', 'Appendix 1');
  }
}
for (const lang of ['pt', 'en']) {
  test(`${lang}: student multi-select, short note, full evidence and confirmed group record`, async t => {
    const a = await boot(t, { lang }); a.role('student'); a.pick('submission', 'group');
    a.pick('assignment', 'essay'); a.pick('assignment', 'report'); a.pick('modification', 'edited');
    fillUse(a, { role: 'student', scope: 'substantive' }); a.pick('tasks', 'editing'); a.check('groupConfirmed');
    const out = a.generate(); assert.equal(out.length, 2);
    assert.match(out[0], /Os autores declaram|The authors declare/);
    assert.match(out[1], /ensaio.*relatório|essay.*report/); assert.match(out[1], /GAIDeT/);
    for (const text of ['Methods and results', 'Recalculated the results', 'Appendix 1', policy.version]) assert.ok(out[1].includes(text));
    assert.match(out[1], /contribuição individual|individual contribution/);
    const payload = JSON.parse(Buffer.from(a.w.location.hash.slice(3), 'base64url'));
    assert.deepEqual(payload.tasks, ['drafting', 'editing']); assert.equal(payload.v, 3);
    assert.equal(payload.versions.policy, policy.version);
  });
  test(`${lang}: researcher requires explicit scope and evidence for material use`, async t => {
    const a = await boot(t, { lang }); a.role('researcher'); a.pick('activity', 'manuscript'); a.pick('target', 'journal');
    assert.equal(a.$('.btn-primary').disabled, true);
    a.pick('tasks', 'statistics'); a.type('tools-input', 'Example'); a.check('contextReviewed');
    assert.equal(a.$('.btn-primary').disabled, true);
    a.pick('scope', 'substantive'); assert.equal(a.$('.btn-primary').disabled, true);
    a.type('affectedSections-input', 'Results'); a.type('verifications-input', 'Checks pending'); a.type('promptsRef-input', 'Appendix');
    assert.equal(a.$('.btn-primary').disabled, true, 'material use needs an actual use date');
    a.type('use-date-input', '2026-09-01');
    const out = a.generate(); assert.equal(out.length, 3);
    assert.match(out[0], /influência material|material influence/);
    assert.ok(out.every(s => s.includes(policy.version)));
    assert.doesNotMatch(out[1], /Não foram introduzidos dados|No personal, sensitive|were critically reviewed|foram revistos criticamente/);
    assert.ok(out[1].includes('Checks pending'));
  });
  for (const role of ['student', 'researcher']) test(`${lang}: ${role} no-use note has no use-related risk`, async t => {
    const a = await boot(t, { lang }); a.role(role);
    if (role === 'student') { a.pick('submission', 'individual'); a.pick('assignment', 'report'); }
    else { a.pick('activity', 'data_analysis'); a.pick('target', 'journal'); }
    a.check('no-use'); const out = a.generate(); assert.equal(out.length, 1);
    assert.match(out[0], /não ter utilizado|no generative AI tools/);
    assert.equal(a.$('.risk-3'), null); assert.equal(a.$('.risk-4'), null);
  });
  for (const regime of ['not_permitted', 'with_disclosure', 'without_restrictions']) test(`${lang}: teacher ${regime} preserves final-work disclosure`, async t => {
    const a = await boot(t, { lang }); a.role('teacher'); a.pick('courseType', 'uc_master'); a.pick('assignment', 'essay'); a.pick('policy', regime);
    const out = a.generate(); assert.equal(out.length, 2); assert.match(out[1], /nota|note/);
    assert.doesNotMatch(out[1], /Não é exigida qualquer declaração|No disclosure statement is required/);
  });
}
for (const state of [{ v: 2, role: 'student', assignment: null }, { v: 3, role: 'researcher', tasks: {} }, { v: 3, role: 'researcher', tools: 12 }, { v: 3, role: 'student', scope: 'invented' }, { v: 3, role: 'student', tasks: ['not-a-task'] }, { v: 3, role: 'student', done: 'true' }, { v: 1, role: 'student' }]) {
  test(`invalid shared state recovers: ${JSON.stringify(state)}`, async t => {
    const a = await boot(t, { state }); assert.ok(a.$('.role-card')); assert.equal(a.w.location.hash, '');
  });
}
test('v2 and v3 links restore choices for review, never an unvalidated output', async t => {
  for (const v of [2, 3]) {
    const a = await boot(t, { state: { v, role: 'researcher', lang: 'pt', activity: 'manuscript', target: 'journal', done: true } });
    assert.ok(a.$('input[name=activity]:checked')); assert.equal(a.$('textarea'), null);
    assert.equal(a.$('.btn-primary').disabled, true); assert.match(a.$('main').textContent, /Escolhas recuperadas/);
  }
});
test('blocked localStorage allows startup and language switching', async t => {
  const a = await boot(t, { storageBlocked: true }); assert.ok(a.$('.role-card')); a.$('#lang-toggle').click(); assert.ok(a.$('.role-card'));
});
test('tool chip immediately updates risk panel', async t => {
  const a = await boot(t); a.role('student');
  [...a.w.document.querySelectorAll('.tool-chip')].find(el => el.textContent.includes('ChatGPT (grátis)')).click();
  assert.ok(a.$('.risk-2')); assert.match(a.$('#tools-input').value, /ChatGPT/);
});
for (const flag of ['sensitive_public', 'clinical_delegation', 'automated_grading', 'ai_authorship', 'confidential_review']) test(`declared prohibited context ${flag} produces level 4 without blocking disclosure`, async t => {
  const a = await boot(t); a.role('researcher'); a.pick('activity', 'manuscript'); a.pick('target', 'journal'); fillUse(a);
  a.check('privacyConfirmed'); a.pick('riskFlags', flag);
  assert.ok(a.$('.risk-4'));
  if (flag === 'sensitive_public') assert.equal(a.$('#privacyConfirmed').checked, false);
  const out = a.generate(); assert.ok(a.$('.risk-4'));
  if (flag === 'sensitive_public') assert.doesNotMatch(out[1], /Não foram introduzidos/);
});
test('systematic review is not misclassified as confidential peer review', async t => {
  const a = await boot(t); a.role('researcher'); a.pick('activity', 'review'); assert.ok(a.$('.risk-2')); assert.equal(a.$('.risk-3'), null);
});
test('copy failure is reported honestly', async t => {
  const a = await boot(t); a.role('researcher'); a.pick('activity', 'manuscript'); a.pick('target', 'journal'); a.check('no-use'); a.generate();
  a.w.document.execCommand = () => false; a.$('.output-actions button').click(); assert.match(a.$('#toast').textContent, /Não foi possível/);
});
for (const loadedPolicy of [null, { ...policy, rules: [{ risk: 4, trigger: { typo: true } }] }]) test('unavailable or malformed policy preserves declarations with explicit notice', async t => {
  const a = await boot(t, { loadedPolicy }); a.role('researcher'); a.pick('activity', 'manuscript'); a.pick('target', 'journal'); fillUse(a); a.generate();
  assert.match(a.$('.risk-panel').textContent, /indisponível/);
});
test('PT and EN expose the same translation keys', async t => {
  const a = await boot(t); const keys = (o, p = '') => Object.entries(o).flatMap(([k, v]) => v && typeof v === 'object' ? keys(v, p + k + '.') : [p + k]);
  assert.deepEqual(keys(a.w.I18N_PT).sort(), keys(a.w.I18N_EN).sort());
});
test('timer measures elapsed time after throttling and preserves pause', () => {
  const dom = new JSDOM(`<div id="cronometro" data-duracao="10"><div class="cronometro-display"></div><p class="cronometro-estado"></p><button data-accao="iniciar"></button><button data-accao="repor"></button></div>`, { runScripts: 'outside-only' });
  const w = dom.window; let now = 0, tick; w.Date.now = () => now; w.setInterval = fn => { tick = fn; return 1; }; w.clearInterval = () => {};
  w.eval(fs.readFileSync(path.join(ROOT, '../training/js/cronometro.js'), 'utf8'));
  const button = w.document.querySelector('[data-accao=iniciar]'); button.click(); now = 7500; tick();
  assert.equal(w.document.querySelector('.cronometro-display').textContent, '00:03');
  button.click(); now += 5000; button.click(); now += 4000; tick();
  assert.equal(w.document.querySelector('.cronometro-display').textContent, '-00:01');
  assert.equal(w.document.querySelector('.cronometro-estado').textContent, 'Tempo esgotado.'); dom.window.close();
});
