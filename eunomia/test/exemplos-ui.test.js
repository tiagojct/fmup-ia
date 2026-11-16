// Tests of the worked examples (#/exemplos, #/exemplos/:n, open with or without a session), start
// from an example, and Duplicar and Apagar on the home page (spec B, D3, D4).
// Run: npm test --prefix eunomia/test
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, INTERVIEW, PATTERNS, EXEMPLOS, referenceFicha, DRAFT_ID, TEACHER, ADMIN, ANSWERS, makeDraft, approvedDraft, json, FakeApi, boot, lastCall } = require('./harness.js');

const w0 = {};
new Function('window', fs.readFileSync(path.join(ROOT, 'i18n-pt.js'), 'utf8'))(w0);
const S = w0.EUNOMIA_PT;
const optionLabel = (stepId, campoId, id) =>
  INTERVIEW.passos.find((p) => p.id === stepId).campos.find((c) => c.id === campoId).opcoes.find((o) => o.id === id).rotulo;
const MODEL_ROUTE = /\/(gerar|sugerir|explicar)$/;
const login = (a) => {
  a.set('#codigo', 'ABCD-EFGH');
  a.$('#login-form button[type=submit]').click();
};
const clickLink = (a, el) => el.dispatchEvent(new a.w.MouseEvent('click', { bubbles: true, cancelable: true }));

// ---------------------------------------------------------------- the list

test('#/exemplos without a session lists six examples with title, area, papel and duration', async (t) => {
  const a = await boot(t, { hash: '#/exemplos' });
  await a.page('exemplos');
  assert.equal(a.w.location.hash, '#/exemplos');
  assert.equal(a.$('#main h2').textContent, S.exemplos.titulo);
  const items = a.$$('#lista-exemplos > li');
  assert.equal(items.length, 6);
  EXEMPLOS.exemplos.forEach((e, n) => {
    const item = items[n];
    const title = item.querySelector(`a[href="#/exemplos/${e.n}"]`);
    assert.ok(title, `link to example ${e.n}`);
    assert.equal(title.textContent, e.titulo);
    const c = e.respostas.contexto;
    assert.ok(item.textContent.includes(optionLabel('contexto', 'area', c.area)), `area of ${e.n}`);
    assert.ok(item.textContent.includes(optionLabel('papel_ia', 'papel', e.respostas.papel_ia.papel)), `papel of ${e.n}`);
    const dur = Number.isInteger(c.duracao_max) && c.duracao_max !== c.duracao_min ? `${c.duracao_min} a ${c.duracao_max} minutos` : `${c.duracao_min} minutos`;
    assert.ok(item.textContent.includes(dur), `${e.n}: ${dur}`);
  });
  // Example 5 has min = max: one number only. Example 6 has no max.
  assert.match(items[4].textContent, /40 minutos/);
  assert.doesNotMatch(items[4].textContent, /40 a 40/);
  assert.match(items[5].textContent, /30 minutos/);
  // With a session it shows too, and the home page links to it.
  const b = await boot(t, { api: new FakeApi({ user: TEACHER }), hash: '#/inicio' });
  await b.page('inicio');
  assert.ok(b.$('#main a[href="#/exemplos"]'));
  await b.go('#/exemplos', 'exemplos');
  assert.equal(b.w.location.hash, '#/exemplos');
});

// ---------------------------------------------------------------- one example

