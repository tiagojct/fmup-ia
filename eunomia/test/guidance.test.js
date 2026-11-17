// Tests of the guidance on each step (spec C: progress with minutes, "Ver exemplo", "Erros comuns",
// the side panel "A sua ficha até agora") and of the one retry of a model request that fails with
// status 0 (spec D1). Run: npm test --prefix eunomia/test
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, INTERVIEW, PATTERNS, EXEMPLOS, DRAFT_ID, TEACHER, ANSWERS, makeDraft, approvedDraft, json, FakeApi, boot } = require('./harness.js');

const w0 = {};
new Function('window', fs.readFileSync(path.join(ROOT, 'i18n-pt.js'), 'utf8'))(w0);
new Function('window', fs.readFileSync(path.join(ROOT, 'ajuda-pt.js'), 'utf8'))(w0);
const S = w0.EUNOMIA_PT;
const A = w0.EUNOMIA_AJUDA;
const step = (id) => INTERVIEW.passos.find((p) => p.id === id);
const optionLabel = (stepId, campoId, id) => step(stepId).campos.find((c) => c.id === campoId).opcoes.find((o) => o.id === id).rotulo;
const gerarCalls = (api) => api.calls.filter((c) => c.method === 'POST' && /\/gerar$/.test(c.path));

// ---------------------------------------------------------------- progress

test('a step shows Passo 1 de 8 and the minutes to the plan', async (t) => {
  // Formative (no summative evidence): regime_themis does not apply. T counts the plan.
  const formative = INTERVIEW.passos.filter((p) => p.id !== 'regime_themis');
  assert.equal(formative.length, 8);
  const m = formative.filter((p) => p.id !== 'plano').reduce((sum, p) => sum + p.minutos, 0);
  const a = await boot(t, { api: new FakeApi({ user: TEACHER, draft: makeDraft() }), hash: `#/rascunho/${DRAFT_ID}/passo/contexto` });
  await a.page('passo');
  assert.equal(a.$('.step-progress').textContent, `Passo 1 de 8 · cerca de ${m} min até ao plano`);
  assert.equal(a.$('.step-progress').textContent, S.passo.progresso(1, 8, m));

  // Summative: 9 steps, and from the third step the minutes of the steps left before the plan.
  const d = makeDraft({ respostas: { contexto: ANSWERS.contexto, objectivo: ANSWERS.objectivo, evidencia: { ...ANSWERS.evidencia, avaliacao: 'sumativa' } } });
  const ids = ['evidencia', 'papel_ia', 'regime', 'regime_themis', 'padrao', 'materiais'];
  const m2 = ids.reduce((sum, id) => sum + step(id).minutos, 0);
  const b = await boot(t, { api: new FakeApi({ user: TEACHER, draft: d }), hash: `#/rascunho/${DRAFT_ID}/passo/evidencia` });
  await b.page('passo');
  assert.equal(b.$('.step-progress').textContent, `Passo 3 de 9 · cerca de ${m2} min até ao plano`);
});

// ---------------------------------------------------------------- Ver exemplo and Erros comuns

