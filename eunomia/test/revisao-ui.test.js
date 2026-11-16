// Tests of the pilot pages (spec D6, D7, D10): "Foi útil?" on a model section, Submeter para
// revisão, the devolvida and aprovada notes, the admin review queue (#/revisao, #/revisao/:id) and
// the usage page (#/uso). Run: npm test --prefix eunomia/test
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, USO, DRAFT_ID, TEACHER, ADMIN, ANSWERS, approvedDraft, json, FakeApi, boot, lastCall } = require('./harness.js');

const w0 = {};
new Function('window', fs.readFileSync(path.join(ROOT, 'i18n-pt.js'), 'utf8'))(w0);
const S = w0.EUNOMIA_PT;
const PERSONAL = { erro: 'O texto pode ter dados pessoais de doentes ou estudantes. Retire-os, ou confirme que o texto não os tem.', motivo: 'dados_pessoais', achados: ['Possível NIF: 123456789'] };
const SECTIONS = ['objectivo', 'formato', 'prompt_base', 'papeis', 'correccao', 'armadilhas', 'plano_b'];
const COMPLETE = { erros: [], seccoes_em_falta: [], passos_em_falta: [], referencias_a_verificar: 0 };

// A draft with every section accepted (the model wrote them).
function completeDraft(over = {}) {
  const d = approvedDraft(over);
  for (const sec of SECTIONS) d.seccoes[sec] = { dados: { texto: `Texto de ${sec}.` }, estado: 'aceite', avisos: [], modelo: 'gpt-4o', origem: 'modelo' };
  return d;
}

function submitted(id, titulo, submetida) {
  return approvedDraft({ id, estado: 'submetida', submetida, respostas: { ...ANSWERS, plano: { titulo, subtitulo: 'Uma actividade.' } } });
}

// ---------------------------------------------------------------- Foi útil?

test('a model section shows Foi útil?; Não with a comment posts util false, the comment and the rev', async (t) => {
  const api = new FakeApi({ user: TEACHER, draft: approvedDraft() });
  const a = await boot(t, { api, hash: `#/rascunho/${DRAFT_ID}/seccao/objectivo` });
  await a.page('seccao');
  const legend = [...a.$$('fieldset legend')].find((l) => l.textContent === 'Foi útil?');
  assert.ok(legend, 'Foi útil? legend');
  assert.equal(S.seccao.foiUtil, 'Foi útil?');
  const box = legend.parentNode;
  assert.ok(box.querySelector('#util-sim') && box.querySelector('#util-nao'));
  a.$('#util-nao').click();
  assert.equal(a.$('#util-nao').getAttribute('aria-pressed'), 'true');
  assert.equal(a.$('#util-sim').getAttribute('aria-pressed'), 'false');
  a.set('#opiniao-comentario', '  Faltou um exemplo clínico.  ');
  a.$('#enviar-opiniao').click();
  const call = await a.waitFor(() => lastCall(api, 'POST', /\/seccoes\/objectivo\/opiniao$/), 'opinion POST');
  assert.deepEqual(call.body, { rev: 3, util: false, comentario: 'Faltou um exemplo clínico.' });
  // The section now has the opinion: it says so and allows a change.
  await a.waitFor(() => a.$('#opiniao-dada'), 'opinion shown');
  assert.equal(a.$('#opiniao-dada').textContent, S.seccao.opiniaoDada(false));
  assert.equal(a.w.document.activeElement, a.$('#opiniao-dada'));
  assert.equal(a.$('#util-sim'), null);
  a.$('#mudar-opiniao').click();
  assert.equal(a.$('#util-nao').getAttribute('aria-pressed'), 'true');
  assert.equal(a.$('#opiniao-comentario').value, 'Faltou um exemplo clínico.');
  a.$('#util-sim').click();
  a.$('#enviar-opiniao').click();
  await a.waitFor(() => api.calls.filter((c) => /\/opiniao$/.test(c.path)).length === 2, 'second opinion');
  assert.equal(lastCall(api, 'POST', /\/opiniao$/).body.util, true);
  assert.equal(lastCall(api, 'POST', /\/opiniao$/).body.rev, 4);
  // Without a choice, nothing is sent.
  const b = await boot(t, { api: new FakeApi({ user: TEACHER, draft: approvedDraft() }), hash: `#/rascunho/${DRAFT_ID}/seccao/objectivo` });
  await b.page('seccao');
  b.$('#enviar-opiniao').click();
  await b.waitFor(() => b.$('.eu-erro'), 'error');
  assert.match(b.$('.eu-erro').textContent, new RegExp(S.seccao.escolherUtil));
  assert.equal(lastCall(b.api, 'POST', /\/opiniao$/), undefined);
});

