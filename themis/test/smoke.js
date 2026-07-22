// Headless smoke test for Themis: boots the real index.html + app.js in
// jsdom, drives each branch through the form, and asserts the outputs.
//
// Run:  cd themis/test && npm install && npm test
//
// This harness exists because the tool has no framework and no build step:
// the only way to catch regressions in the generated statements is to
// drive the real DOM. It caught a real bug on its first run (multi-select
// groups keeping only the last ticked option — fixed in 1.1.0).
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const policy = JSON.parse(fs.readFileSync(path.join(ROOT, 'policy.json'), 'utf8'));

const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.test/themis/' });
const { window } = dom;

// Minimal fetch stub so the app loads policy.json the same way it would
// from a static server.
window.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(policy) });
window.requestAnimationFrame = (fn) => setTimeout(fn, 0);
window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));

// jsdom reports navigator.language as en-US, which would make detectLang()
// pick English. Pin Portuguese so the assertions below test the pt strings.
window.localStorage.setItem('fmup-ai-lang', 'pt');

const run = (f) => window.eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
run('i18n/pt.js');
run('i18n/en.js');
run('app.js');

const APP_VERSION_RE = /versão (\d+\.\d+\.\d+)/;

let failures = 0;
const check = (name, cond, extra) => {
  if (cond) { console.log('  PASS  ' + name); }
  else { failures++; console.log('  FAIL  ' + name + (extra ? '\n        ' + extra : '')); }
};

