// Tests of the help page (#/ajuda, open with or without a session), the Ajuda links, the first-visit
// box of the home page and the invitation text of the codes page (spec A, B, E).
// Run: npm test --prefix eunomia/test
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, DRAFT_ID, TEACHER, ADMIN, makeDraft, FakeApi, boot } = require('./harness.js');

const load = (file, name) => {
  const w = {};
  new Function('window', fs.readFileSync(path.join(ROOT, file), 'utf8'))(w);
  return w[name];
};
const A = load('ajuda-pt.js', 'EUNOMIA_AJUDA');
const S = load('i18n-pt.js', 'EUNOMIA_PT');
const BOX_KEY = (user) => 'eunomia-boas-vindas:' + user.id;
const login = async (a) => {
  a.set('#codigo', 'ABCD-EFGH');
  a.$('#login-form button[type=submit]').click();
};

// ---------------------------------------------------------------- the help page

test('#/ajuda without a session shows the help, not the login page; with a session too', async (t) => {
  const anon = await boot(t, { hash: '#/ajuda' });
  await anon.page('ajuda');
  assert.equal(anon.w.location.hash, '#/ajuda');
  assert.equal(anon.$('#main h2').textContent, A.titulo);
  assert.equal(anon.$('#login-form'), null);
  assert.ok(anon.$('#main a[href="#/entrar"]'), 'a way to the login page');

  const user = await boot(t, { api: new FakeApi({ user: TEACHER }), hash: '#/ajuda' });
  await user.page('ajuda');
  assert.equal(user.w.location.hash, '#/ajuda');
  assert.equal(user.$('#main h2').textContent, A.titulo);
  assert.ok(user.$('#main a[href="#/inicio"]'), 'a way back to the drafts');
  // From the home page, too (a hash change, as the header link makes).
  await user.go('#/inicio', 'inicio');
  await user.go('#/ajuda', 'ajuda');
  assert.equal(user.w.location.hash, '#/ajuda');
});

test('after #/ajuda without a session, a login goes to #/inicio', async (t) => {
  const a = await boot(t, { hash: '#/ajuda' });
  await a.page('ajuda');
  await a.go('#/entrar', 'entrar');
  await login(a);
  await a.page('inicio');
  assert.equal(a.w.location.hash, '#/inicio');
});

test('after #/ajuda, a later deep link without a session still opens after the login', async (t) => {
  const api = new FakeApi({ draft: makeDraft() });
  const a = await boot(t, { api, hash: '#/ajuda' });
  await a.page('ajuda');
  await a.go(`#/rascunho/${DRAFT_ID}/passo/contexto`, 'entrar');
  await login(a);
  await a.page('passo');
});

test('the header has the Ajuda link on every page; the login page links to the help', async (t) => {
  const a = await boot(t, { api: new FakeApi({ draft: makeDraft() }) });
  await a.page('entrar');
  const check = () => {
    const help = a.$('#help-link');
    assert.ok(help, 'help link');
    assert.equal(help.getAttribute('href'), '#/ajuda');
    assert.equal(help.textContent, S.app.ajuda);
    assert.ok(a.$('.site-header').contains(help));
  };
  check();
  const inMain = a.$('#main a[href="#/ajuda"]');
  assert.ok(inMain, 'the login page links to the help');
  assert.equal(inMain.textContent, S.entrar.ajuda);
  await login(a);
  await a.page('inicio');
  check();
  await a.go(`#/rascunho/${DRAFT_ID}/passo/contexto`, 'passo');
  check();
  await a.go('#/ajuda', 'ajuda');
  check();
  assert.equal(a.$('#help-link').getAttribute('aria-current'), 'page');
  await a.go('#/inicio', 'inicio');
  assert.equal(a.$('#help-link').getAttribute('aria-current'), null);
});