test('a teacher-written section has no Foi útil?; the comment field has maxlength 500', async (t) => {
  const d = approvedDraft();
  d.seccoes.formato = { dados: { introducao: 'Uma aula.' }, estado: 'aceite', avisos: [], origem: 'docente', modelo: null };
  const a = await boot(t, { api: new FakeApi({ user: TEACHER, draft: d }), hash: `#/rascunho/${DRAFT_ID}/seccao/objectivo` });
  await a.page('seccao');
  assert.equal(a.$('#opiniao-comentario').getAttribute('maxlength'), '500');
  assert.ok(a.$('label[for="opiniao-comentario"]'));
  await a.go(`#/rascunho/${DRAFT_ID}/seccao/formato`, 'seccao');
  assert.equal(a.$('#util-sim'), null);
  assert.ok(!a.text().includes(S.seccao.foiUtil));
  // An empty section has none either.
  await a.go(`#/rascunho/${DRAFT_ID}/seccao/papeis`, 'seccao');
  assert.equal(a.$('#util-sim'), null);
});

test('personal data in the comment asks for the confirmation and resends with the flag', async (t) => {
  const api = new FakeApi({ user: TEACHER, draft: approvedDraft() });
  api.on('POST', /\/opiniao$/, (call) => (call.body.confirmo_sem_dados_pessoais ? api.route(call) : json(422, PERSONAL)));
  const a = await boot(t, { api, hash: `#/rascunho/${DRAFT_ID}/seccao/objectivo` });
  await a.page('seccao');
  a.$('#util-sim').click();
  a.set('#opiniao-comentario', 'O doente com NIF 123456789 é fictício.');
  a.$('#enviar-opiniao').click();
  await a.waitFor(() => a.$('#confirmo-dados'), 'confirmation');
  assert.match(a.$('.eu-erro').textContent, /NIF/);
  a.set('#confirmo-dados', true);
  a.$('#guardar-confirmado').click();
  await a.waitFor(() => a.$('#opiniao-dada'), 'saved');
  const calls = api.calls.filter((c) => /\/opiniao$/.test(c.path));
  assert.equal(calls.length, 2);
  assert.equal(calls[0].body.confirmo_sem_dados_pessoais, undefined);
  assert.deepEqual(calls[1].body, { rev: 3, util: true, comentario: 'O doente com NIF 123456789 é fictício.', confirmo_sem_dados_pessoais: true });
});

// ---------------------------------------------------------------- submission

