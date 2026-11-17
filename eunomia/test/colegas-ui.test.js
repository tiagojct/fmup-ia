// Headless tests of Eunomia 0.3 for colleagues (spec 2026-11-17): "Adaptar uma actividade que já
// faço" (#/adaptar, POST /rascunhos/adaptar, the notes and marks of the proposed steps).
// Run: npm test --prefix eunomia/test
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, DRAFT_ID, TEACHER, ANSWERS, makeDraft, json, FakeApi, boot, lastCall } = require('./harness.js');

function load(file, name) {
  const w = {};
  new Function('window', fs.readFileSync(path.join(ROOT, file), 'utf8'))(w);
  return w[name];
}
const S = load('i18n-pt.js', 'EUNOMIA_PT');

const PERSONAL = { erro: 'O texto pode ter dados pessoais de doentes ou estudantes. Retire-os, ou confirme que o texto não os tem.', motivo: 'dados_pessoais', achados: ['Possível NIF: 123456789'] };
const TEXTO = 'Aula prática de anamnese com um doente simulado, 45 minutos, 40 estudantes do 1.º ano.';
const NEW_ID = 'adadadadadad';
const adaptCalls = (api) => api.calls.filter((c) => c.method === 'POST' && c.path === '/rascunhos/adaptar');
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function openAdapt(t, api) {
  const a = await boot(t, { api, hash: '#/adaptar' });
  await a.page('adaptar');
  return a;
}

test('the copy of Adaptar: the keys of the brief, the spec texts, the Quadro spelling', () => {
  assert.equal(S.inicio.adaptar, 'Adaptar uma actividade que já faço');
  for (const k of ['pagina', 'titulo', 'intro', 'campo', 'aviso', 'botao', 'aProcessar', 'erro', 'notaVazio', 'marca']) {
    assert.ok(typeof S.adaptar[k] === 'string' && S.adaptar[k] !== '', k);
  }
  assert.equal(S.adaptar.campo, 'Cole o enunciado ou a descrição da actividade');
  assert.equal(S.adaptar.botao, 'Propor respostas');
  assert.equal(S.adaptar.marca, 'Proposto a partir do seu texto');
  assert.equal(S.adaptar.aviso, S.passo.materiaisAviso, 'the same data rule as the materials step');
  assert.match(S.adaptar.erro, /«Os meus rascunhos»/);
  // The count is the steps still to review, so the copy reads right as it goes down.
  assert.equal(S.adaptar.notaPreenchido(2), 'A Eunomia propôs respostas a partir do seu texto. Falta rever 2 passos: as decisões são suas.');
  assert.equal(S.adaptar.notaPreenchido(1), 'A Eunomia propôs respostas a partir do seu texto. Falta rever 1 passo: as decisões são suas.');
  assert.match(S.adaptar.notaLonga(20000), /20.000 caracteres/);
  assert.match(S.adaptar.notaLonga(20000), /materiais/);
});

test('home: "Adaptar uma actividade que já faço" sits next to "Nova actividade" and opens #/adaptar', async (t) => {
  const a = await boot(t, { api: new FakeApi({ user: TEACHER }), hash: '#/inicio' });
  await a.page('inicio');
  const btn = a.$('#adaptar-actividade');
  assert.ok(btn, 'the Adaptar control');
  assert.equal(btn.textContent, S.inicio.adaptar);
  assert.equal(btn.parentNode, a.$('#novo-rascunho').parentNode, 'in the same row as Nova actividade');
  assert.equal(btn.getAttribute('href'), '#/adaptar', 'a link: keyboard reachable');
  await a.go('#/adaptar', 'adaptar');
});

