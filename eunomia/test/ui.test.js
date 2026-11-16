// Headless tests of the Eunomia front end: the real index.html and scripts in jsdom, with a fake
// API server behind a mocked fetch. Run: npm test --prefix eunomia/test
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const BASE = '/fmup-ia/eunomia/api';
const SCRIPTS = ['i18n-pt.js', 'api.js', 'app.js'];
const INTERVIEW = JSON.parse(fs.readFileSync(path.join(ROOT, 'interview.json'), 'utf8'));
const PATTERNS = JSON.parse(fs.readFileSync(path.join(ROOT, 'patterns.json'), 'utf8')).padroes;
const REFS = JSON.parse(fs.readFileSync(path.join(ROOT, 'references.json'), 'utf8')).referencias;
const DRAFT_ID = 'a1b2c3d4e5f6';
const TEACHER = { id: 'u1', nome: 'Ana Silva', perfil: 'teacher' };
const ADMIN = { id: 'u9', nome: 'Tiago Jacinto', perfil: 'admin' };

// ---------------------------------------------------------------- fixtures

const ANSWERS = {
  contexto: { uc: 'Introdução à Medicina', programa: 'Mestrado Integrado em Medicina, 1.º ano', area: 'cuidados_primarios', nivel: 'uc_undergrad', estudantes: 40, modalidade: 'em_aula', duracao_min: 45 },
  objectivo: { texto: 'Conduzir uma anamnese estruturada.', competencia_protegida: 'Fazer as perguntas sem ajuda.', competencia: 'anamnese' },
  evidencia: { descricao: 'Grelha de observação preenchida por um colega.', avaliacao: 'formativa' },
  papel_ia: { papel: 'contraparte' },
  regime: { regime: 'permitido' },
  padrao: { padrao: 'interlocutor_restrito' },
  materiais: {},
  plano: { titulo: 'Doente virtual', subtitulo: 'Recolha estruturada de informação clínica.' },
};

function makeDraft(over = {}) {
  return {
    id: DRAFT_ID, autor: { id: 'u1', nome: 'Ana Silva' }, modo: 'criar', rev: 3, estado: 'rascunho', versao: 1,
    criado: '2026-11-10T10:00:00.000Z', actualizado: '2026-11-14T10:00:00.000Z', aberto: '2026-11-14T10:00:00.000Z',
    respostas: {}, plano_aprovado: false, seccoes: {}, referencias: [], threads: {}, ...over,
  };
}

function approvedDraft(over = {}) {
  return makeDraft({
    respostas: ANSWERS,
    plano_aprovado: true,
    seccoes: {
      objectivo: {
        dados: { texto: 'No fim, o estudante conduz uma anamnese.', competencia_protegida: 'A competência protegida é perguntar sem ajuda.' },
        estado: 'gerada', modelo: 'gpt-4o', origem: 'modelo',
        avisos: [{ regra: 'lingua', texto: 'Use "estudante", não "aluno".', trecho: 'aluno' }],
      },
      formato: { estado: 'vazia', avisos: [], modelo: null },
      prompt_base: { estado: 'vazia', avisos: [], modelo: null },
      papeis: { estado: 'vazia', avisos: [], modelo: null },
      correccao: { estado: 'vazia', avisos: [], modelo: null },
      armadilhas: { estado: 'vazia', avisos: [], modelo: null },
      plano_b: { estado: 'vazia', avisos: [], modelo: null },
    },
    ...over,
  });
}

function nextStep(d) {
  for (const p of INTERVIEW.passos) {
    const c = p.condicao;
    if (c && !(d.respostas[c.passo] && d.respostas[c.passo][c.campo] === c.igual)) continue;
    if (p.id === 'plano') return d.plano_aprovado ? null : 'plano';
    if (d.respostas[p.id] === undefined) return p.id;
  }
  return null;
}

// ---------------------------------------------------------------- the fake API

function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

class FakeApi {
  constructor({ user = null, draft = null, codes = [] } = {}) {
    this.user = user;
    this.drafts = new Map();
    if (draft) this.drafts.set(draft.id, draft);
    this.codes = codes;
    this.calls = [];
    this.overrides = [];
  }

  // Replaces one route: fn(call) returns a Response or a Promise of one.
  on(method, pattern, fn) {
    this.overrides.unshift({ method, pattern, fn });
  }

  view(d, extra = {}) {
    return { rascunho: d, proximo_passo: nextStep(d), plano: [{ rotulo: 'Unidade curricular', valor: (d.respostas.contexto || {}).uc || '' }], ...extra };
  }

  save(d) {
    d.rev += 1;
    return d;
  }