test('Ver exemplo is a details element with the answers and titles of the examples of por_passo; regime_themis without examples has none', async (t) => {
  const api = new FakeApi({ user: TEACHER, draft: makeDraft({ respostas: { evidencia: { descricao: 'x', avaliacao: 'sumativa' } } }) });
  const a = await boot(t, { api, hash: `#/rascunho/${DRAFT_ID}/passo/contexto` });
  await a.page('passo');
  const box = a.$('details.eu-exemplo');
  assert.ok(box, 'details');
  assert.equal(box.querySelector('summary').textContent, S.passo.verExemplo);
  assert.equal(box.querySelector('summary').textContent, 'Ver exemplo');
  const titles = [...box.querySelectorAll('h4')].map((h) => h.textContent);
  const list = EXEMPLOS.por_passo.contexto;
  assert.deepEqual(titles, list.map((n) => EXEMPLOS.exemplos.find((e) => e.n === n).titulo));
  const dls = box.querySelectorAll('dl.eu-respostas');
  assert.equal(dls.length, list.length);
  list.forEach((n, k) => {
    const c = EXEMPLOS.exemplos.find((e) => e.n === n).respostas.contexto;
    assert.ok(dls[k].textContent.includes(c.uc), `uc of ${n}`);
    assert.ok(dls[k].textContent.includes(optionLabel('contexto', 'area', c.area)), `area label of ${n}`);
  });

  // The pattern step names the pattern, not its id.
  await a.go(`#/rascunho/${DRAFT_ID}/passo/padrao`, 'passo');
  const first = EXEMPLOS.exemplos.find((e) => e.n === EXEMPLOS.por_passo.padrao[0]);
  const name = PATTERNS.find((p) => p.id === first.respostas.padrao.padrao).nome;
  assert.ok(a.$('details.eu-exemplo').textContent.includes(name));

  // papel_ia and regime: the last example is 7, the activity without AI.
  for (const stepId of ['papel_ia', 'regime']) {
    await a.go(`#/rascunho/${DRAFT_ID}/passo/${stepId}`, 'passo');
    const list = EXEMPLOS.por_passo[stepId];
    assert.equal(list[list.length - 1], 7, stepId);
    assert.deepEqual([...a.$$('details.eu-exemplo h4')].map((h) => h.textContent), list.map((n) => EXEMPLOS.exemplos.find((e) => e.n === n).titulo), stepId);
  }

  // regime_themis: examples 5 and 7 in the data; with an empty list, no disclosure at all.
  await a.go(`#/rascunho/${DRAFT_ID}/passo/regime_themis`, 'passo');
  assert.deepEqual(EXEMPLOS.por_passo.regime_themis, [5, 7]);
  assert.deepEqual([...a.$$('details.eu-exemplo h4')].map((h) => h.textContent), [5, 7].map((n) => EXEMPLOS.exemplos.find((e) => e.n === n).titulo));
  const api2 = new FakeApi({ user: TEACHER, draft: makeDraft({ respostas: { evidencia: { descricao: 'x', avaliacao: 'sumativa' } } }) });
  api2.static('exemplos.json', { ...EXEMPLOS, por_passo: { ...EXEMPLOS.por_passo, regime_themis: [] } });
  const b = await boot(t, { api: api2, hash: `#/rascunho/${DRAFT_ID}/passo/regime_themis` });
  await b.page('passo');
  assert.equal(b.$('details.eu-exemplo'), null);
  assert.ok(b.$('details.eu-erros-comuns'), 'Erros comuns stays');
  // No API request for the examples: they are static data.
  assert.equal(api.calls.filter((c) => /exemplos/.test(c.path)).length, 0);
});

test('Dicas lists the items of interview.json for the step', async (t) => {
  const a = await boot(t, { api: new FakeApi({ user: TEACHER, draft: makeDraft() }), hash: `#/rascunho/${DRAFT_ID}/passo/objectivo` });
  await a.page('passo');
  const box = a.$('details.eu-erros-comuns');
  assert.ok(box);
  assert.equal(box.querySelector('summary').textContent, 'Dicas');
  assert.equal(box.querySelector('summary').textContent, S.passo.errosComuns);
  assert.deepEqual([...box.querySelectorAll('ul > li')].map((li) => li.textContent), step('objectivo').erros_comuns);
  assert.equal(box.open, false, 'closed by default');
  await a.go(`#/rascunho/${DRAFT_ID}/passo/materiais`, 'passo');
  assert.deepEqual([...a.$$('details.eu-erros-comuns li')].map((li) => li.textContent), step('materiais').erros_comuns);
});

// ---------------------------------------------------------------- the side panel