test('#/adaptar: one heading with the focus, a labelled textarea, the data rule, the button and a way back', async (t) => {
  const a = await openAdapt(t, new FakeApi({ user: TEACHER }));
  const h = a.$('#main h2');
  assert.equal(h.textContent, S.adaptar.titulo);
  assert.equal(a.$$('#main h2').length, 1);
  assert.equal(a.w.document.activeElement, h, 'focus on the new heading');
  assert.match(a.w.document.title, new RegExp(S.adaptar.pagina));
  const ta = a.$('#main textarea');
  assert.ok(ta, 'textarea');
  const label = a.$(`label[for="${ta.id}"]`);
  assert.ok(label, 'labelled');
  assert.match(label.textContent, new RegExp(S.adaptar.campo));
  assert.equal(ta.hasAttribute('maxlength'), false, 'a pasted text is never cut silently');
  assert.match(a.text(), new RegExp(S.adaptar.aviso.slice(0, 40)));
  assert.equal(a.$('#propor-respostas').textContent, S.adaptar.botao);
  assert.equal(a.$('#propor-respostas').type, 'submit');
  assert.ok(a.$('#main a[href="#/inicio"]'), 'back to the drafts');
  assert.equal(a.$('#estado-pedido').getAttribute('aria-live'), 'polite');
});

test('a text over 20 000 characters shows the note under the textarea before sending', async (t) => {
  const a = await openAdapt(t, new FakeApi({ user: TEACHER }));
  const ta = a.$('#main textarea');
  const note = () => a.$('#adaptar-nota-longa');
  assert.ok(note(), 'the note slot');
  assert.equal(note().textContent, '');
  a.set('#' + ta.id, 'x'.repeat(20000));
  assert.equal(note().textContent, '', 'not at 20 000');
  a.set('#' + ta.id, 'x'.repeat(20001));
  assert.equal(note().textContent, S.adaptar.notaLonga(20000));
  assert.ok(ta.getAttribute('aria-describedby').split(' ').includes('adaptar-nota-longa'));
  assert.equal(note().closest('[aria-live]') !== null, true, 'announced');
  a.set('#' + ta.id, 'curto');
  assert.equal(note().textContent, '');
});

test('Propor respostas: POST { texto }, then the first step with the note, the focus on its heading and the marks', async (t) => {
  const api = new FakeApi({ user: TEACHER });
  const a = await openAdapt(t, api);
  a.set('#' + a.$('#main textarea').id, TEXTO);
  a.$('#propor-respostas').click();
  await a.waitFor(() => a.w.location.hash === `#/rascunho/${NEW_ID}/passo/contexto`, 'first step');
  await a.page('passo');
  const calls = adaptCalls(api);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].body, { texto: TEXTO });
  assert.equal(a.w.document.activeElement, a.$('#main h2.step-title'), 'focus on the step heading');
  assert.equal(a.$('#nota-adaptar').textContent, S.adaptar.notaPreenchido(2));
  assert.equal(a.$('#marca-proposto').textContent, S.adaptar.marca);
  assert.equal(a.$('#campo-uc').value, ANSWERS.contexto.uc, 'the proposed answer is in the form');

  // Saving the step removes its mark; the other proposed step keeps it.
  a.$('#guardar-passo').click();
  await a.waitFor(() => /\/passo\/objectivo$/.test(a.w.location.hash), 'next step');
  await a.page('passo');
  assert.equal(a.$('#marca-proposto').textContent, S.adaptar.marca);
  assert.equal(a.$('#nota-adaptar').textContent, S.adaptar.notaPreenchido(1));
  await a.go(`#/rascunho/${NEW_ID}/passo/contexto`, 'passo');
  assert.equal(a.$('#marca-proposto'), null, 'no mark after saving');
  // A step the model did not fill has no mark.
  await a.go(`#/rascunho/${NEW_ID}/passo/evidencia`, 'passo');
  assert.equal(a.$('#marca-proposto'), null);
});