const click = (el) => { el.click(); };
const pick = (name, value) => {
  const el = window.document.querySelector(`input[name="${name}"][value="${value}"]`);
  if (!el) throw new Error('no input ' + name + '=' + value);
  el.checked = true;
  el.dispatchEvent(new window.Event('change', { bubbles: true }));
};
const tick = (name, value) => {
  const el = window.document.querySelector(`input[name="${name}"][value="${value}"]`);
  if (!el) throw new Error('no checkbox ' + name + '=' + value);
  el.checked = true;
  el.dispatchEvent(new window.Event('change', { bubbles: true }));
};
const type = (id, value) => {
  const el = window.document.getElementById(id);
  if (!el) throw new Error('no input #' + id);
  el.value = value;
  el.dispatchEvent(new window.Event('input', { bubbles: true }));
};
// Landing cards are plain buttons in a fixed order: student, teacher,
// researcher. No data attribute to key off, so index by that order.
const ROLE_INDEX = { student: 0, teacher: 1, researcher: 2 };
const roleCard = (role) => {
  const cards = window.document.querySelectorAll('.role-grid .role-card');
  const el = cards[ROLE_INDEX[role]];
  if (!el) throw new Error('no role card ' + role + ' (found ' + cards.length + ')');
  return el;
};
const generate = () => {
  const btn = window.document.querySelector('.nav-row .btn-primary');
  if (!btn) throw new Error('no generate button');
  if (btn.disabled) throw new Error('generate button disabled');
  click(btn);
};
const outputs = () => Array.from(window.document.querySelectorAll('.output-block')).map((b) => ({
  heading: b.querySelector('.output-heading').textContent,
  text: b.querySelector('textarea').value,
}));
const decodeHash = () => JSON.parse(Buffer.from(
  window.location.hash.slice(3).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
// "Voltar" on the output screen returns to the form; "Voltar" on the form
// returns to the landing. Click until the role grid is back.
const restart = () => {
  for (let n = 0; n < 4 && !window.document.querySelector('.role-grid .role-card'); n++) {
    const back = Array.from(window.document.querySelectorAll('button')).find((b) => /Voltar|Back/.test(b.textContent));
    if (!back) break;
    click(back);
  }
  if (!window.document.querySelector('.role-grid .role-card')) throw new Error('could not return to landing');
};

setTimeout(() => {
  console.log('\n=== 1. Student branch, group submission, multi-select, scope=auxiliary ===');
  click(roleCard('student'));
  pick('submission', 'group');
  tick('assignment', 'essay');
  tick('assignment', 'report');
  tick('tasks', 'drafting');
  tick('tasks', 'editing');
  type('tools-input', 'ChatGPT 4o');
  pick('modification', 'edited');
  pick('scope', 'auxiliary');
  const stepsStudent = window.document.querySelectorAll('.step-progress').length;
  check('student form has 7 steps', stepsStudent === 7, 'got ' + stepsStudent);
  // Regression guard for the 1.1.0 multi-select bug: every ticked option
  // must survive into state, not just the last one.
  const st = decodeHash();
  check('multi-select keeps every ticked assignment', JSON.stringify(st.assignment.slice().sort()) === JSON.stringify(['essay', 'report']), JSON.stringify(st.assignment));
  check('multi-select keeps every ticked task', JSON.stringify(st.tasks.slice().sort()) === JSON.stringify(['drafting', 'editing']), JSON.stringify(st.tasks));
  generate();
  let o = outputs();
  check('student emits 1 block', o.length === 1, 'got ' + o.length);
  check('student statement names both assignment types', /ensaio/.test(o[0].text) && /relatório/.test(o[0].text));
  check('student statement carries scope sentence', /âmbito da utilização foi de apoio auxiliar/.test(o[0].text));
  check('student statement carries group contribution record', /contribuição individual de cada autor/.test(o[0].text));
  check('student statement footer carries APP_VERSION', APP_VERSION_RE.test(o[0].text));

  console.log('\n=== 2. Teacher branch, semáforo marker ===');
  restart();
  click(roleCard('teacher'));
  pick('courseType', 'uc_master');
  tick('assignment', 'essay');
  pick('policy', 'not_permitted');
  generate();
  o = outputs();
  check('teacher emits 2 blocks', o.length === 2, 'got ' + o.length);
  check('syllabus clause opens with red marker', o[0].text.startsWith('🟥'), o[0].text.slice(0, 40));

  console.log('\n=== 3. Researcher branch, substantive scope, GAIDeT domains ===');
  restart();
  click(roleCard('researcher'));
  pick('activity', 'manuscript');
  tick('tasks', 'literature_search');
  tick('tasks', 'statistics');
  tick('tasks', 'ethics_review');
  type('tools-input', 'Claude Opus 4.5');
  pick('scope', 'substantive');
  pick('target', 'journal');
  generate();
  o = outputs();
  check('researcher emits 3 blocks', o.length === 3, 'got ' + o.length);
  check('first block is the short note', /Nota curta/.test(o[0].heading), o[0].heading);
  check('short note uses the material variant', /influência material/.test(o[0].text));
  check('full statement names GAIDeT macrodomains from policy.json', /macrodomínios delegados foram: revisão da literatura, gestão de dados e revisão ética/.test(o[1].text), o[1].text.slice(0, 400));
  check('full statement asserts no sensitive data', /Não foram introduzidos dados pessoais/.test(o[1].text));

  console.log('\n=== 4. Researcher branch, null declaration ===');
  restart();
  click(roleCard('researcher'));
  pick('activity', 'thesis_chapter');
  const noUse = window.document.getElementById('no-use');
  noUse.checked = true;
  noUse.dispatchEvent(new window.Event('change', { bubbles: true }));
  const stepsNull = window.document.querySelectorAll('.step-progress').length;
  check('null-use form collapses to 2 steps', stepsNull === 2, 'got ' + stepsNull);
  check('tasks step is hidden', !window.document.querySelector('input[name="tasks"]'));
  pick('target', 'phd_jury');
  generate();
  o = outputs();
  check('null declaration emits exactly 1 block', o.length === 1, 'got ' + o.length);
  check('null declaration says no tools were used', /não ter utilizado ferramentas de IA generativa/.test(o[0].text), o[0].text);

  console.log('\n=== 5. Hash round-trip ===');
  const h = window.location.hash;
  check('hash is populated', h.indexOf('#s=') === 0, h.slice(0, 20));
  const payload = decodeHash();
  check('hash declares v=2', payload.v === 2, JSON.stringify(payload.v));
  check('hash carries noUse', payload.noUse === true);
  check('hash carries scope key', 'scope' in payload);

  console.log('\n=== 6. Stale v=1 hash is rejected ===');
  const old = Buffer.from(JSON.stringify({ v: 1, role: 'student', lang: 'pt' })).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  window.location.hash = '#s=' + old;
  window.dispatchEvent(new window.Event('hashchange'));
  setTimeout(() => {
    const onLanding = !!window.document.querySelector('.role-grid .role-card');
    check('v=1 hash falls back to landing', onLanding);
    console.log('\n' + (failures ? failures + ' FAILURE(S)' : 'ALL CHECKS PASSED'));
    process.exit(failures ? 1 : 0);
  }, 50);
}, 100);