  async fetch(url, init = {}) {
    const method = (init.method || 'GET').toUpperCase();
    const u = new URL(url, 'https://example.test/fmup-ia/eunomia/');
    if (!u.pathname.startsWith(BASE)) {
      const file = path.join(ROOT, path.basename(u.pathname));
      if (!fs.existsSync(file)) return new Response('', { status: 404 });
      return new Response(fs.readFileSync(file, 'utf8'), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    const local = u.pathname.slice(BASE.length);
    const headers = new Headers(init.headers || {});
    const body = init.body ? JSON.parse(init.body) : undefined;
    const call = { method, path: local, query: u.searchParams, headers, body };
    this.calls.push(call);
    for (const o of this.overrides) if (o.method === method && o.pattern.test(local)) return o.fn(call);
    return this.route(call);
  }

  route({ method, path: p, query, body }) {
    const anon = () => json(401, { erro: 'Sessão inválida ou expirada. Inicie sessão.' });
    if (method === 'POST' && p === '/login') {
      if (body.codigo === 'ABCD-EFGH') {
        this.user = this.user || TEACHER;
        return json(200, this.user);
      }
      return json(401, { erro: 'Código inválido.' });
    }
    if (method === 'POST' && p === '/logout') {
      this.user = null;
      return json(200, { ok: true });
    }
    if (!this.user) return anon();
    if (method === 'GET' && p === '/me') return json(200, this.user);
    if (p.startsWith('/codigos') && this.user.perfil !== 'admin') return json(403, { erro: 'Sem permissão para esta operação.' });
    if (method === 'GET' && p === '/codigos') return json(200, { codigos: this.codes });
    if (method === 'POST' && p === '/codigos') {
      const c = { id: 'c' + (this.codes.length + 1), nome: body.nome, perfil: body.admin ? 'admin' : 'teacher', criado: '2026-11-15T09:00:00.000Z', revogado: null };
      this.codes.push(c);
      return json(201, { id: c.id, codigo: 'QWER-TYUI-OPAS' });
    }
    let m = /^\/codigos\/([\w-]+)$/.exec(p);
    if (method === 'DELETE' && m) {
      const c = this.codes.find((x) => x.id === m[1]);
      c.revogado = '2026-11-15T10:00:00.000Z';
      return json(200, { ok: true });
    }
    if (method === 'GET' && p === '/rascunhos') {
      return json(200, { rascunhos: [...this.drafts.values()].map((d) => ({ id: d.id, titulo: (d.respostas.contexto || {}).uc || null, modo: d.modo, estado: d.estado, rev: d.rev, actualizado: d.actualizado, proximo_passo: nextStep(d) })) });
    }
    if (method === 'POST' && p === '/rascunhos') {
      const d = makeDraft({ id: 'f0f0f0f0f0f0', rev: 1 });
      this.drafts.set(d.id, d);
      return json(201, this.view(d));
    }
    if (method === 'GET' && p === '/padroes') {
      return json(200, { padroes: query.get('rascunho') ? PATTERNS.filter((x) => x.papel_ia === 'contraparte').slice(0, 2) : PATTERNS });
    }
    m = /^\/rascunhos\/([0-9a-f]{12})(\/.*)?$/.exec(p);
    if (!m) return json(404, { erro: 'Não encontrado.' });
    const d = this.drafts.get(m[1]);
    if (!d) return json(404, { erro: 'Rascunho não encontrado.' });
    const rest = m[2] || '';
    const write = () => {
      if (body.rev !== d.rev) return json(409, { erro: 'O rascunho foi alterado noutra janela. Recarregue a página.', motivo: 'rev' });
      return null;
    };
    if (method === 'GET' && rest === '') return json(200, this.view(d));
    m = /^\/respostas\/(\w+)$/.exec(rest);
    if (method === 'PUT' && m) {
      const bad = write();
      if (bad) return bad;
      d.respostas = { ...d.respostas, [m[1]]: body.valor };
      return json(200, this.view(this.save(d), { avisos: [] }));
    }
    if (method === 'POST' && rest === '/plano/aprovar') {
      const bad = write();
      if (bad) return bad;
      d.plano_aprovado = true;
      return json(200, this.view(this.save(d)));
    }
    if (method === 'POST' && rest === '/objectivo/sugerir') {
      return json(200, { sugestoes: [{ texto: 'Conduzir uma anamnese completa em 10 minutos.', ok: true, verbo: 'conduzir' }], modelo: 'gpt-4o' });
    }
    if (method === 'POST' && rest === '/padroes/explicar') {
      return json(200, { padroes: PATTERNS.filter((x) => x.papel_ia === 'contraparte').slice(0, 2).map((x) => ({ ...x, explicacao: `Serve porque ${x.nome}.` })), modelo: 'gpt-4o' });
    }
    m = /^\/seccoes\/(\w+)(\/gerar|\/aceitar)?$/.exec(rest);
    if (m) {
      const bad = write();
      if (bad) return bad;
      const sec = m[1];
      if (method === 'POST' && m[2] === '/gerar') {
        d.seccoes[sec] = { dados: { texto: 'Texto novo do modelo.', competencia_protegida: 'Perguntar.' }, estado: 'gerada', avisos: [], modelo: 'gpt-4o', origem: 'modelo' };
      } else if (method === 'POST' && m[2] === '/aceitar') {
        d.seccoes[sec].estado = 'aceite';
      } else if (method === 'PUT') {
        d.seccoes[sec] = { dados: body.dados, estado: 'aceite', avisos: [], modelo: null, origem: 'docente' };
      }
      return json(200, this.view(this.save(d)));
    }
    if (method === 'PUT' && rest === '/referencias') {
      const bad = write();
      if (bad) return bad;
      d.referencias = body.referencias.map((r) => (r.id ? { id: r.id, texto: REFS.find((x) => x.id === r.id).texto, origem: 'curada' } : { texto: r.texto, origem: 'docente' }));
      return json(200, this.view(this.save(d)));
    }
    if (method === 'GET' && rest === '/verificacao-final') {
      return json(200, { erros: [], seccoes_em_falta: ['formato'], referencias_a_verificar: 0 });
    }
    if (method === 'GET' && rest === '/exportar') {
      return new Response('---\ntitle: x\n---\n', { status: 200, headers: { 'Content-Type': 'text/plain', 'Content-Disposition': 'attachment; filename="doente-virtual.qmd"', 'X-Eunomia-Avisos': '0' } });
    }
    return json(404, { erro: 'Não encontrado.' });
  }
}

// ---------------------------------------------------------------- the harness

async function boot(t, { api = new FakeApi(), hash = '', storage = 'ok', stored = null } = {}) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push(e.message));
  const dom = new JSDOM(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), {
    runScripts: 'outside-only',
    url: `https://example.test/fmup-ia/eunomia/${hash}`,
    virtualConsole: vc,
  });
  const w = dom.window;
  t.after(() => {
    w.close();
    assert.deepEqual(errors, [], 'no unhandled application errors');
  });

  // Every element that gets a click handler, for the accessibility test.
  const clickTargets = new Set();
  const add = w.EventTarget.prototype.addEventListener;
  w.EventTarget.prototype.addEventListener = function (type, ...rest) {
    if (type === 'click') clickTargets.add(this);
    return add.call(this, type, ...rest);
  };

  if (storage === 'blocked') {
    Object.defineProperty(w, 'localStorage', { get() { throw new w.DOMException('blocked', 'SecurityError'); } });
  } else if (stored) {
    w.localStorage.setItem('eunomia-chave', JSON.stringify(stored));
  }
  w.fetch = (url, init) => api.fetch(url, init);
  w.scrollTo = () => {};
  const downloads = [];
  w.URL.createObjectURL = () => 'blob:https://example.test/1';
  w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = function () {
    downloads.push({ href: this.href, download: this.download });
  };
  for (const f of SCRIPTS) w.eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));

  const $ = (q) => w.document.querySelector(q);
  const $$ = (q) => [...w.document.querySelectorAll(q)];
  const waitFor = async (fn, what = 'condition', ms = 1500) => {
    const end = Date.now() + ms;
    for (;;) {
      const v = fn();
      if (v) return v;
      if (Date.now() > end) throw new Error(`timeout waiting for ${what}; page=${$('#main').dataset.pagina}; text=${$('#main').textContent.slice(0, 300)}`);
      await new Promise((r) => setTimeout(r, 5));
    }
  };
  const page = (name) => waitFor(() => $('#main').dataset.pagina === name, `page ${name}`);
  const go = async (h, name) => {
    $('#main').dataset.pagina = 'teste-a-navegar'; // so that the old page cannot pass for the new one
    w.location.hash = h;
    if (name) await page(name);
  };
  const set = (q, value) => {
    const el = $(q);
    assert.ok(el, q);
    if (el.type === 'checkbox' || el.type === 'radio') {
      el.checked = value;
      el.dispatchEvent(new w.Event('change', { bubbles: true }));
    } else {
      el.value = value;
      el.dispatchEvent(new w.Event('input', { bubbles: true }));
    }
  };
  const text = () => $('#main').textContent;
  return { w, $, $$, api, page, go, set, text, waitFor, clickTargets, downloads };
}

const lastCall = (api, method, re) => [...api.calls].reverse().find((c) => c.method === method && re.test(c.path));

// ---------------------------------------------------------------- login and session

test('the login page shows the data notice of spec 6.12', async (t) => {
  const a = await boot(t);
  await a.page('entrar');
  const notice = a.$('#aviso-dados');
  assert.ok(notice, 'data notice');
  const s = notice.textContent;
  assert.match(s, /IAedu/);
  assert.match(s, /FCT\/FCCN/);
  assert.match(s, /12 meses/);
  assert.match(s, /doentes/);
  assert.match(s, /guarda/i);
  // Review 12+14, item 1: the log rule does not depend on the key mode.
  assert.match(s, /Os registos do servidor nunca guardam o texto dos rascunhos\./);
  assert.match(s, /Se usar a sua própria chave IAedu, o servidor não a guarda\./);
});

test('without a session the app shows the login form; a valid code moves to #/inicio with the name', async (t) => {
  const a = await boot(t, { hash: '#/inicio' });
  await a.page('entrar');
  assert.equal(a.w.location.hash, '#/entrar');
  assert.ok(a.$('#login-form'));
  a.set('#codigo', 'errado');
  a.$('#login-form button[type=submit]').click();
  await a.waitFor(() => a.$('.eu-erro'), 'login error');
  assert.match(a.$('.eu-erro').textContent, /Código inválido/);
  a.set('#codigo', 'ABCD-EFGH');
  a.$('#login-form button[type=submit]').click();
  await a.page('inicio');
  assert.equal(a.w.location.hash, '#/inicio');
  assert.match(a.text(), /Ana Silva/);
  assert.match(a.$('#user-name').textContent, /Ana Silva/);
});

test('logout returns to the login page', async (t) => {
  const a = await boot(t, { api: new FakeApi({ user: TEACHER }), hash: '#/inicio' });
  await a.page('inicio');
  a.$('#logout-btn').click();
  await a.page('entrar');
  assert.ok(lastCall(a.api, 'POST', /^\/logout$/));
});

test('with localStorage throwing SecurityError the app still boots', async (t) => {
  const a = await boot(t, { storage: 'blocked' });
  await a.page('entrar');
  assert.ok(a.$('#login-form'));
});

// ---------------------------------------------------------------- home