test('the side panel shows the meta table, the objective and the regime from the saved answers, on a step and on the plan page, with no POST', async (t) => {
  const api = new FakeApi({ user: TEACHER, draft: makeDraft({ respostas: ANSWERS }) });
  const a = await boot(t, { api, hash: `#/rascunho/${DRAFT_ID}/passo/contexto` });
  await a.page('passo');
  const pattern = PATTERNS.find((p) => p.id === ANSWERS.padrao.padrao);
  const check = (where) => {
    const panel = a.$('aside.eu-painel-ficha');
    assert.ok(panel, `${where}: panel`);
    const h3 = a.$(`#${panel.getAttribute('aria-labelledby')}`);
    assert.equal(h3.tagName, 'H3');
    assert.equal(h3.textContent, 'A sua ficha até agora');
    const rows = Object.fromEntries([...panel.querySelectorAll('table.ficha-meta tr')].map((tr) => [tr.querySelector('th').textContent, tr.querySelector('td').textContent]));
    assert.deepEqual(rows, {
      [S.meta.competencia]: ANSWERS.objectivo.competencia,
      [S.meta.formato]: pattern.formato_grupo,
      [S.meta.duracao]: '45 minutos',
      [S.meta.ano]: ANSWERS.contexto.programa,
      [S.meta.areas]: optionLabel('contexto', 'area', ANSWERS.contexto.area),
      [S.meta.ferramenta]: 'IAedu',
    }, where);
    assert.ok(panel.textContent.includes(ANSWERS.objectivo.texto), `${where}: objective`);
    assert.ok(panel.textContent.includes('Papel da IA nesta actividade: contraparte. A IA assume um papel na actividade.'), `${where}: papel`);
    assert.ok(panel.textContent.includes('Regime para os estudantes durante a actividade, verde: permitido.'), `${where}: regime`);
    // Beside the content, not inside the form.
    assert.ok(panel.parentNode.classList.contains('eu-rascunho'));
    assert.equal(panel.closest('form'), null);
  };
  check('step');
  await a.go(`#/rascunho/${DRAFT_ID}/plano`, 'plano');
  check('plan');
  assert.deepEqual(api.calls.filter((c) => c.method !== 'GET'), [], 'no POST, PUT or DELETE');

  // The group format of the answer wins over the pattern's; a conditioned regime shows its conditions.
  const r = { ...ANSWERS, padrao: { padrao: 'interlocutor_restrito', formato_grupo: 'Grupos de quatro' }, regime: { regime: 'condicionado', condicoes: 'Só com declaração de uso.' }, papel_ia: { papel: 'nenhum' } };
  const b = await boot(t, { api: new FakeApi({ user: TEACHER, draft: makeDraft({ respostas: r }) }), hash: `#/rascunho/${DRAFT_ID}/passo/padrao` });
  await b.page('passo');
  const panel = b.$('aside.eu-painel-ficha');
  assert.match(panel.textContent, /Grupos de quatro/);
  assert.match(panel.textContent, /Esta actividade não usa IA\./);
  assert.match(panel.textContent, /Regime para os estudantes durante a actividade, amarelo: permitido com condições\./);
  assert.match(panel.textContent, /Condições: Só com declaração de uso\./);
  assert.match(panel.textContent, /Nenhuma/);

  // A new draft: the panel says that nothing is answered yet.
  const c = await boot(t, { api: new FakeApi({ user: TEACHER, draft: makeDraft() }), hash: `#/rascunho/${DRAFT_ID}/passo/contexto` });
  await c.page('passo');
  assert.ok(c.$('aside.eu-painel-ficha').textContent.includes(S.painel.vazio));
  assert.equal(c.$('aside.eu-painel-ficha table'), null);
});

test('the side panel is not on the section, references and preview pages', async (t) => {
  const a = await boot(t, { api: new FakeApi({ user: TEACHER, draft: approvedDraft() }), hash: `#/rascunho/${DRAFT_ID}/seccao/objectivo` });
  await a.page('seccao');
  assert.equal(a.$('aside.eu-painel-ficha'), null);
  await a.go(`#/rascunho/${DRAFT_ID}/referencias`, 'referencias');
  assert.equal(a.$('aside.eu-painel-ficha'), null);
});

test('the side panel shows the text of area_outra for the area Outra, and the label of a new area', async (t) => {
  const row = (a) => Object.fromEntries([...a.$$('aside.eu-painel-ficha table.ficha-meta tr')].map((tr) => [tr.querySelector('th').textContent, tr.querySelector('td').textContent]));
  const open = async (area, extra = {}) => {
    const respostas = { ...ANSWERS, contexto: { ...ANSWERS.contexto, area, ...extra } };
    const a = await boot(t, { api: new FakeApi({ user: TEACHER, draft: makeDraft({ respostas }) }), hash: `#/rascunho/${DRAFT_ID}/passo/contexto` });
    await a.page('passo');
    return a;
  };
  const outra = await open('outra', { area_outra: 'Farmacologia' });
  assert.equal(row(outra)[S.meta.areas], 'Farmacologia');

  const cirurgia = await open('cirurgia');
  assert.equal(row(cirurgia)[S.meta.areas], 'Cirurgia e especialidades cirúrgicas');

  // A text left over from another area is not shown.
  const velho = await open('bioetica', { area_outra: 'Farmacologia' });
  assert.equal(row(velho)[S.meta.areas], 'Bioética');
});

// ---------------------------------------------------------------- the retry on status 0