test('a 422 dados_pessoais shows the findings and the confirmation of the materials step, and resends with confirmo', async (t) => {
  const api = new FakeApi({ user: TEACHER });
  api.on('POST', /^\/rascunhos\/adaptar$/, (call) => (call.body.confirmo_sem_dados_pessoais === true ? api.route(call) : json(422, PERSONAL)));
  const a = await openAdapt(t, api);
  const ta = a.$('#main textarea');
  a.set('#' + ta.id, TEXTO + ' NIF 123456789.');
  a.$('#propor-respostas').click();
  await a.waitFor(() => a.$('#confirmo-dados'), 'confirmation');
  assert.match(a.text(), /Possível NIF: 123456789/);
  assert.match(a.$('label[for="confirmo-dados"]').textContent, new RegExp(S.dadosPessoais.confirmo));
  assert.equal(a.w.document.activeElement, a.$('.eu-erro'), 'focus on the box');
  assert.equal(ta.value, TEXTO + ' NIF 123456789.', 'the text stays');
  const again = a.$('#guardar-confirmado');
  assert.equal(again.disabled, true);
  a.set('#confirmo-dados', true);
  again.click();
  await a.waitFor(() => a.w.location.hash === `#/rascunho/${NEW_ID}/passo/contexto`, 'first step');
  const calls = adaptCalls(api);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].body, { texto: TEXTO + ' NIF 123456789.', confirmo_sem_dados_pessoais: true });
});

test('review focus 4: a status-0 failure on adaptar is never retried; the error says to check Os meus rascunhos', async (t) => {
  const api = new FakeApi({ user: TEACHER });
  api.on('POST', /^\/rascunhos\/adaptar$/, () => { throw new TypeError('Failed to fetch'); });
  const a = await openAdapt(t, api);
  a.w.EUNOMIA_API.retry.delay = 10;
  a.set('#' + a.$('#main textarea').id, TEXTO);
  a.$('#propor-respostas').click();
  const box = await a.waitFor(() => a.$('.eu-erro'), 'error');
  await pause(80);
  assert.equal(adaptCalls(api).length, 1, 'fetch called once');
  assert.equal(box.querySelector('.eu-erro-texto').textContent, S.erros.rede);
  assert.match(box.textContent, new RegExp(S.adaptar.erro.slice(0, 30)));
  assert.ok(box.querySelector('a[href="#/inicio"]'), 'a link to the drafts');
  assert.equal(a.$('#main textarea').value, TEXTO, 'the text stays');
  assert.equal(a.w.location.hash, '#/adaptar');
});

test('a gateway error on adaptar also says to check Os meus rascunhos; a 409 limite does not', async (t) => {
  const api = new FakeApi({ user: TEACHER });
  let status = 504;
  api.on('POST', /^\/rascunhos\/adaptar$/, () => (status === 504
    ? json(504, { erro: 'O modelo demorou demasiado a responder.' })
    : json(409, { erro: 'Tem 100 rascunhos.', motivo: 'limite' })));
  const a = await openAdapt(t, api);
  a.set('#' + a.$('#main textarea').id, TEXTO);
  a.$('#propor-respostas').click();
  let box = await a.waitFor(() => a.$('.eu-erro'), 'error');
  assert.match(box.textContent, new RegExp(S.adaptar.erro.slice(0, 30)));
  status = 409;
  a.$('#propor-respostas').click();
  box = await a.waitFor(() => a.$('.eu-erro') && /100 rascunhos/.test(a.$('.eu-erro').textContent) && a.$('.eu-erro'), 'limit error');
  assert.doesNotMatch(box.textContent, new RegExp(S.adaptar.erro.slice(0, 30)));
  assert.equal(adaptCalls(api).length, 2);
});

test('a status-0 failure on objectivo/sugerir is still retried once', async (t) => {
  const api = new FakeApi({ user: TEACHER, draft: makeDraft({ respostas: { contexto: ANSWERS.contexto } }) });
  let n = 0;
  api.on('POST', /\/objectivo\/sugerir$/, (call) => {
    n += 1;
    if (n === 1) throw new TypeError('Failed to fetch');
    return api.route(call);
  });
  const a = await boot(t, { api, hash: `#/rascunho/${DRAFT_ID}/passo/objectivo` });
  a.w.EUNOMIA_API.retry.delay = 10;
  await a.page('passo');
  a.set('#campo-texto', 'Saber fazer uma anamnese.');
  a.$('#sugerir-objectivo').click();
  await a.waitFor(() => a.$('.eu-sugestao'), 'suggestions');
  assert.equal(api.calls.filter((c) => /\/objectivo\/sugerir$/.test(c.path)).length, 2);
});