test('home lists the drafts and starts a new one at the first step', async (t) => {
  const api = new FakeApi({ user: TEACHER, draft: makeDraft({ respostas: { contexto: ANSWERS.contexto } }) });
  const a = await boot(t, { api, hash: '#/inicio' });
  await a.page('inicio');
  assert.match(a.$('#lista-rascunhos').textContent, /Introdução à Medicina/);
  assert.ok(a.$('a[href="#/definicoes"]'));
  assert.equal(a.$('a[href="#/codigos"]'), null, 'no codes link for a teacher');
  a.$('#novo-rascunho').click();
  await a.page('passo');
  assert.equal(a.w.location.hash, '#/rascunho/f0f0f0f0f0f0/passo/contexto');
});

// ---------------------------------------------------------------- interview

test('an interview step shows its titulo, its fields and the porque box with its link', async (t) => {
  const api = new FakeApi({ user: TEACHER, draft: makeDraft() });
  const a = await boot(t, { api, hash: `#/rascunho/${DRAFT_ID}/passo/contexto` });
  await a.page('passo');
  const step = INTERVIEW.passos[0];
  assert.equal(a.$('.step-title').textContent, step.titulo);
  for (const campo of step.campos) {
    const el = a.$(`#campo-${campo.id}`);
    assert.ok(el, `field ${campo.id}`);
    assert.ok(a.text().includes(campo.rotulo), `label ${campo.rotulo}`);
  }
  const porque = a.$('.eu-porque');
  assert.ok(porque.textContent.includes(step.porque));
  const link = porque.querySelector('a');
  assert.equal(link.getAttribute('href'), step.ligacao.url);
  assert.equal(link.textContent.trim().startsWith(step.ligacao.rotulo), true);
  assert.ok(a.$('progress'), 'progress bar');
});

test('saving a step sends the answers with the rev and moves to the next step', async (t) => {
  const api = new FakeApi({ user: TEACHER, draft: makeDraft() });
  const a = await boot(t, { api, hash: `#/rascunho/${DRAFT_ID}/passo/contexto` });
  await a.page('passo');
  a.set('#campo-uc', 'Introdução à Medicina');
  a.set('#campo-programa', 'MIM, 1.º ano');
  a.set('input[name="area"][value="bioetica"]', true);
  a.set('input[name="nivel"][value="uc_master"]', true);
  a.set('#campo-estudantes', '40');
  a.set('input[name="modalidade"][value="em_aula"]', true);
  a.set('#campo-duracao_min', '45');
  a.$('#guardar-passo').click();
  await a.waitFor(() => a.w.location.hash.endsWith('/passo/objectivo'), 'next step');
  await a.page('passo');
  const put = lastCall(api, 'PUT', /\/respostas\/contexto$/);
  assert.equal(put.body.rev, 3);
  assert.deepEqual(put.body.valor, { uc: 'Introdução à Medicina', programa: 'MIM, 1.º ano', area: 'bioetica', nivel: 'uc_master', estudantes: 40, modalidade: 'em_aula', duracao_min: 45 });
});

test('a step error from the server shows the list of errors', async (t) => {
  const api = new FakeApi({ user: TEACHER, draft: makeDraft() });
  api.on('PUT', /\/respostas\/contexto$/, () => json(400, { erro: 'A resposta tem erros.', erros: ['Falta o campo "Unidade curricular".'] }));
  const a = await boot(t, { api, hash: `#/rascunho/${DRAFT_ID}/passo/contexto` });
  await a.page('passo');
  a.$('#guardar-passo').click();
  await a.waitFor(() => a.$('.eu-erro'), 'error box');
  assert.match(a.$('.eu-erro').textContent, /A resposta tem erros/);
  assert.match(a.$('.eu-erro').textContent, /Falta o campo "Unidade curricular"/);
});

test('the conditions field of the regime step appears only for the conditioned regime', async (t) => {
  const api = new FakeApi({ user: TEACHER, draft: makeDraft({ respostas: { contexto: ANSWERS.contexto, objectivo: ANSWERS.objectivo, evidencia: ANSWERS.evidencia, papel_ia: ANSWERS.papel_ia } }) });
  const a = await boot(t, { api, hash: `#/rascunho/${DRAFT_ID}/passo/regime` });
  await a.page('passo');
  assert.match(a.text(), /verde: permitido/);
  assert.equal(a.$('#campo-condicoes').closest('.field-row').hidden, true);
  a.set('input[name="regime"][value="condicionado"]', true);
  assert.equal(a.$('#campo-condicoes').closest('.field-row').hidden, false);
});

test('the outcome step asks the model for sharper versions with a busy state', async (t) => {
  const api = new FakeApi({ user: TEACHER, draft: makeDraft({ respostas: { contexto: ANSWERS.contexto } }) });
  let release;
  api.on('POST', /\/objectivo\/sugerir$/, () => new Promise((r) => { release = () => r(json(200, { sugestoes: [{ texto: 'Conduzir uma anamnese completa.', ok: true, verbo: 'conduzir' }], modelo: 'gpt-4o' })); }));
  const a = await boot(t, { api, hash: `#/rascunho/${DRAFT_ID}/passo/objectivo` });
  await a.page('passo');
  a.set('#campo-texto', 'Saber fazer uma anamnese.');
  const btn = a.$('#sugerir-objectivo');
  btn.click();
  await a.waitFor(() => release, 'request sent');
  assert.equal(btn.disabled, true);
  assert.equal(btn.getAttribute('aria-busy'), 'true');
  release();
  await a.waitFor(() => a.$('.eu-sugestao'), 'suggestion');
  assert.equal(btn.disabled, false);
  assert.equal(lastCall(api, 'POST', /\/objectivo\/sugerir$/).body.texto, 'Saber fazer uma anamnese.');
  assert.match(a.$('.eu-sugestao').textContent, /conduzir/);
  a.$('.eu-sugestao button').click();
  assert.equal(a.$('#campo-texto').value, 'Conduzir uma anamnese completa.');
});

test('the pattern step shows the proposed patterns and the model explanations', async (t) => {
  const r = { ...ANSWERS };
  delete r.padrao;
  delete r.materiais;
  delete r.plano;
  const api = new FakeApi({ user: TEACHER, draft: makeDraft({ respostas: r }) });
  const a = await boot(t, { api, hash: `#/rascunho/${DRAFT_ID}/passo/padrao` });
  await a.page('passo');
  const proposed = PATTERNS.filter((x) => x.papel_ia === 'contraparte').slice(0, 2);
  assert.equal(a.$$('.eu-padrao').length, 2);
  assert.ok(a.text().includes(proposed[0].nome));
  assert.ok(a.text().includes(proposed[0].mecanismo));
  a.$('#explicar-padroes').click();
  await a.waitFor(() => a.$('.eu-explicacao'), 'explanation');
  assert.match(a.$('.eu-explicacao').textContent, /Serve porque/);
  a.$('#mostrar-catalogo').click();
  assert.equal(a.$$('input[name="padrao"]').length, PATTERNS.length);
  a.set(`input[name="padrao"][value="${proposed[1].id}"]`, true);
  a.$('#guardar-passo').click();
  await a.waitFor(() => lastCall(api, 'PUT', /\/respostas\/padrao$/), 'save');
  assert.equal(lastCall(api, 'PUT', /\/respostas\/padrao$/).body.valor.padrao, proposed[1].id);
});

test('the materials step warns about patient and student data', async (t) => {
  const r = { ...ANSWERS };
  delete r.materiais;
  delete r.plano;
  const api = new FakeApi({ user: TEACHER, draft: makeDraft({ respostas: r }) });
  const a = await boot(t, { api, hash: `#/rascunho/${DRAFT_ID}/passo/materiais` });
  await a.page('passo');
  assert.match(a.$('.eu-aviso-dados').textContent, /doentes/);
  assert.match(a.$('.eu-aviso-dados').textContent, /estudantes/);
});

// ---------------------------------------------------------------- plan