test('the help has the six sections in order, a link for each glossary term, the nine questions and a mailto link to tiagojacinto@med.up.pt', async (t) => {
  const a = await boot(t, { hash: '#/ajuda' });
  await a.page('ajuda');
  const keys = ['oQueE', 'antes', 'etapas', 'glossario', 'perguntas', 'contacto'];
  const sections = a.$$('#main section');
  assert.deepEqual(sections.map((s) => s.id), keys.map((k) => 'ajuda-' + k));
  assert.deepEqual(a.$$('#main h3').map((h) => h.textContent), keys.map((k) => A[k].titulo));
  // Headings: one h2, then h3 only.
  const headings = a.$$('#main h1, #main h2, #main h3, #main h4, #main h5, #main h6').map((h) => h.tagName);
  assert.equal(headings[0], 'H2');
  assert.deepEqual([...new Set(headings.slice(1))], ['H3']);
  // The paragraphs and the four stages, with what the teacher and the model do.
  for (const p of A.oQueE.paragrafos.concat(A.antes.paragrafos)) assert.ok(a.text().includes(p), p.slice(0, 40));
  const stages = a.$('#ajuda-etapas').textContent;
  for (const e of A.etapas.lista) for (const k of ['titulo', 'docente', 'modelo']) assert.ok(stages.includes(e[k]), `${e.id}.${k}`);
  // Glossary: a dl, each term with its text, its values and an external link to the Quadro.
  const dl = a.$('#ajuda-glossario dl');
  assert.ok(dl);
  assert.deepEqual([...dl.querySelectorAll('dt')].map((x) => x.textContent), A.glossario.termos.map((x) => x.termo));
  const links = [...dl.querySelectorAll('a')];
  assert.equal(links.length, A.glossario.termos.length);
  A.glossario.termos.forEach((term, n) => {
    assert.equal(links[n].getAttribute('href'), term.ligacao.url);
    assert.equal(links[n].getAttribute('target'), '_blank');
    assert.match(links[n].getAttribute('rel'), /noopener/);
    assert.ok(links[n].textContent.includes(term.ligacao.rotulo));
    for (const v of term.valores || []) assert.ok(dl.textContent.includes(v.rotulo), v.id);
  });
  // The questions: every one in the copy (at least the nine of the spec).
  const faq = a.$('#ajuda-perguntas');
  const asked = [...faq.querySelectorAll('dt')].map((x) => x.textContent);
  assert.deepEqual(asked, A.perguntas.lista.map((q) => q.pergunta));
  assert.ok(asked.length >= 9);
  for (const id of ['rede', 'limite', 'modelo_ve', 'quem_ve', 'word_moodle', 'ajuste_parcial', 'aviso', 'apagar', 'submeter']) {
    assert.ok(a.$(`#ajuda-pergunta-${id}`), id);
  }
  for (const q of A.perguntas.lista) assert.ok(faq.textContent.includes(q.resposta), q.id);
  // Contact.
  const mail = a.$('#ajuda-contacto a[href^="mailto:"]');
  assert.ok(mail);
  assert.equal(mail.getAttribute('href'), 'mailto:tiagojacinto@med.up.pt');
  assert.match(a.$('#ajuda-contacto').textContent, /Tiago Jacinto/);
  assert.match(a.$('#ajuda-contacto').textContent, /MEDCIDS/);
  assert.equal(a.w.document.title, S.app.tituloPagina(A.pagina));
});

test('the help page makes no API request other than the session check', async (t) => {
  const api = new FakeApi();
  const a = await boot(t, { api, hash: '#/ajuda' });
  await a.page('ajuda');
  assert.deepEqual(api.calls.map((c) => `${c.method} ${c.path}`), ['GET /me']);
});

// ---------------------------------------------------------------- the first-visit box

test('the first-visit box shows on the first visit, closes, and stays closed after a reload', async (t) => {
  const a = await boot(t, { api: new FakeApi({ user: TEACHER }), hash: '#/inicio' });
  await a.page('inicio');
  const box = a.$('#primeira-vez');
  assert.ok(box, 'first-visit box');
  assert.ok(box.textContent.includes(S.inicio.primeiraVez));
  assert.ok(box.querySelector('a[href="#/exemplos"]'), 'link to the examples');
  assert.ok(box.querySelector('a[href="#/ajuda"]'), 'link to the help');
  assert.equal(box.querySelector('a[href="#/exemplos"]').textContent, S.inicio.verExemplo);
  assert.equal(box.querySelector('a[href="#/ajuda"]').textContent, S.inicio.lerAjuda);
  a.$('#fechar-primeira-vez').click();
  assert.equal(a.$('#primeira-vez'), null);
  assert.equal(a.w.document.activeElement, a.$('#main h2'));
  assert.equal(a.w.localStorage.getItem(BOX_KEY(TEACHER)), '1');
  // The page drawn again: still closed.
  await a.go('#/definicoes', 'definicoes');
  await a.go('#/inicio', 'inicio');
  assert.equal(a.$('#primeira-vez'), null);
  // A new page load with the stored flag: closed. Another user on the same browser: shown.
  const again = await boot(t, { api: new FakeApi({ user: TEACHER }), hash: '#/inicio', local: { [BOX_KEY(TEACHER)]: '1' } });
  await again.page('inicio');
  assert.equal(again.$('#primeira-vez'), null);
  const other = await boot(t, { api: new FakeApi({ user: ADMIN }), hash: '#/inicio', local: { [BOX_KEY(TEACHER)]: '1' } });
  await other.page('inicio');
  assert.ok(other.$('#primeira-vez'));
});