test('adaptar carries the own-key headers; GET /rascunhos does not', async (t) => {
  const api = new FakeApi({ user: TEACHER });
  const a = await boot(t, { api, hash: '#/inicio', stored: { key: 'sk-minha', agent: 'ag', channel: 'ca', user: 'u1' } });
  await a.page('inicio');
  assert.equal(lastCall(api, 'GET', /^\/rascunhos$/).headers.get('x-iaedu-key'), null);
  await a.go('#/adaptar', 'adaptar');
  a.set('#' + a.$('#main textarea').id, TEXTO);
  a.$('#propor-respostas').click();
  await a.waitFor(() => adaptCalls(api).length === 1, 'adaptar');
  const h = adaptCalls(api)[0].headers;
  assert.equal(h.get('x-iaedu-key'), 'sk-minha');
  assert.equal(h.get('x-iaedu-agent'), 'ag');
  assert.equal(h.get('x-iaedu-channel'), 'ca');
  await a.page('passo');
});

test('a refinar draft with nothing proposed shows notaVazio until a step other than materiais has an answer', async (t) => {
  const api = new FakeApi({ user: TEACHER });
  api.adaptar = {};
  const a = await openAdapt(t, api);
  a.set('#' + a.$('#main textarea').id, TEXTO);
  a.$('#propor-respostas').click();
  await a.waitFor(() => a.w.location.hash === `#/rascunho/${NEW_ID}/passo/contexto`, 'first step');
  await a.page('passo');
  assert.equal(a.$('#nota-adaptar').textContent, S.adaptar.notaVazio);
  assert.equal(a.$('#marca-proposto'), null);
  api.drafts.get(NEW_ID).respostas.contexto = ANSWERS.contexto; // the teacher saved contexto
  await a.go(`#/rascunho/${NEW_ID}/passo/objectivo`, 'passo');
  assert.equal(a.$('#nota-adaptar'), null, 'gone once the teacher answered a step');
});

test('a criar draft shows neither note nor mark', async (t) => {
  const api = new FakeApi({ user: TEACHER, draft: makeDraft() });
  const a = await boot(t, { api, hash: `#/rascunho/${DRAFT_ID}/passo/contexto` });
  await a.page('passo');
  assert.equal(a.$('#nota-adaptar'), null);
  assert.equal(a.$('#marca-proposto'), null);
});

// ---------------------------------------------------------------- Task 6: entry routes, status, what Tiago sees

const ESTADO = 'A Eunomia é uma ferramenta desenvolvida por Tiago Jacinto (MEDCIDS) como proposta, para testar, melhorar e construir com colegas. Não é uma ferramenta oficial da FMUP. O uso é voluntário.';
const O_QUE_VE = 'Tiago Jacinto vê o seu nome, quantos rascunhos tem e em que estado, quantos pedidos faz ao modelo e as opiniões que deixar em «Foi útil?». A Eunomia só lhe mostra o texto de uma actividade depois de a submeter para revisão. A revisão é opcional e não é uma avaliação do seu trabalho.';
const A = load('ajuda-pt.js', 'EUNOMIA_AJUDA');
const words = (s) => s.split(/\s+/).filter(Boolean).length;