test('the plan page shows the summary and approves the plan', async (t) => {
  const r = { ...ANSWERS };
  delete r.plano;
  const api = new FakeApi({ user: TEACHER, draft: makeDraft({ respostas: r }) });
  const a = await boot(t, { api, hash: `#/rascunho/${DRAFT_ID}/plano` });
  await a.page('plano');
  assert.match(a.$('#plano-resumo').textContent, /Introdução à Medicina/);
  a.set('#campo-titulo', 'Doente virtual');
  a.set('#campo-subtitulo', 'Recolha de informação clínica.');
  a.$('#aprovar-plano').click();
  await a.waitFor(() => lastCall(api, 'POST', /\/plano\/aprovar$/), 'approve');
  const put = lastCall(api, 'PUT', /\/respostas\/plano$/);
  const post = lastCall(api, 'POST', /\/plano\/aprovar$/);
  assert.equal(post.body.rev, put.body.rev + 1, 'approve uses the rev of the save');
  await a.page('seccao');
  assert.equal(a.w.location.hash, `#/rascunho/${DRAFT_ID}/seccao/objectivo`);
});

// ---------------------------------------------------------------- sections

test('a relaxed pattern shows its partial fit and the reason; a note shows when fewer than two fit', async (t) => {
  const r = { ...ANSWERS };
  delete r.padrao;
  delete r.materiais;
  delete r.plano;
  const api = new FakeApi({ user: TEACHER, draft: makeDraft({ respostas: r }) });
  const [one, two] = PATTERNS.filter((x) => x.papel_ia === 'contraparte');
  api.on('GET', /^\/padroes$/, (call) =>
    json(200, call.query.get('rascunho')
      ? { padroes: [one, { ...two, ajuste: 'parcial', ajuste_motivo: 'A duração típica deste padrão é maior do que o tempo indicado.' }], nota: 'Há menos de dois padrões do catálogo para este papel da IA e este tempo.' }
      : { padroes: PATTERNS }));
  const a = await boot(t, { api, hash: `#/rascunho/${DRAFT_ID}/passo/padrao` });
  await a.page('passo');
  const relaxed = a.$(`.eu-padrao[data-padrao="${two.id}"]`);
  assert.ok(relaxed.querySelector('.eu-ajuste'));
  assert.match(relaxed.textContent, /Adequação parcial/);
  assert.match(relaxed.textContent, /maior do que o tempo indicado/);
  assert.equal(a.$(`.eu-padrao[data-padrao="${one.id}"] .eu-ajuste`), null);
  assert.match(a.text(), /menos de dois padrões/);
});

test('the section avisos name the new rules: cut materials and control characters', async (t) => {
  const d = approvedDraft();
  d.seccoes.papeis = {
    dados: { estudante: 'Faz.', docente: 'Conduz.' }, estado: 'gerada', modelo: 'gpt-4o', origem: 'modelo',
    avisos: [
      { regra: 'materiais', texto: 'Os materiais foram cortados aos 20 000 caracteres no pedido ao modelo.' },
      { regra: 'controlo', texto: 'O texto tem caracteres de controlo. Retire-os.' },
    ],
  };
  const api = new FakeApi({ user: TEACHER, draft: d });
  const a = await boot(t, { api, hash: `#/rascunho/${DRAFT_ID}/seccao/papeis` });
  await a.page('seccao');
  const box = a.$('#seccao-avisos').textContent;
  assert.match(box, /cortados aos 20 000 caracteres/);
  assert.match(box, /Materiais/);
  assert.match(box, /Caracteres de controlo/);
  assert.doesNotMatch(box, /materiais Os/);
});

test('the regime and policy mismatch aviso shows after the step and in the final check', async (t) => {
  const MISMATCH = 'O regime da actividade e a política da avaliação são diferentes. Confirme que é intencional.';
  const r = { ...ANSWERS, evidencia: { ...ANSWERS.evidencia, avaliacao: 'sumativa' } };
  delete r.padrao;
  delete r.materiais;
  delete r.plano;
  const api = new FakeApi({ user: TEACHER, draft: makeDraft({ respostas: r }) });
  api.on('PUT', /\/respostas\/regime_themis$/, (call) => {
    const d = api.drafts.get(DRAFT_ID);
    d.respostas = { ...d.respostas, regime_themis: call.body.valor };
    return json(200, api.view(api.save(d), { avisos: [MISMATCH] }));
  });
  const a = await boot(t, { api, hash: `#/rascunho/${DRAFT_ID}/passo/regime_themis` });
  await a.page('passo');
  a.set('input[value="essay"]', true);
  a.$('#guardar-passo').click();
  await a.waitFor(() => a.$('#continuar-passo'), 'avisos after the step');
  assert.match(a.text(), /são diferentes/);

  const api2 = new FakeApi({ user: TEACHER, draft: approvedDraft() });
  api2.on('GET', /\/verificacao-final$/, () => json(200, { erros: [], avisos_regime: [{ texto: MISMATCH, tipo: 'aviso' }], passos_em_falta: [], seccoes_em_falta: [], referencias_a_verificar: 0 }));
  const b = await boot(t, { api: api2, hash: `#/rascunho/${DRAFT_ID}/previsao` });
  await b.page('previsao');
  await b.waitFor(() => /são diferentes/.test(b.$('#verificacao').textContent), 'regime aviso in the check');
});

test('the section editor shows the avisos and the three buttons', async (t) => {
  const api = new FakeApi({ user: TEACHER, draft: approvedDraft() });
  const a = await boot(t, { api, hash: `#/rascunho/${DRAFT_ID}/seccao/objectivo` });
  await a.page('seccao');
  const avisos = a.$('#seccao-avisos');
  assert.ok(avisos);
  assert.match(avisos.textContent, /Use "estudante", não "aluno"/);
  assert.match(avisos.textContent, /aluno/);
  for (const [id, label] of [['#aceitar', /Aceitar/], ['#nova-versao', /Nova versão/], ['#editar', /Editar/]]) {
    const b = a.$(id);
    assert.ok(b, id);
    assert.equal(b.tagName, 'BUTTON');
    assert.match(b.textContent, label);
  }
  assert.match(a.text(), /conduz uma anamnese/);
});

test('accepting a section posts the rev', async (t) => {
  const api = new FakeApi({ user: TEACHER, draft: approvedDraft() });
  const a = await boot(t, { api, hash: `#/rascunho/${DRAFT_ID}/seccao/objectivo` });
  await a.page('seccao');
  a.$('#aceitar').click();
  await a.waitFor(() => lastCall(api, 'POST', /\/aceitar$/), 'accept');
  assert.equal(lastCall(api, 'POST', /\/aceitar$/).body.rev, 3);
  await a.waitFor(() => /aceite/i.test(a.$('.eu-estado').textContent), 'state aceite');
});

test('a new version sends the comment and shows a busy state', async (t) => {
  const api = new FakeApi({ user: TEACHER, draft: approvedDraft() });
  let release;
  api.on('POST', /\/seccoes\/objectivo\/gerar$/, (call) => new Promise((r) => { release = () => r(api.route(call)); }));
  const a = await boot(t, { api, hash: `#/rascunho/${DRAFT_ID}/seccao/objectivo` });
  await a.page('seccao');
  a.$('#nova-versao').click();
  a.set('#comentario', 'Mais curto.');
  const btn = a.$('#pedir-versao');
  btn.click();
  await a.waitFor(() => release, 'request sent');
  assert.equal(btn.disabled, true);
  assert.equal(btn.getAttribute('aria-busy'), 'true');
  assert.match(a.$('#estado-pedido').textContent, /modelo/);
  release();
  await a.waitFor(() => /Texto novo do modelo/.test(a.text()), 'new text');
  assert.equal(lastCall(api, 'POST', /\/gerar$/).body.comentario, 'Mais curto.');
});

test('an empty section offers to generate the text', async (t) => {
  const api = new FakeApi({ user: TEACHER, draft: approvedDraft() });
  const a = await boot(t, { api, hash: `#/rascunho/${DRAFT_ID}/seccao/papeis` });
  await a.page('seccao');
  assert.ok(a.$('#gerar'));
  assert.equal(a.$('#aceitar'), null, 'no accept without text');
});