test('#/exemplos/1 shows each question, the answers as labels, the porque line and the reference ficha sections', async (t) => {
  const api = new FakeApi();
  const a = await boot(t, { api, hash: '#/exemplos/1' });
  await a.page('exemplo');
  const e = EXEMPLOS.exemplos.find((x) => x.n === 1);
  assert.equal(a.$('#main h2').textContent, e.titulo);
  // One h3 per answered step, in interview order, then the ficha heading.
  const stepTitles = INTERVIEW.passos.filter((p) => e.respostas[p.id] !== undefined).map((p) => p.titulo);
  const h3 = a.$$('#main h3').map((h) => h.textContent);
  assert.deepEqual(h3, [...stepTitles, S.exemplos.fichaTitulo]);
  // Answers: labels, not ids; numbers as text; the porque line and the nota.
  const ctx = a.$('#exemplo-passo-contexto');
  assert.ok(ctx);
  assert.ok(ctx.querySelector('dl'));
  assert.ok(ctx.textContent.includes(optionLabel('contexto', 'area', 'cuidados_primarios')));
  assert.doesNotMatch(ctx.querySelector('dl').textContent, /cuidados_primarios|uc_undergrad|em_aula/);
  assert.ok(ctx.textContent.includes('Semiologia Médica'));
  assert.ok(ctx.querySelector('dl').textContent.includes('20'));
  assert.ok(ctx.textContent.includes(e.porque.contexto));
  assert.ok(ctx.querySelector('.eu-nota').textContent.includes(e.nota.contexto));
  const padrao = a.$('#exemplo-passo-padrao');
  assert.ok(padrao.textContent.includes(PATTERNS.find((p) => p.id === 'interlocutor_restrito').nome));
  assert.equal(a.$('#exemplo-passo-objectivo .eu-nota'), null, 'no nota where the ficha states the answer');
  // The reference ficha: meta table and the sections.
  await a.waitFor(() => a.$('#exemplo-ficha .ficha-meta'), 'meta table');
  const ficha = referenceFicha(1);
  const meta = a.$('#exemplo-ficha .ficha-meta');
  assert.ok(meta.textContent.includes(ficha.meta.competencia));
  assert.ok(meta.textContent.includes(ficha.meta.duracao.texto));
  assert.ok(meta.textContent.includes(S.meta.ano));
  const h4 = a.$$('#exemplo-ficha h4').map((h) => h.textContent);
  for (const heading of ['Objectivo de aprendizagem', 'Formato e duração em aula', 'Prompt base', 'Papéis', 'Armadilhas conhecidas', 'Referência']) {
    assert.ok(h4.includes(heading), heading);
  }
  assert.ok(a.$('#exemplo-ficha').textContent.includes(ficha.objectivo.competencia_protegida.slice(0, 60)));
  assert.ok(a.$('#exemplo-ficha').textContent.includes('Holderried'));
  // Headings in order: h2, h3, h4 (and h5 inside a section), never a skip.
  const levels = a.$$('#main h2, #main h3, #main h4, #main h5, #main h6').map((h) => Number(h.tagName[1]));
  levels.forEach((l, n) => { if (n > 0) assert.ok(l <= levels[n - 1] + 1, `heading ${n} skips a level`); });
  // No model call, and only public requests.
  assert.equal(api.calls.find((c) => MODEL_ROUTE.test(c.path)), undefined);
  assert.ok(lastCall(api, 'GET', /^\/exemplos\/1$/));
});

test('#/exemplos/6 places its extra after the meta table, before the objective', async (t) => {
  const a = await boot(t, { hash: '#/exemplos/6' });
  await a.page('exemplo');
  await a.waitFor(() => a.$('#exemplo-ficha .ficha-meta'), 'meta table');
  const h4 = a.$$('#exemplo-ficha h4').map((h) => h.textContent);
  assert.equal(h4[0], 'Opção avançada');
  assert.equal(h4[1], 'Objectivo de aprendizagem');
});

test('a failed GET of the reference ficha shows the error and keeps the answers', async (t) => {
  const api = new FakeApi();
  api.on('GET', /^\/exemplos\/2$/, () => json(500, { erro: 'Erro interno do servidor.' }));
  const a = await boot(t, { api, hash: '#/exemplos/2' });
  await a.page('exemplo');
  await a.waitFor(() => a.$('#exemplo-ficha .eu-erro'), 'error box');
  assert.match(a.$('#exemplo-ficha .eu-erro').textContent, /Erro interno/);
  assert.ok(a.$('#exemplo-passo-contexto'));
  assert.equal(a.w.location.hash, '#/exemplos/2');
});