test('the copy of the entry routes: status, what Tiago sees, the two cards, the Themis line', () => {
  assert.equal(S.app.estado, ESTADO);
  assert.equal(S.app.oQueVe, O_QUE_VE);
  assert.equal(S.inicio.cartaRegra.titulo, 'Preparar a regra de IA para um trabalho avaliado');
  assert.equal(S.inicio.cartaRegra.texto, 'Cerca de 5 minutos, na Themis, a outra ferramenta do FMUP · IA. Não guarda nada.');
  assert.ok(typeof S.inicio.cartaRegra.link === 'string' && /Themis/.test(S.inicio.cartaRegra.link));
  assert.equal(S.inicio.cartaActividade.titulo, 'Desenhar ou adaptar uma actividade');
  assert.match(S.inicio.cartaActividade.texto, /sem IA/, 'an activity without AI is a valid result');
  assert.equal(S.inicio.cartaActividade.exemplo, 'Começar a partir de um exemplo');
  assert.ok(typeof S.entrar.themis === 'string' && /Themis/.test(S.entrar.themis));
  // The login data notice: its last sentence is now the what-Tiago-sees text.
  assert.ok(S.entrar.avisoServidor.endsWith(' ' + O_QUE_VE), 'avisoServidor ends with S.app.oQueVe');
  assert.doesNotMatch(S.entrar.avisoServidor, /as actividades que submeter para revisão/);
  for (const s of [S.app.estado, S.inicio.cartaActividade.texto, S.entrar.themis]) {
    assert.doesNotMatch(s, /\batividade|\bobjetivo|\balunos?\b|\bcorreção/i);
    assert.doesNotMatch(s, /endossad|aprovad|oficial do Quadro/i, 'no claim about the Quadro or any endorsement');
  }
});

test('home: two cards with h3 headings above Os meus rascunhos; the regra card links to ../themis/; the actividade card has the buttons and the examples', async (t) => {
  const a = await boot(t, { api: new FakeApi({ user: TEACHER }), hash: '#/inicio' });
  await a.page('inicio');
  const box = a.$('#entradas');
  assert.ok(box, 'the two entry routes');
  const cards = [...box.querySelectorAll(':scope > section')];
  assert.equal(cards.length, 2);
  const title = (card) => a.$('#' + card.getAttribute('aria-labelledby'));
  assert.equal(title(cards[0]).tagName, 'H3');
  assert.equal(title(cards[0]).textContent, S.inicio.cartaRegra.titulo);
  assert.equal(title(cards[1]).tagName, 'H3');
  assert.equal(title(cards[1]).textContent, S.inicio.cartaActividade.titulo);
  // Regra: the line and the link to the Themis.
  assert.ok(cards[0].textContent.includes(S.inicio.cartaRegra.texto));
  const themis = cards[0].querySelector('a[href="../themis/"]');
  assert.ok(themis, 'link to ../themis/');
  assert.equal(themis.textContent, S.inicio.cartaRegra.link);
  // Actividade: the sentence on sem IA, the two buttons (Task 5 ids) and the examples link.
  assert.ok(cards[1].textContent.includes(S.inicio.cartaActividade.texto));
  assert.ok(cards[1].contains(a.$('#novo-rascunho')), 'Nova actividade in the card');
  assert.ok(cards[1].contains(a.$('#adaptar-actividade')), 'Adaptar in the card');
  const ex = cards[1].querySelector('a[href="#/exemplos"]');
  assert.ok(ex, 'link to the examples');
  assert.equal(ex.textContent, S.inicio.cartaActividade.exemplo);
  // Keyboard: every control in the cards is a link with an href or a button, with a name.
  for (const c of box.querySelectorAll('a, button')) {
    assert.ok(c.tagName === 'BUTTON' || c.hasAttribute('href'), c.outerHTML);
    assert.ok(c.textContent.trim() !== '', 'a visible name');
  }
  // Above Os meus rascunhos; headings in order: the h2 of the page, then h3 only.
  const meus = a.$('#meus-titulo');
  assert.ok(box.compareDocumentPosition(meus) & a.w.Node.DOCUMENT_POSITION_FOLLOWING, 'cards before Os meus rascunhos');
  const levels = a.$$('#main h1, #main h2, #main h3, #main h4, #main h5, #main h6').map((h) => h.tagName);
  assert.equal(levels[0], 'H2');
  assert.deepEqual([...new Set(levels.slice(1))], ['H3']);
});