test('editing a section sends the structured data', async (t) => {
  const d = approvedDraft();
  d.seccoes.armadilhas = { dados: [{ lead: 'Saída de papel', texto: 'A IA sai do papel.' }, { lead: 'Fluência', texto: 'Fala demais.' }, { lead: 'Invenção', texto: 'Inventa dados.' }], estado: 'gerada', avisos: [], modelo: 'gpt-4o' };
  const api = new FakeApi({ user: TEACHER, draft: d });
  const a = await boot(t, { api, hash: `#/rascunho/${DRAFT_ID}/seccao/armadilhas` });
  await a.page('seccao');
  a.$('#editar').click();
  assert.equal(a.$$('#editar-form .eu-item').length, 3);
  a.$('#editar-form .eu-adicionar').click();
  assert.equal(a.$$('#editar-form .eu-item').length, 4);
  const items = a.$$('#editar-form .eu-item');
  const last = items[3];
  last.querySelector('input').value = 'Atraso';
  last.querySelector('textarea').value = 'A resposta demora.';
  a.$('#guardar-edicao').click();
  await a.waitFor(() => lastCall(api, 'PUT', /\/seccoes\/armadilhas$/), 'edit');
  const body = lastCall(api, 'PUT', /\/seccoes\/armadilhas$/).body;
  assert.equal(body.rev, 3);
  assert.equal(body.dados.length, 4);
  assert.deepEqual(body.dados[3], { lead: 'Atraso', texto: 'A resposta demora.' });
});

// ---------------------------------------------------------------- errors: 401, 409, model

test('a 401 with motivo auth keeps the session and names the wrong IAedu key', async (t) => {
  const api = new FakeApi({ user: TEACHER, draft: approvedDraft() });
  api.on('POST', /\/gerar$/, () => json(401, { erro: 'A chave IAedu não é válida.', motivo: 'auth' }));
  const a = await boot(t, { api, hash: `#/rascunho/${DRAFT_ID}/seccao/papeis` });
  await a.page('seccao');
  a.$('#gerar').click();
  await a.waitFor(() => a.$('.eu-erro'), 'error');
  assert.match(a.$('.eu-erro').textContent, /A chave IAedu indicada não é válida\./);
  assert.ok(a.$('.eu-erro a[href="#/definicoes"]'));
  assert.equal(a.w.location.hash, `#/rascunho/${DRAFT_ID}/seccao/papeis`);
  assert.equal(lastCall(api, 'POST', /^\/logout$/), undefined);
});

test('any other 401 ends the session and goes to #/entrar', async (t) => {
  const api = new FakeApi({ user: TEACHER, draft: approvedDraft() });
  api.on('POST', /\/aceitar$/, () => json(401, { erro: 'Sessão inválida ou expirada. Inicie sessão.' }));
  const a = await boot(t, { api, hash: `#/rascunho/${DRAFT_ID}/seccao/objectivo` });
  await a.page('seccao');
  a.$('#aceitar').click();
  await a.page('entrar');
  assert.equal(a.w.location.hash, '#/entrar');
  assert.match(a.text(), /sessão terminou/i);
});

test('a 409 on a rev mismatch shows the server message and offers Recarregar', async (t) => {
  const api = new FakeApi({ user: TEACHER, draft: approvedDraft() });
  const a = await boot(t, { api, hash: `#/rascunho/${DRAFT_ID}/seccao/objectivo` });
  await a.page('seccao');
  api.drafts.get(DRAFT_ID).rev = 7; // another window saved meanwhile
  a.$('#aceitar').click();
  await a.waitFor(() => a.$('.eu-erro'), 'error');
  assert.match(a.$('.eu-erro').textContent, /alterado noutra janela/);
  const reload = a.$('#recarregar');
  assert.ok(reload);
  assert.equal(reload.tagName, 'BUTTON');
  const before = api.calls.length;
  reload.click();
  await a.waitFor(() => api.calls.length > before && !a.$('.eu-erro'), 'reload');
  await a.page('seccao');
  a.$('#aceitar').click();
  await a.waitFor(() => lastCall(api, 'POST', /\/aceitar$/).body.rev === 7, 'accept with the new rev');
});

test('a 409 with another motivo shows the message and the errors, without Recarregar', async (t) => {
  const api = new FakeApi({ user: TEACHER, draft: approvedDraft() });
  api.on('POST', /\/aceitar$/, () => json(409, { erro: 'A secção tem erros. Edite-a antes de a aceitar.', motivo: 'invalido', erros: ['O campo texto não pode estar vazio.'] }));
  const a = await boot(t, { api, hash: `#/rascunho/${DRAFT_ID}/seccao/objectivo` });
  await a.page('seccao');
  a.$('#aceitar').click();
  await a.waitFor(() => a.$('.eu-erro'), 'error');
  assert.match(a.$('.eu-erro').textContent, /Edite-a antes de a aceitar/);
  assert.match(a.$('.eu-erro').textContent, /não pode estar vazio/);
  assert.equal(a.$('#recarregar'), null);
});

test('a model error shows the Portuguese message of the server', async (t) => {
  const api = new FakeApi({ user: TEACHER, draft: approvedDraft() });
  api.on('POST', /\/gerar$/, () => json(429, { erro: 'Atingiu o limite diário de pedidos ao modelo.' }));
  const a = await boot(t, { api, hash: `#/rascunho/${DRAFT_ID}/seccao/papeis` });
  await a.page('seccao');
  a.$('#gerar').click();
  await a.waitFor(() => a.$('.eu-erro'), 'error');
  assert.match(a.$('.eu-erro').textContent, /limite diário/);
  assert.equal(a.$('#gerar').disabled, false);
});

// ---------------------------------------------------------------- settings and own key

test('own key with remember unticked: nothing in localStorage, the next request carries X-Iaedu-Key', async (t) => {
  const api = new FakeApi({ user: TEACHER });
  const a = await boot(t, { api, hash: '#/definicoes' });
  await a.page('definicoes');
  a.set('#chave', 'sk-teste-123');
  a.set('#agente', 'agente-1');
  a.set('#canal', 'canal-1');
  assert.equal(a.$('#lembrar').checked, false);
  a.$('#guardar-chave').click();
  await a.waitFor(() => a.$('#modo-actual') && /sua chave/i.test(a.$('#modo-actual').textContent), 'own mode');
  assert.equal(a.w.localStorage.getItem('eunomia-chave'), null);
  await a.go('#/inicio', 'inicio');
  const call = lastCall(api, 'GET', /^\/rascunhos$/);
  assert.equal(call.headers.get('x-iaedu-key'), 'sk-teste-123');
  assert.equal(call.headers.get('x-iaedu-agent'), 'agente-1');
  assert.equal(call.headers.get('x-iaedu-channel'), 'canal-1');
});

test('own key with remember ticked is kept in localStorage and removed on request', async (t) => {
  const api = new FakeApi({ user: TEACHER });
  const a = await boot(t, { api, hash: '#/definicoes' });
  await a.page('definicoes');
  a.set('#chave', 'sk-teste-123');
  a.set('#agente', 'agente-1');
  a.set('#canal', 'canal-1');
  a.set('#lembrar', true);
  a.$('#guardar-chave').click();
  await a.waitFor(() => a.w.localStorage.getItem('eunomia-chave') && a.$('#remover-chave'), 'stored');
  assert.deepEqual(JSON.parse(a.w.localStorage.getItem('eunomia-chave')), { key: 'sk-teste-123', agent: 'agente-1', channel: 'canal-1', user: 'u1' });
  a.$('#remover-chave').click();
  await a.waitFor(() => a.w.localStorage.getItem('eunomia-chave') === null, 'removed');
  await a.go('#/inicio', 'inicio');
  assert.equal(lastCall(api, 'GET', /^\/rascunhos$/).headers.get('x-iaedu-key'), null);
});