test('a model request that fails with status 0 is sent once more after the delay; a PUT of an answer is not', async (t) => {
  const api = new FakeApi({ user: TEACHER, draft: approvedDraft() });
  let n = 0;
  api.on('POST', /\/gerar$/, (call) => {
    n += 1;
    if (n === 1) throw new TypeError('Failed to fetch');
    return api.route(call);
  });
  const a = await boot(t, { api, hash: `#/rascunho/${DRAFT_ID}/seccao/formato` });
  assert.equal(a.w.EUNOMIA_API.retry.delay, 1500, 'the default delay');
  a.w.EUNOMIA_API.retry.delay = 60;
  await a.page('seccao');
  a.$('#gerar').click();
  await a.waitFor(() => a.$('#seccao-texto'), 'the new text');
  const calls = gerarCalls(api);
  assert.equal(calls.length, 2);
  assert.ok(calls[1].at - calls[0].at >= 50, `waited ${calls[1].at - calls[0].at} ms`);
  assert.deepEqual(calls[1].body, calls[0].body, 'the same request');
  assert.equal(a.$('.eu-erro'), null);

  // A write that is not a model call: no retry, the error shows at once.
  api.on('PUT', /\/respostas\//, () => { throw new TypeError('Failed to fetch'); });
  await a.go(`#/rascunho/${DRAFT_ID}/passo/contexto`, 'passo');
  a.$('#guardar-passo').click();
  await a.waitFor(() => a.$('.eu-erro'), 'error');
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(api.calls.filter((c) => c.method === 'PUT').length, 1);
});

test('when the retry of gerar gets 409 rev, the draft is reloaded and the new text shown, with no error box', async (t) => {
  const api = new FakeApi({ user: TEACHER, draft: approvedDraft() });
  let n = 0;
  api.on('POST', /\/gerar$/, (call) => {
    n += 1;
    const res = api.route(call); // the server does the work...
    if (n === 1) throw new TypeError('Failed to fetch'); // ...and the answer is lost
    return res;
  });
  const a = await boot(t, { api, hash: `#/rascunho/${DRAFT_ID}/seccao/formato` });
  a.w.EUNOMIA_API.retry.delay = 10;
  await a.page('seccao');
  const gets = () => api.calls.filter((c) => c.method === 'GET' && c.path === `/rascunhos/${DRAFT_ID}`).length;
  const before = gets();
  a.$('#gerar').click();
  await a.waitFor(() => a.$('#seccao-texto'), 'the new text');
  assert.match(a.$('#seccao-texto').textContent, /Texto novo do modelo\./);
  assert.equal(a.$('.eu-erro'), null, 'no error box');
  assert.equal(gerarCalls(api).length, 2, 'no third request');
  assert.equal(gets(), before + 1, 'the draft was reloaded');
  assert.equal(a.$('#estado-pedido').textContent, S.seccao.recuperada);
  assert.equal(a.w.document.activeElement, a.$('#seccao-texto'));
});

test('two failures show the new rede message and a link to #/ajuda', async (t) => {
  assert.equal(S.erros.rede, 'O pedido não chegou ao servidor. O texto que escreveu continua nesta página. Tente de novo daqui a um momento. Se o erro se repetir, veja a Ajuda.');
  const api = new FakeApi({ user: TEACHER, draft: approvedDraft() });
  api.on('POST', /\/gerar$/, () => { throw new TypeError('Failed to fetch'); });
  const a = await boot(t, { api, hash: `#/rascunho/${DRAFT_ID}/seccao/formato` });
  a.w.EUNOMIA_API.retry.delay = 10;
  await a.page('seccao');
  a.$('#gerar').click();
  const box = await a.waitFor(() => a.$('.eu-erro'), 'error');
  assert.equal(gerarCalls(api).length, 2);
  assert.equal(box.querySelector('.eu-erro-texto').textContent, S.erros.rede);
  const help = box.querySelector('a[href="#/ajuda"]');
  assert.ok(help, 'link to the help');
  assert.equal(help.textContent, S.erros.verAjuda);
  assert.equal(a.$('#recarregar'), null);
});

test('the help FAQ rede entry quotes the opening of S.erros.rede', () => {
  const opening = S.erros.rede.split('.')[0];
  assert.equal(opening, 'O pedido não chegou ao servidor');
  const q = A.perguntas.lista.find((x) => x.id === 'rede');
  assert.ok(q, 'FAQ rede');
  assert.ok(q.pergunta.includes(`«${opening}»`) || q.resposta.includes(`«${opening}»`), 'the FAQ quotes the message');
});

test('a model error other than status 0 is not retried', async (t) => {
  const api = new FakeApi({ user: TEACHER, draft: approvedDraft() });
  api.on('POST', /\/gerar$/, () => json(502, { erro: 'O modelo não respondeu.' }));
  const a = await boot(t, { api, hash: `#/rascunho/${DRAFT_ID}/seccao/formato` });
  a.w.EUNOMIA_API.retry.delay = 10;
  await a.page('seccao');
  a.$('#gerar').click();
  await a.waitFor(() => a.$('.eu-erro'), 'error');
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(gerarCalls(api).length, 1);
});