test('an unknown example number goes to the list or the home page', async (t) => {
  const a = await boot(t, { hash: '#/exemplos/7' });
  await a.page('entrar');
});

// ---------------------------------------------------------------- start from an example

test('start from example posts modo criar and exemplo 1 and opens the first step', async (t) => {
  const api = new FakeApi({ user: TEACHER });
  const a = await boot(t, { api, hash: '#/exemplos/1' });
  await a.page('exemplo');
  const btn = a.$('#comecar-exemplo');
  assert.ok(btn);
  assert.equal(btn.tagName, 'BUTTON');
  btn.click();
  await a.page('passo');
  assert.deepEqual(lastCall(api, 'POST', /^\/rascunhos$/).body, { modo: 'criar', exemplo: 1 });
  assert.equal(a.w.location.hash, '#/rascunho/f0f0f0f0f0f0/passo/contexto');
  // The step shows the answers of the example.
  assert.equal(a.$('#campo-uc').value, 'Semiologia Médica');
});

test('without a session the start control is a login link, and after the login the example opens again', async (t) => {
  const api = new FakeApi();
  const a = await boot(t, { api, hash: '#/exemplos/2' });
  await a.page('exemplo');
  assert.equal(a.$('#comecar-exemplo'), null);
  const enter = a.$('#entrar-exemplo');
  assert.ok(enter);
  assert.equal(enter.getAttribute('href'), '#/entrar');
  clickLink(a, enter);
  await a.page('entrar');
  login(a);
  await a.page('exemplo');
  assert.equal(a.w.location.hash, '#/exemplos/2');
  assert.ok(a.$('#comecar-exemplo'));
});

// ---------------------------------------------------------------- Duplicar and Apagar

test('Duplicar posts to duplicar and opens the copy', async (t) => {
  const api = new FakeApi({ user: TEACHER, draft: approvedDraft() });
  const a = await boot(t, { api, hash: '#/inicio' });
  await a.page('inicio');
  await a.waitFor(() => a.$('#lista-rascunhos .duplicar'), 'Duplicar');
  const dup = a.$('#lista-rascunhos .duplicar');
  assert.equal(dup.textContent, 'Duplicar');
  assert.match(dup.getAttribute('aria-label'), /Doente virtual/);
  dup.click();
  await a.waitFor(() => lastCall(api, 'POST', /\/duplicar$/), 'duplicar');
  assert.equal(lastCall(api, 'POST', /\/duplicar$/).path, `/rascunhos/${DRAFT_ID}/duplicar`);
  await a.waitFor(() => /c0c0c0c0c0c0/.test(a.w.location.hash), 'the copy opens');
  await a.page('seccao');
});