test('a remembered key is loaded at start', async (t) => {
  const api = new FakeApi({ user: TEACHER });
  const a = await boot(t, { api, hash: '#/inicio', stored: { key: 'sk-guardada', agent: 'a', channel: 'c', user: 'u1' } });
  await a.page('inicio');
  assert.equal(lastCall(api, 'GET', /^\/rascunhos$/).headers.get('x-iaedu-key'), 'sk-guardada');
  assert.match(a.$('#modo-chave').textContent, /a sua chave IAedu/);
});

// Review 12+14, item 4: a remembered key belongs to one user.
test('a remembered key of another user is not used, and stays stored', async (t) => {
  const api = new FakeApi({ user: ADMIN });
  const stored = { key: 'sk-da-ana', agent: 'a', channel: 'c', user: 'u1' };
  const a = await boot(t, { api, hash: '#/inicio', stored });
  await a.page('inicio');
  assert.equal(lastCall(api, 'GET', /^\/rascunhos$/).headers.get('x-iaedu-key'), null);
  assert.match(a.$('#modo-chave').textContent, /chave partilhada/);
  assert.deepEqual(JSON.parse(a.w.localStorage.getItem('eunomia-chave')), stored);
});

test('a stored key without a user is not used', async (t) => {
  const api = new FakeApi({ user: TEACHER });
  const a = await boot(t, { api, hash: '#/inicio', stored: { key: 'sk-antiga', agent: 'a', channel: 'c' } });
  await a.page('inicio');
  assert.equal(lastCall(api, 'GET', /^\/rascunhos$/).headers.get('x-iaedu-key'), null);
});

test('after logout, a remembered key is kept but not used for the next user; it comes back for its owner', async (t) => {
  const api = new FakeApi({ user: TEACHER });
  const a = await boot(t, { api, hash: '#/inicio', stored: { key: 'sk-da-ana', agent: 'a', channel: 'c', user: 'u1' } });
  await a.page('inicio');
  a.$('#logout-btn').click();
  await a.page('entrar');
  api.user = ADMIN; // the next person on this computer
  a.set('#codigo', 'ABCD-EFGH');
  a.$('#login-form button[type=submit]').click();
  await a.page('inicio');
  assert.equal(lastCall(api, 'GET', /^\/rascunhos$/).headers.get('x-iaedu-key'), null);
  assert.ok(a.w.localStorage.getItem('eunomia-chave'));
  a.$('#logout-btn').click();
  await a.page('entrar');
  api.user = TEACHER;
  a.set('#codigo', 'ABCD-EFGH');
  a.$('#login-form button[type=submit]').click();
  await a.page('inicio');
  assert.equal(lastCall(api, 'GET', /^\/rascunhos$/).headers.get('x-iaedu-key'), 'sk-da-ana');
});

test('the home page shows the shared key mode by default', async (t) => {
  const a = await boot(t, { api: new FakeApi({ user: TEACHER }), hash: '#/inicio' });
  await a.page('inicio');
  assert.match(a.$('#modo-chave').textContent, /chave partilhada/);
  assert.ok(a.$('#modo-chave a[href="#/definicoes"]'));
});

test('the settings page asks for all three own-key fields', async (t) => {
  const a = await boot(t, { api: new FakeApi({ user: TEACHER }), hash: '#/definicoes' });
  await a.page('definicoes');
  a.set('#chave', 'sk-teste-123');
  a.$('#guardar-chave').click();
  await a.waitFor(() => a.$('.eu-erro'), 'error');
  assert.match(a.$('.eu-erro').textContent, /agente/);
});

// ---------------------------------------------------------------- references, preview, export

test('the references picker saves curated ids and a teacher entry', async (t) => {
  const api = new FakeApi({ user: TEACHER, draft: approvedDraft() });
  const a = await boot(t, { api, hash: `#/rascunho/${DRAFT_ID}/referencias` });
  await a.page('referencias');
  assert.equal(a.$$('input[name="ref"]').length, REFS.length);
  a.set(`input[name="ref"][value="${REFS[0].id}"]`, true);
  a.set('#ref-nova', 'Autor A. Um artigo. Revista. 2025.');
  a.$('#ref-adicionar').click();
  assert.match(a.$('#refs-docente').textContent, /Um artigo/);
  a.$('#guardar-referencias').click();
  await a.waitFor(() => lastCall(api, 'PUT', /\/referencias$/), 'save');
  assert.deepEqual(lastCall(api, 'PUT', /\/referencias$/).body, { rev: 3, referencias: [{ id: REFS[0].id }, { texto: 'Autor A. Um artigo. Revista. 2025.' }] });
});

test('the preview lists the sections still to accept and the export buttons download', async (t) => {
  const api = new FakeApi({ user: TEACHER, draft: approvedDraft() });
  const a = await boot(t, { api, hash: `#/rascunho/${DRAFT_ID}/previsao` });
  await a.page('previsao');
  assert.match(a.$('#verificacao').textContent, /Formato e duração em aula/);
  assert.ok(a.$(`#verificacao a[href="#/rascunho/${DRAFT_ID}/seccao/formato"]`));
  assert.equal(a.$('#exportar-qmd'), null, 'no export before all sections are accepted');

  api.on('GET', /\/verificacao-final$/, () => json(200, { erros: [], seccoes_em_falta: [], referencias_a_verificar: 1 }));
  api.on('GET', /\/exportar$/, (call) => {
    const f = call.query.get('formato');
    const body = f === 'html' ? '<!doctype html><title>x</title><h1>Doente virtual</h1>' : 'x';
    return new Response(body, { status: 200, headers: { 'Content-Disposition': `attachment; filename="doente-virtual.${f}"`, 'X-Eunomia-Avisos': '0' } });
  });
  api.drafts.get(DRAFT_ID).referencias = [{ texto: 'Autor A. Um artigo. 2025.', origem: 'docente' }];
  await a.go('#/inicio', 'inicio');
  await a.go(`#/rascunho/${DRAFT_ID}/previsao`, 'previsao');
  await a.waitFor(() => a.$('#previsao-ficha'), 'preview frame');
  assert.match(a.$('#previsao-ficha').getAttribute('srcdoc'), /Doente virtual/);
  assert.equal(a.$('#previsao-ficha').getAttribute('sandbox'), '');
  assert.match(a.$('#verificacao').textContent, /1 referência escrita por si/);
  for (const f of ['qmd', 'md', 'html']) {
    a.$(`#exportar-${f}`).click();
    await a.waitFor(() => a.downloads.some((d) => d.download === `doente-virtual.${f}`), `download ${f}`);
  }
});

// ---------------------------------------------------------------- admin codes