test('the preview of a complete draft offers Submeter para revisão; it posts the rev and the page then shows the submitted note and no edit buttons', async (t) => {
  // An incomplete draft (a section to accept) has no submit button.
  const inc = await boot(t, { api: new FakeApi({ user: TEACHER, draft: approvedDraft() }), hash: `#/rascunho/${DRAFT_ID}/previsao` });
  await inc.page('previsao');
  assert.equal(inc.$('#submeter'), null);

  const api = new FakeApi({ user: TEACHER, draft: completeDraft() });
  api.on('GET', /\/verificacao-final$/, () => json(200, COMPLETE));
  const a = await boot(t, { api, hash: `#/rascunho/${DRAFT_ID}/previsao` });
  await a.page('previsao');
  const btn = await a.waitFor(() => a.$('#submeter'), 'submit button');
  assert.equal(btn.textContent, 'Submeter para revisão');
  btn.click();
  const call = await a.waitFor(() => lastCall(api, 'POST', /\/submeter$/), 'submit POST');
  assert.deepEqual(call.body, { rev: 3 });
  await a.waitFor(() => a.text().includes(S.rascunho.submetida), 'submitted note');
  assert.equal(a.$('#submeter'), null);
  assert.equal(a.$('.eu-conteudo').firstElementChild.textContent, S.rascunho.submetida);
  assert.match(a.$('#estado-pedido').textContent, new RegExp(S.previsao.submetidaOk));
  // Read only: no edit buttons on a section, a step, the plan or the references.
  await a.go(`#/rascunho/${DRAFT_ID}/seccao/objectivo`, 'seccao');
  for (const id of ['aceitar', 'editar', 'nova-versao', 'gerar', 'repor', 'util-sim', 'enviar-opiniao']) assert.equal(a.$(`#${id}`), null, id);
  assert.ok(a.$('#seccao-texto'), 'the text stays readable');
  await a.go(`#/rascunho/${DRAFT_ID}/passo/contexto`, 'passo');
  assert.equal(a.$('#guardar-passo'), null);
  assert.ok(a.$$('#passo-form input').every((i) => i.disabled));
  await a.go(`#/rascunho/${DRAFT_ID}/plano`, 'plano');
  assert.equal(a.$('#guardar-plano'), null);
  await a.go(`#/rascunho/${DRAFT_ID}/referencias`, 'referencias');
  assert.equal(a.$('#guardar-referencias'), null);
  assert.equal(a.$('#ref-adicionar'), null);
});

test('a devolvida draft shows the review comment at the top of the step, section and preview pages', async (t) => {
  const revisao = { decisao: 'devolvida', comentario: 'Reveja o plano B: falta o tempo de cada parte.', data: '2026-11-16T09:00:00.000Z', revisor: 'Tiago Jacinto' };
  const api = new FakeApi({ user: TEACHER, draft: approvedDraft({ estado: 'devolvida', revisao }) });
  const a = await boot(t, { api, hash: `#/rascunho/${DRAFT_ID}/passo/contexto` });
  const check = (where) => {
    const first = a.$('.eu-conteudo').firstElementChild;
    assert.ok(first.classList.contains('review-note'), `${where}: a review note first`);
    assert.ok(first.textContent.includes(S.rascunho.devolvida), where);
    assert.ok(first.textContent.includes(revisao.comentario), where);
    assert.ok(!a.text().includes(S.rascunho.bloqueado), `${where}: editable`);
  };
  await a.page('passo');
  check('step');
  assert.ok(a.$('#guardar-passo'), 'editable');
  await a.go(`#/rascunho/${DRAFT_ID}/seccao/objectivo`, 'seccao');
  check('section');
  assert.ok(a.$('#aceitar'));
  await a.go(`#/rascunho/${DRAFT_ID}/previsao`, 'previsao');
  check('preview');

  // aprovada: its own note in place of the submitted one.
  const b = await boot(t, { api: new FakeApi({ user: TEACHER, draft: approvedDraft({ estado: 'aprovada', revisao: { decisao: 'aprovada', data: revisao.data, revisor: 'Tiago Jacinto' } }) }), hash: `#/rascunho/${DRAFT_ID}/plano` });
  await b.page('plano');
  assert.equal(b.$('.eu-conteudo').firstElementChild.textContent, S.rascunho.aprovada);
  assert.ok(!b.text().includes(S.rascunho.bloqueado));
  assert.ok(!b.text().includes(S.rascunho.submetida));
});

// ---------------------------------------------------------------- admin: home, queue, usage