test('the cards stack at narrow width: one column by default, two only in a min-width media query', () => {
  // jsdom does no layout: check the rules of style.css instead.
  const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  const base = /(^|\n)\.eu-entradas\s*\{([^}]*)\}/.exec(css);
  assert.ok(base, 'a top-level .eu-entradas rule');
  assert.match(base[2], /display:\s*grid/);
  assert.match(base[2], /grid-template-columns:\s*minmax\(0,\s*1fr\);/);
  const media = /@media \(min-width: (\d+)px\)\s*\{\s*\.eu-entradas\s*\{([^}]*)\}/.exec(css);
  assert.ok(media, 'the two columns sit in a min-width media query');
  assert.ok(Number(media[1]) > 400, 'still one column at 400 px');
  assert.match(media[2], /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.doesNotMatch(css, /\.eu-entrada[^s{]*\{[^}]*\b(min-)?width:\s*\d/, 'no fixed card width');
});

test('login page: the status sentence, the Themis line with its link, and what Tiago sees in the data notice', async (t) => {
  const a = await boot(t);
  await a.page('entrar');
  assert.equal(a.$('#entrar-estado').textContent, S.app.estado);
  const line = a.$('#entrar-themis');
  assert.ok(line.textContent.includes(S.entrar.themis));
  assert.ok(line.querySelector('a[href="../themis/"]'), 'the Themis link');
  const notice = a.$('#aviso-dados').textContent;
  assert.ok(notice.includes(S.app.oQueVe));
  assert.doesNotMatch(notice, /as actividades que submeter para revisão/);
});

test('the first-visit box says what Tiago sees', async (t) => {
  const a = await boot(t, { api: new FakeApi({ user: TEACHER }), hash: '#/inicio' });
  await a.page('inicio');
  assert.ok(a.$('#primeira-vez').textContent.includes(S.app.oQueVe));
});

test('the footer shows the status sentence in an element of its own', async (t) => {
  const a = await boot(t);
  await a.page('entrar');
  const node = a.$('footer.site-footer #rodape-estado');
  assert.ok(node, 'status element in the footer');
  assert.equal(node.textContent, S.app.estado);
});

test('the invitation: problem, two routes with the Themis URL, status, link and code, data rule, contact; sem IA; under 200 words', async (t) => {
  const api = new FakeApi({ user: { id: 'u9', nome: 'Tiago Jacinto', perfil: 'admin' } });
  const a = await boot(t, { api, hash: '#/codigos' });
  await a.page('codigos');
  a.set('#novo-nome', 'Rui Costa');
  a.$('#criar-codigo').click();
  await a.waitFor(() => a.$('#convite-texto'), 'invitation');
  const text = a.$('#convite-texto').value;
  const app = 'https://example.test/fmup-ia/eunomia/';
  const themis = 'https://example.test/fmup-ia/themis/';
  assert.equal(text, S.codigos.convite({ nome: 'Rui Costa', codigo: 'QWER-TYUI-OPAS', app, ajuda: app + '#/ajuda', exemplos: app + '#/exemplos', themis, contacto: A.contacto }));
  assert.match(text, /sem IA/);
  assert.ok(words(text) < 200, `${words(text)} words`);
  const at = (s) => {
    const i = text.indexOf(s);
    assert.ok(i >= 0, s);
    return i;
  };
  const order = [at('Os seus estudantes usam IA nos trabalhos?'), at(themis), at('45 minutos'), at(S.app.estado), at(app + '\n'), at('QWER-TYUI-OPAS'),
    at(app + '#/ajuda'), at(app + '#/exemplos'), at('dados de doentes'), at('tiagojacinto@med.up.pt')];
  assert.deepEqual(order, [...order].sort((x, y) => x - y), 'the order of spec section 1');
  assert.doesNotMatch(text, /\batividade|\bobjetivo|\balunos?\b|\bcorreção/i);
});