test('Apagar asks for confirmation with the title, sends DELETE with the rev, and the row goes; Cancelar keeps it', async (t) => {
  const api = new FakeApi({ user: TEACHER, draft: makeDraft({ respostas: { contexto: ANSWERS.contexto }, rev: 7 }) });
  api.drafts.set('b2b2b2b2b2b2', makeDraft({ id: 'b2b2b2b2b2b2', respostas: { plano: { titulo: 'Outra actividade' } }, rev: 2 }));
  const a = await boot(t, { api, hash: '#/inicio' });
  await a.page('inicio');
  await a.waitFor(() => a.$$('#lista-rascunhos .apagar').length === 2, 'Apagar buttons');
  const row = () => a.$$('#lista-rascunhos li').find((li) => /Introdução à Medicina/.test(li.textContent));
  const del = row().querySelector('.apagar');
  assert.equal(del.textContent, 'Apagar');
  assert.match(del.getAttribute('aria-label'), /Introdução à Medicina/);
  // Cancelar keeps the row and sends nothing.
  del.click();
  assert.ok(row().textContent.includes(S.inicio.confirmarApagar('Introdução à Medicina')));
  assert.equal(a.w.document.activeElement, row().querySelector('.confirmar-apagar'));
  [...row().querySelectorAll('button')].find((b) => b.textContent === S.comum.cancelar).click();
  assert.equal(lastCall(api, 'DELETE', /^\/rascunhos\//), undefined);
  assert.equal(row().querySelector('.confirmar-apagar'), null);
  assert.equal(a.w.document.activeElement, row().querySelector('.apagar'));
  // Apagar, then confirm.
  row().querySelector('.apagar').click();
  const confirm = row().querySelector('.confirmar-apagar');
  assert.equal(confirm.textContent, 'Apagar');
  confirm.click();
  await a.waitFor(() => lastCall(api, 'DELETE', /^\/rascunhos\//), 'DELETE');
  const call = lastCall(api, 'DELETE', /^\/rascunhos\//);
  assert.equal(call.path, `/rascunhos/${DRAFT_ID}`);
  assert.deepEqual(call.body, { rev: 7 });
  await a.waitFor(() => !row(), 'the row goes');
  assert.match(a.$('#lista-rascunhos').textContent, /Outra actividade/);
  await a.waitFor(() => a.$('#estado-pedido').textContent === S.inicio.apagado('Introdução à Medicina'), 'status line');
  assert.equal(a.w.document.activeElement, a.$('#estado-pedido'));
});

test('a stale rev on Apagar shows the conflict and Recarregar; the row stays', async (t) => {
  const api = new FakeApi({ user: TEACHER, draft: makeDraft({ respostas: { contexto: ANSWERS.contexto } }) });
  api.on('DELETE', /^\/rascunhos\//, () => json(409, { erro: 'O rascunho foi alterado noutra janela. Recarregue a página.', motivo: 'rev' }));
  const a = await boot(t, { api, hash: '#/inicio' });
  await a.page('inicio');
  await a.waitFor(() => a.$('#lista-rascunhos .apagar'), 'Apagar');
  a.$('#lista-rascunhos .apagar').click();
  a.$('#lista-rascunhos .confirmar-apagar').click();
  await a.waitFor(() => a.$('.eu-erro'), 'error');
  assert.match(a.$('.eu-erro').textContent, /noutra janela/);
  assert.ok(a.$('#recarregar'));
  assert.ok(a.$('#lista-rascunhos .eu-rascunho-titulo'));
});

test('a submetida draft has Duplicar but no Apagar', async (t) => {
  const api = new FakeApi({ user: TEACHER, draft: approvedDraft({ estado: 'submetida' }) });
  const a = await boot(t, { api, hash: '#/inicio' });
  await a.page('inicio');
  await a.waitFor(() => a.$('#lista-rascunhos .duplicar'), 'Duplicar');
  assert.equal(a.$('#lista-rascunhos .apagar'), null);
});

test('the new controls are labelled buttons and links, with no click handler on div or span', async (t) => {
  const api = new FakeApi({ user: ADMIN, draft: approvedDraft() });
  const a = await boot(t, { api, hash: '#/inicio' });
  await a.page('inicio');
  await a.waitFor(() => a.$('#lista-rascunhos .apagar'), 'Apagar');
  a.$('#lista-rascunhos .apagar').click();
  for (const h of ['#/exemplos', '#/exemplos/3']) {
    if (h !== '#/inicio') await a.go(h, h === '#/exemplos' ? 'exemplos' : 'exemplo');
    for (const el of a.$$('button, a')) assert.ok(el.textContent.trim() || el.getAttribute('aria-label'), `${h}: ${el.outerHTML.slice(0, 80)}`);
  }
  for (const el of a.clickTargets) {
    if (!el.tagName) continue;
    assert.ok(['BUTTON', 'A', 'INPUT', 'SELECT'].includes(el.tagName), `click handler on ${el.tagName}`);
  }
});
