// The harness of the front-end tests: the real index.html and scripts in jsdom, with a fake API
// server (FakeApi) behind a mocked fetch, and the fixtures that the test files share.
// boot(t, { api, hash, storage, stored, local }) loads the page (local: localStorage items to set
// before the scripts run); lastCall(api, method, re) finds a request.
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const BASE = '/fmup-ia/eunomia/api';
const SCRIPTS = ['i18n-pt.js', 'ajuda-pt.js', 'api.js', 'app.js'];
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

async function boot(t, { api = new FakeApi(), hash = '', storage = 'ok', stored = null, local = {} } = {}) {
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
  } else {
    if (stored) w.localStorage.setItem('eunomia-chave', JSON.stringify(stored));
    for (const [k, v] of Object.entries(local)) w.localStorage.setItem(k, v);
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

module.exports = {
  ROOT, BASE, SCRIPTS, INTERVIEW, PATTERNS, REFS, DRAFT_ID, TEACHER, ADMIN, ANSWERS,
  makeDraft, approvedDraft, nextStep, json, FakeApi, boot, lastCall,
};