test('the codes page lists, adds (shows the new code once) and revokes', async (t) => {
  const api = new FakeApi({ user: ADMIN, codes: [{ id: 'c1', nome: 'Ana Silva', perfil: 'teacher', criado: '2026-11-14T09:00:00.000Z', revogado: null }] });
  const a = await boot(t, { api, hash: '#/codigos' });
  await a.page('codigos');
  assert.match(a.$('#codigos-tabela').textContent, /Ana Silva/);
  a.set('#novo-nome', 'Rui Costa');
  a.$('#criar-codigo').click();
  await a.waitFor(() => a.$('#codigo-novo'), 'new code');
  assert.match(a.$('#codigo-novo').textContent, /QWER-TYUI-OPAS/);
  assert.match(a.$('#codigo-novo').textContent, /Rui Costa/);
  assert.deepEqual(lastCall(api, 'POST', /^\/codigos$/).body, { nome: 'Rui Costa', admin: false });
  await a.waitFor(() => /Rui Costa/.test(a.$('#codigos-tabela').textContent), 'list refreshed');
  // Revoke asks for confirmation in place.
  a.$('#codigos-tabela .revogar').click();
  assert.equal(lastCall(api, 'DELETE', /^\/codigos\//), undefined);
  a.$('#codigos-tabela .confirmar-revogar').click();
  await a.waitFor(() => lastCall(api, 'DELETE', /^\/codigos\/c1$/), 'revoke');
  await a.waitFor(() => /revogado/i.test(a.$('#codigos-tabela').textContent), 'revoked shown');
  // The code is shown once: after leaving the page it is gone.
  await a.go('#/inicio', 'inicio');
  await a.go('#/codigos', 'codigos');
  assert.equal(a.$('#codigo-novo'), null);
});

test('an admin sees the codes link; a teacher on #/codigos goes to #/inicio', async (t) => {
  const admin = await boot(t, { api: new FakeApi({ user: ADMIN }), hash: '#/inicio' });
  await admin.page('inicio');
  assert.ok(admin.$('a[href="#/codigos"]'));
  const teacher = await boot(t, { api: new FakeApi({ user: TEACHER }), hash: '#/codigos' });
  await teacher.page('inicio');
  assert.equal(teacher.w.location.hash, '#/inicio');
});

test('routes outside the MVP (review) go to #/inicio', async (t) => {
  const a = await boot(t, { api: new FakeApi({ user: ADMIN }), hash: '#/revisao' });
  await a.page('inicio');
  assert.equal(a.w.location.hash, '#/inicio');
});

// ---------------------------------------------------------------- accessibility and copy

// ---------------------------------------------------------------- review 12+14 fixes

test('a page that fails to load keeps the focus on the error box', async (t) => {
  const api = new FakeApi({ user: TEACHER, draft: approvedDraft() });
  api.on('GET', /\/verificacao-final$/, () => json(500, { erro: 'Erro interno do servidor.' }));
  const a = await boot(t, { api, hash: '#/inicio' });
  await a.page('inicio');
  await a.go(`#/rascunho/${DRAFT_ID}/previsao`, 'previsao');
  assert.ok(a.$('.eu-erro'));
  assert.equal(a.w.document.activeElement, a.$('.eu-erro'));
  await a.go('#/rascunho/0123456789ab/passo/contexto', 'passo');
  assert.equal(a.w.document.activeElement, a.$('.eu-erro'));
});

test('the end of a session is announced and shown after the heading of the login page', async (t) => {
  const api = new FakeApi({ user: TEACHER, draft: approvedDraft() });
  api.on('POST', /\/aceitar$/, () => json(401, { erro: 'Sessão inválida ou expirada. Inicie sessão.' }));
  const a = await boot(t, { api, hash: `#/rascunho/${DRAFT_ID}/seccao/objectivo` });
  await a.page('seccao');
  a.$('#aceitar').click();
  await a.page('entrar');
  assert.match(a.$('#estado-pedido').textContent, /A sessão terminou/);
  const h2 = a.$('#main h2');
  const note = [...a.$$('#main p')].find((p) => /sessão terminou/.test(p.textContent));
  assert.ok(note);
  assert.ok(h2.compareDocumentPosition(note) & a.w.Node.DOCUMENT_POSITION_FOLLOWING, 'the note comes after the heading');
});

test('after a revoke the focus goes to the status line', async (t) => {
  const api = new FakeApi({ user: ADMIN, codes: [{ id: 'c1', nome: 'Ana Silva', perfil: 'teacher', criado: '2026-11-14T09:00:00.000Z', revogado: null }] });
  const a = await boot(t, { api, hash: '#/codigos' });
  await a.page('codigos');
  a.$('#codigos-tabela .revogar').click();
  a.$('#codigos-tabela .confirmar-revogar').click();
  await a.waitFor(() => /revogado/i.test(a.$('#codigos-tabela').textContent), 'revoked');
  await a.waitFor(() => a.w.document.activeElement === a.$('#estado-pedido'), 'focus on the status line');
  assert.match(a.$('#estado-pedido').textContent, /Ana Silva/);
});

test('a pattern id with quotes from the server does not break the explanations', async (t) => {
  const r = { ...ANSWERS };
  delete r.padrao;
  delete r.materiais;
  delete r.plano;
  const api = new FakeApi({ user: TEACHER, draft: makeDraft({ respostas: r }) });
  const proposed = PATTERNS.filter((x) => x.papel_ia === 'contraparte').slice(0, 2);
  api.on('POST', /\/padroes\/explicar$/, () => json(200, { padroes: [{ id: 'x"] , [id', explicacao: 'Estranho.' }, { ...proposed[0], explicacao: 'Serve bem.', avisos: [] }], modelo: 'gpt-4o' }));
  const a = await boot(t, { api, hash: `#/rascunho/${DRAFT_ID}/passo/padrao` });
  await a.page('passo');
  a.$('#explicar-padroes').click();
  await a.waitFor(() => a.$('.eu-explicacao'), 'explanation');
  assert.match(a.$(`.eu-padrao[data-padrao="${proposed[0].id}"] .eu-explicacao`).textContent, /Serve bem/);
  assert.equal(a.$('.eu-erro'), null);
});

test('the lint avisos of outcome suggestions and pattern explanations are shown next to them', async (t) => {
  const r = { ...ANSWERS };
  delete r.padrao;
  delete r.materiais;
  delete r.plano;
  const api = new FakeApi({ user: TEACHER, draft: makeDraft({ respostas: r }) });
  const proposed = PATTERNS.filter((x) => x.papel_ia === 'contraparte').slice(0, 2);
  api.on('POST', /\/objectivo\/sugerir$/, () => json(200, { sugestoes: [
    { texto: 'Conduzir a anamnese com os alunos.', ok: true, verbo: 'conduzir', avisos: [{ regra: 'lingua', texto: 'Use "estudantes", não "alunos".', trecho: 'alunos' }] },
    { texto: 'Conduzir uma anamnese.', ok: true, verbo: 'conduzir', avisos: [] },
  ], modelo: 'gpt-4o' }));
  api.on('POST', /\/padroes\/explicar$/, () => json(200, { padroes: [
    { ...proposed[0], explicacao: 'Em 87 % dos casos funciona.', avisos: [{ regra: 'numero', texto: 'Confirmar a fonte do número.', trecho: '87 %' }] },
    { ...proposed[1], explicacao: 'Serve.', avisos: [] },
  ], modelo: 'gpt-4o' }));
  const a = await boot(t, { api, hash: `#/rascunho/${DRAFT_ID}/passo/objectivo` });
  await a.page('passo');
  a.set('#campo-texto', 'Saber fazer uma anamnese.');
  a.$('#sugerir-objectivo').click();
  await a.waitFor(() => a.$$('.eu-sugestao').length === 2, 'suggestions');
  const [first, second] = a.$$('.eu-sugestao');
  assert.match(first.querySelector('.eu-avisos-modelo').textContent, /Língua/);
  assert.match(first.querySelector('.eu-avisos-modelo').textContent, /não "alunos"/);
  assert.equal(second.querySelector('.eu-avisos-modelo'), null);

  await a.go(`#/rascunho/${DRAFT_ID}/passo/padrao`, 'passo');
  a.$('#explicar-padroes').click();
  await a.waitFor(() => a.$('.eu-explicacao'), 'explanation');
  const card = a.$(`.eu-padrao[data-padrao="${proposed[0].id}"]`);
  assert.match(card.querySelector('.eu-avisos-modelo').textContent, /Número a confirmar/);
  assert.match(card.querySelector('.eu-avisos-modelo').textContent, /87 %/);
  assert.equal(a.$(`.eu-padrao[data-padrao="${proposed[1].id}"] .eu-avisos-modelo`), null);
});

test('the final check shows the regime avisos as warnings and the Themis messages as information', async (t) => {
  const api = new FakeApi({ user: TEACHER, draft: approvedDraft() });
  api.on('GET', /\/verificacao-final$/, () => json(200, {
    erros: [], passos_em_falta: [], seccoes_em_falta: [], referencias_a_verificar: 0,
    avisos_regime: [
      { texto: 'O regime da actividade e a política da avaliação são diferentes. Confirme que é intencional.', tipo: 'aviso' },
      { texto: 'A política exige declaração de uso.', tipo: 'informacao' },
    ],
  }));
  const a = await boot(t, { api, hash: `#/rascunho/${DRAFT_ID}/previsao` });
  await a.page('previsao');
  await a.waitFor(() => a.$('#avisos-regime'), 'regime avisos');
  assert.match(a.$('#avisos-regime').textContent, /são diferentes/);
  assert.doesNotMatch(a.$('#avisos-regime').textContent, /exige declaração/);
  assert.match(a.$('#informacao-regime').textContent, /exige declaração/);
  assert.match(a.$('#verificacao').textContent, /Informação da política/);
});

test('the progress bar has its own label', async (t) => {
  const a = await boot(t, { api: new FakeApi({ user: TEACHER, draft: makeDraft() }), hash: `#/rascunho/${DRAFT_ID}/passo/contexto` });
  await a.page('passo');
  assert.equal(a.$('progress').getAttribute('aria-label'), 'Progresso da entrevista');
});

test('every string of i18n-pt.js is used by app.js', () => {
  const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  const w = {};
  new Function('window', fs.readFileSync(path.join(ROOT, 'i18n-pt.js'), 'utf8'))(w);
  // Maps that app.js reads with a computed key.
  const dynamic = new Set(['estados', 'seccao.titulos', 'seccao.estado', 'seccao.estadoCurto', 'seccao.regras', 'seccao.campos', 'codigos.perfis']);
  const computed = new Set(['previsao.qmd', 'previsao.md', 'previsao.html']);
  const unused = [];
  for (const [group, entries] of Object.entries(w.EUNOMIA_PT)) {
    if (dynamic.has(group)) continue;
    for (const [key, value] of Object.entries(entries)) {
      const name = `${group}.${key}`;
      if (dynamic.has(name) || computed.has(name)) continue;
      if (typeof value === 'object') { unused.push(`${name} (unexpected map)`); continue; }
      if (!app.includes(`S.${name}`)) unused.push(name);
    }
  }
  assert.deepEqual(unused, []);
});

test('every interactive control is a labelled button, input, select or a; no click handlers on div or span', async (t) => {
  const d = approvedDraft();
  d.seccoes.formato = { dados: { introducao: 'Uma aula.', blocos: [{ minutos: 10, texto: 'Abertura.' }, { minutos: 20, minutos_max: 30, texto: 'Entrevista.' }] }, estado: 'aceite', avisos: [], origem: 'docente' };
  const api = new FakeApi({ user: ADMIN, draft: d, codes: [{ id: 'c1', nome: 'Ana', perfil: 'teacher', criado: '2026-11-14T09:00:00.000Z', revogado: null }] });
  const a = await boot(t, { api, hash: '#/inicio' });
  const pages = [
    ['#/inicio', 'inicio'],
    [`#/rascunho/${DRAFT_ID}/passo/contexto`, 'passo'],
    [`#/rascunho/${DRAFT_ID}/passo/objectivo`, 'passo'],
    [`#/rascunho/${DRAFT_ID}/passo/padrao`, 'passo'],
    [`#/rascunho/${DRAFT_ID}/plano`, 'plano'],
    [`#/rascunho/${DRAFT_ID}/seccao/objectivo`, 'seccao', () => {
      a.$('#editar').click();
      check('edit form');
      a.$('#nova-versao').click();
      check('new version');
    }],
    [`#/rascunho/${DRAFT_ID}/seccao/formato`, 'seccao', () => {
      assert.equal(a.$('#aceitar'), null, 'an accepted section has no accept button');
      a.$('#editar').click();
      assert.equal(a.$$('#editar-form .eu-item').length, 2);
      check('formato edit form');
    }],
    [`#/rascunho/${DRAFT_ID}/referencias`, 'referencias'],
    [`#/rascunho/${DRAFT_ID}/previsao`, 'previsao'],
    ['#/definicoes', 'definicoes'],
    ['#/codigos', 'codigos'],
  ];
  const labelOf = (el) => {
    if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
    if (el.getAttribute('aria-labelledby')) return el.getAttribute('aria-labelledby').split(' ').map((id) => (a.$(`#${id}`) || {}).textContent || '').join(' ');
    if (el.id && a.$(`label[for="${el.id}"]`)) return a.$(`label[for="${el.id}"]`).textContent;
    const wrap = el.closest('label');
    return wrap ? wrap.textContent : '';
  };
  const check = (where) => {
    for (const el of a.$$('button, a')) assert.ok(el.textContent.trim() || el.getAttribute('aria-label'), `${where}: ${el.outerHTML.slice(0, 80)} has text`);
    for (const el of a.$$('input, select, textarea')) {
      if (el.type === 'hidden') continue;
      assert.ok(labelOf(el).trim(), `${where}: ${el.outerHTML.slice(0, 100)} has a label`);
    }
    for (const el of a.clickTargets) {
      if (!el.tagName) continue; // window or document
      assert.ok(['BUTTON', 'A', 'INPUT', 'SELECT'].includes(el.tagName), `${where}: click handler on ${el.tagName}`);
    }
  };
  for (const [h, name, then] of pages) {
    await a.go(h, name);
    check(h);
    if (then) then();
  }
  await a.go('#/inicio', 'inicio');
  a.$('#logout-btn').click();
  await a.page('entrar');
  check('#/entrar');
});

test('the main region is focused after each page change', async (t) => {
  const a = await boot(t, { api: new FakeApi({ user: TEACHER }), hash: '#/inicio' });
  await a.page('inicio');
  await a.go('#/definicoes', 'definicoes');
  const h = a.w.document.activeElement;
  assert.ok(h === a.$('#main') || a.$('#main').contains(h), 'focus inside main');
});

test('front-end files have no emojis; app.js has no UI copy; the strings use the Quadro spelling', () => {
  const emoji = /[☀-➿\u{1F000}-\u{1FAFF}️]/u;
  for (const f of ['index.html', 'style.css', ...SCRIPTS]) {
    assert.doesNotMatch(fs.readFileSync(path.join(ROOT, f), 'utf8'), emoji, f);
  }
  // Portuguese copy has accents; app.js and api.js must not.
  for (const f of ['app.js', 'api.js']) {
    assert.doesNotMatch(fs.readFileSync(path.join(ROOT, f), 'utf8'), /[^\x00-\x7F]/, `${f} is ASCII only: copy goes in i18n-pt.js`);
  }
  const pt = fs.readFileSync(path.join(ROOT, 'i18n-pt.js'), 'utf8');
  assert.doesNotMatch(pt, /\batividade|\bobjetivo|\balunos?\b|\bpacientes?\b|\bdireto\b|\bcorreção/i);
});

// ---------------------------------------------------------------- final fixes (final-fixes.md)

test('12: every API request carries X-Eunomia: 1, GET and logout included', async (t) => {
  const api = new FakeApi({ user: TEACHER, draft: approvedDraft() });
  const a = await boot(t, { api, hash: `#/rascunho/${DRAFT_ID}/seccao/objectivo` });
  await a.page('seccao');
  a.$('#aceitar').click();
  await a.waitFor(() => lastCall(api, 'POST', /\/aceitar$/), 'accept');
  a.$('#logout-btn').click();
  await a.page('entrar');
  assert.ok(lastCall(api, 'POST', /^\/logout$/));
  assert.ok(api.calls.length >= 4);
  for (const c of api.calls) assert.equal(c.headers.get('x-eunomia'), '1', `${c.method} ${c.path}`);
});

test('1: a 300 KB adversarial section text renders in under 1 s', async (t) => {
  const d = approvedDraft();
  const big = '[a'.repeat(150 * 1024);
  // Texts that never match: the cost is in the regex, not in the DOM nodes.
  d.seccoes.objectivo.dados = { texto: big, competencia_protegida: '[a](https://'.repeat(25 * 1024) };
  const api = new FakeApi({ user: TEACHER, draft: d });
  const a = await boot(t, { api, hash: '#/inicio' });
  await a.page('inicio');
  const t0 = Date.now();
  await a.go(`#/rascunho/${DRAFT_ID}/seccao/objectivo`, 'seccao');
  assert.ok(Date.now() - t0 < 1000, `${Date.now() - t0} ms`);
});