test('the admin home shows 2 actividades à espera de revisão with a link to #/revisao; a teacher home makes no /revisao call', async (t) => {
  assert.equal(S.inicio.aRever(1), '1 actividade à espera de revisão');
  assert.equal(S.inicio.aRever(2), '2 actividades à espera de revisão');
  const api = new FakeApi({ user: ADMIN });
  api.drafts.set('aaaaaaaaaaa1', submitted('aaaaaaaaaaa1', 'Doente virtual', '2026-11-15T09:00:00.000Z'));
  api.drafts.set('aaaaaaaaaaa2', submitted('aaaaaaaaaaa2', 'Debate', '2026-11-14T09:00:00.000Z'));
  const a = await boot(t, { api, hash: '#/inicio' });
  await a.page('inicio');
  const n = await a.waitFor(() => a.$('#a-rever'), 'queue count');
  assert.equal(n.textContent, '2 actividades à espera de revisão');
  assert.equal(n.getAttribute('href'), '#/revisao');
  assert.ok(a.$$('.eu-ligacoes a[href="#/revisao"]').length === 1);
  assert.ok(a.$('.eu-ligacoes a[href="#/uso"]'));

  const tapi = new FakeApi({ user: TEACHER });
  const b = await boot(t, { api: tapi, hash: '#/inicio' });
  await b.page('inicio');
  assert.equal(b.$('#a-rever'), null);
  assert.equal(b.$('a[href="#/uso"]'), null);
  assert.equal(tapi.calls.filter((c) => /revisao|uso/.test(c.path)).length, 0);
});

test('#/revisao lists; #/revisao/:id shows the ficha preview; Aprovar posts the rev; Devolver with an empty comment does not post, with a comment it posts it', async (t) => {
  const api = new FakeApi({ user: ADMIN });
  api.drafts.set('aaaaaaaaaaa1', submitted('aaaaaaaaaaa1', 'Doente virtual', '2026-11-15T09:00:00.000Z'));
  api.drafts.set('aaaaaaaaaaa2', submitted('aaaaaaaaaaa2', 'Debate', '2026-11-14T09:00:00.000Z'));
  const a = await boot(t, { api, hash: '#/revisao' });
  await a.page('revisao');
  const items = a.$$('#lista-revisao li');
  assert.equal(items.length, 2);
  // The oldest first, with title, author, date and a link.
  assert.ok(items[0].querySelector('a[href="#/revisao/aaaaaaaaaaa2"]'));
  assert.equal(items[0].querySelector('a').textContent, 'Debate');
  assert.ok(items[0].textContent.includes('Ana Silva'));
  assert.ok(items[0].textContent.includes(S.comum.data('2026-11-14T09:00:00.000Z')));

  await a.go('#/revisao/aaaaaaaaaaa1', 'revisao-item');
  assert.equal(a.$('#main h2').textContent, 'Doente virtual');
  const frame = await a.waitFor(() => a.$('#previsao-ficha'), 'preview frame');
  assert.equal(frame.getAttribute('sandbox'), '');
  assert.ok(lastCall(api, 'GET', /\/rascunhos\/aaaaaaaaaaa1\/exportar$/));
  a.$('#aprovar').click();
  const ok = await a.waitFor(() => lastCall(api, 'POST', /\/revisao\/aaaaaaaaaaa1\/aprovar$/), 'approve');
  assert.deepEqual(ok.body, { rev: 3 });
  await a.waitFor(() => a.w.location.hash === '#/revisao' && a.$('#main').dataset.pagina === 'revisao', 'back to the queue');
  await a.waitFor(() => a.$$('#lista-revisao li').length === 1, 'one left');
  assert.equal(a.$('#estado-pedido').textContent, S.revisao.aprovadaOk('Doente virtual'));

  await a.go('#/revisao/aaaaaaaaaaa2', 'revisao-item');
  const area = a.$('#devolver-comentario');
  assert.equal(area.getAttribute('maxlength'), '2000');
  assert.ok(area.required);
  a.$('#devolver').click();
  await a.waitFor(() => a.$('.eu-erro'), 'empty comment error');
  assert.match(a.$('.eu-erro').textContent, new RegExp(S.revisao.semComentario));
  assert.equal(lastCall(api, 'POST', /\/devolver$/), undefined);
  a.set('#devolver-comentario', 'Falta o plano B.');
  a.$('#devolver').click();
  const back = await a.waitFor(() => lastCall(api, 'POST', /\/revisao\/aaaaaaaaaaa2\/devolver$/), 'return');
  assert.deepEqual(back.body, { rev: 3, comentario: 'Falta o plano B.' });
  await a.waitFor(() => a.w.location.hash === '#/revisao' && a.$('#main').dataset.pagina === 'revisao', 'back to the queue');
  await a.waitFor(() => a.text().includes(S.revisao.nenhuma), 'empty queue');
  assert.equal(a.$('#estado-pedido').textContent, S.revisao.devolvidaOk('Debate'));
  assert.equal(api.drafts.get('aaaaaaaaaaa2').revisao.comentario, 'Falta o plano B.');

  // A draft that no longer waits: the preview, but no decision buttons.
  await a.go('#/revisao/aaaaaaaaaaa2', 'revisao-item');
  assert.ok(a.text().includes(S.revisao.naoEspera));
  assert.equal(a.$('#aprovar'), null);
  assert.equal(a.$('#devolver'), null);
});