test('with storage blocked the first-visit box shows and closes without an error', async (t) => {
  const a = await boot(t, { api: new FakeApi({ user: TEACHER }), hash: '#/inicio', storage: 'blocked' });
  await a.page('inicio');
  assert.ok(a.$('#primeira-vez'));
  a.$('#fechar-primeira-vez').click();
  assert.equal(a.$('#primeira-vez'), null);
  assert.equal(a.w.document.activeElement, a.$('#main h2'));
});

// ---------------------------------------------------------------- the invitation text

test('after a new code, the invitation text has the code, the app, help and examples links and the contact; leaving the page drops it', async (t) => {
  const api = new FakeApi({ user: ADMIN });
  const a = await boot(t, { api, hash: '#/codigos' });
  await a.page('codigos');
  assert.equal(a.$('#convite'), null, 'no invitation before a code is made');
  a.set('#novo-nome', 'Rui Costa');
  a.$('#criar-codigo').click();
  await a.waitFor(() => a.$('#convite'), 'invitation');
  assert.equal(a.$('#convite h3').textContent, S.codigos.conviteTitulo);
  const area = a.$('#convite-texto');
  assert.equal(area.tagName, 'TEXTAREA');
  assert.ok(area.readOnly);
  const app = 'https://example.test/fmup-ia/eunomia/';
  const themis = 'https://example.test/fmup-ia/themis/';
  const expected = S.codigos.convite({ nome: 'Rui Costa', codigo: 'QWER-TYUI-OPAS', app, ajuda: app + '#/ajuda', exemplos: app + '#/exemplos', themis, contacto: A.contacto });
  assert.equal(area.value, expected);
  for (const part of ['Rui Costa', 'QWER-TYUI-OPAS', app, app + '#/ajuda', app + '#/exemplos', themis, 'tiagojacinto@med.up.pt', 'Tiago Jacinto']) {
    assert.ok(area.value.includes(part), part);
  }
  assert.doesNotMatch(area.value, /\batividade|\bobjetivo|\balunos?\b/);
  // Copy: the clipboard gets the whole text and the status line says so.
  let copied = null;
  Object.defineProperty(a.w.navigator, 'clipboard', { configurable: true, value: { writeText: (s) => { copied = s; return Promise.resolve(); } } });
  a.$('#copiar-convite').click();
  await a.waitFor(() => copied !== null, 'copy');
  assert.equal(copied, expected);
  await a.waitFor(() => a.$('#estado-pedido').textContent === S.codigos.conviteCopiado, 'copied message');
  // Without a clipboard the text is selected for a manual copy.
  Object.defineProperty(a.w.navigator, 'clipboard', { configurable: true, value: undefined });
  a.$('#copiar-convite').click();
  await a.waitFor(() => a.$('#estado-pedido').textContent === S.codigos.conviteNaoCopiado, 'not copied message');
  assert.equal(a.w.document.activeElement, area);
  // Shown only in this view.
  await a.go('#/inicio', 'inicio');
  await a.go('#/codigos', 'codigos');
  assert.equal(a.$('#convite'), null);
  assert.equal(a.$('#convite-texto'), null);
});

test('the invitation copy is in European Portuguese with the Quadro spelling and no emoji', () => {
  const text = S.codigos.convite({ nome: 'X', codigo: 'C', app: 'A', ajuda: 'B', exemplos: 'E', themis: 'T', contacto: A.contacto });
  assert.doesNotMatch(text, /\batividade|\bobjetivo|\balunos?\b|\bpacientes?\b|\bcorreção/i);
  assert.doesNotMatch(text, /[☀-➿\u{1F000}-\u{1FAFF}️]/u);
  assert.match(text, /45 minutos/);
  assert.match(text, /dados de doentes/);
});