test('#/uso shows a row per user with drafts by state, calls today and in 30 days and the limit, and the section counts and comments', async (t) => {
  const api = new FakeApi({ user: ADMIN });
  const a = await boot(t, { api, hash: '#/uso' });
  await a.page('uso');
  const rows = await a.waitFor(() => a.$$('#uso-utilizadores tbody tr').length && a.$$('#uso-utilizadores tbody tr'), 'user rows');
  assert.equal(rows.length, USO.utilizadores.length);
  const cells = (tr) => [...tr.querySelectorAll('th, td')].map((c) => c.textContent);
  const ana = cells(rows[0]);
  assert.equal(ana[0], 'Ana Silva');
  assert.match(ana[1], /rascunho: 2/);
  assert.match(ana[1], /submetida: 1/);
  assert.equal(ana[2], '3');
  assert.equal(ana[3], '41');
  assert.equal(ana[4], '50');
  const rui = cells(rows[1]);
  assert.match(rui[0], /Rui Costa/);
  assert.ok(rui[0].includes(S.uso.revogado));
  assert.equal(rui[1], S.uso.semRascunhos);
  assert.ok(a.$$('#uso-utilizadores thead th').length === 5);

  const secs = a.$$('#uso-seccoes tbody tr');
  assert.equal(secs.length, 7);
  const obj = cells(secs[0]);
  assert.equal(obj[0], S.seccao.titulos.objectivo);
  assert.equal(obj[1], '4');
  assert.equal(obj[2], '1');
  assert.ok(secs[0].querySelector('ul li').textContent.includes('O verbo ficou vago.'));
  assert.ok(secs[0].querySelector('ul li').textContent.includes(S.uso.util(false)));
  assert.ok(secs[3].textContent.includes('Poupou-me tempo.'));
  assert.ok(secs[1].textContent.includes(S.uso.semComentarios));
  assert.deepEqual(api.calls.map((c) => `${c.method} ${c.path}`), ['GET /me', 'GET /uso']);
});

test('a teacher on #/revisao or #/uso goes to #/inicio', async (t) => {
  for (const hash of ['#/revisao', '#/revisao/aaaaaaaaaaa1', '#/uso']) {
    const api = new FakeApi({ user: TEACHER });
    const a = await boot(t, { api, hash });
    await a.page('inicio');
    assert.equal(a.w.location.hash, '#/inicio', hash);
    assert.equal(api.calls.filter((c) => /revisao|uso/.test(c.path)).length, 0, hash);
  }
});
