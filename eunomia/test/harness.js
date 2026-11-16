// The harness of the front-end tests: the real index.html and scripts in jsdom, with a fake API
// server (FakeApi) behind a mocked fetch, and the fixtures that the test files share.
// boot(t, { api, hash, storage, stored, local }) loads the page (local: localStorage items to set
// before the scripts run); lastCall(api, method, re) finds a request. api.static(name, obj) serves
// obj in place of a static file; each call records its time (at).
// The pilot routes mimic eunomia-server/src/review-routes.js: opiniao, submeter, GET /revisao (autor
// as the display name), aprovar, devolver (revisao.revisor as the display name) and GET /uso.
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const BASE = '/fmup-ia/eunomia/api';
const SCRIPTS = ['i18n-pt.js', 'ajuda-pt.js', 'api.js', 'themis-link.js', 'app.js'];
const INTERVIEW = JSON.parse(fs.readFileSync(path.join(ROOT, 'interview.json'), 'utf8'));
const PATTERNS = JSON.parse(fs.readFileSync(path.join(ROOT, 'patterns.json'), 'utf8')).padroes;
const REFS = JSON.parse(fs.readFileSync(path.join(ROOT, 'references.json'), 'utf8')).referencias;
const EXEMPLOS = JSON.parse(fs.readFileSync(path.join(ROOT, 'exemplos.json'), 'utf8'));
// The reference ficha of example n, as GET /exemplos/:n returns it.
const referenceFicha = (n) => JSON.parse(fs.readFileSync(path.join(ROOT, '..', 'eunomia-server', 'referencia', `ficha-${n}.json`), 'utf8'));
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

// GET /uso, as the server answers it (review-routes.js).
const USO = {
  limite_diario: 50,
  utilizadores: [
    { id: 'u1', nome: 'Ana Silva', perfil: 'teacher', revogado: false, rascunhos: { rascunho: 2, submetida: 1 }, pedidos_hoje: 3, pedidos_30_dias: 41 },
    { id: 'u2', nome: 'Rui Costa', perfil: 'teacher', revogado: true, rascunhos: {}, pedidos_hoje: 0, pedidos_30_dias: 0 },
    { id: 'u9', nome: 'Tiago Jacinto', perfil: 'admin', revogado: false, rascunhos: { aprovada: 1 }, pedidos_hoje: 1, pedidos_30_dias: 7 },
  ],
  seccoes: ['objectivo', 'formato', 'prompt_base', 'papeis', 'correccao', 'armadilhas', 'plano_b'].map((id) => ({ id, sim: 0, nao: 0, comentarios: [] })),
};
USO.seccoes[0] = { id: 'objectivo', sim: 4, nao: 1, comentarios: [{ util: false, texto: 'O verbo ficou vago.', data: '2026-11-15T10:00:00.000Z', modelo: 'gpt-4o' }] };
USO.seccoes[3] = { id: 'papeis', sim: 2, nao: 0, comentarios: [{ util: true, texto: 'Poupou-me tempo.', data: '2026-11-14T10:00:00.000Z', modelo: 'gpt-4o' }] };

const EDITABLE = ['rascunho', 'devolvida'];
const STAMP = '2026-11-16T09:00:00.000Z';

class FakeApi {
  constructor({ user = null, draft = null, codes = [], uso = USO } = {}) {
    this.user = user;
    this.drafts = new Map();
    if (draft) this.drafts.set(draft.id, draft);
    this.codes = codes;
    this.uso = uso;
    this.calls = [];
    this.overrides = [];
    this.statics = {};
  }

  // Serves obj in place of the static file name (for example exemplos.json).
  static(name, obj) {
    this.statics[name] = obj;
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
      const name = path.basename(u.pathname);
      if (this.statics[name]) return new Response(JSON.stringify(this.statics[name]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      const file = path.join(ROOT, name);
      if (!fs.existsSync(file)) return new Response('', { status: 404 });
      return new Response(fs.readFileSync(file, 'utf8'), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    const local = u.pathname.slice(BASE.length);
    const headers = new Headers(init.headers || {});
    const body = init.body ? JSON.parse(init.body) : undefined;
    const call = { method, path: local, query: u.searchParams, headers, body, at: Date.now() };
    this.calls.push(call);
    for (const o of this.overrides) if (o.method === method && o.pattern.test(local)) return o.fn(call);
    return this.route(call);
  }

  route({ method, path: p, query, body }) {
    const anon = () => json(401, { erro: 'Sessão inválida ou expirada. Inicie sessão.' });
    // Public, as on the server: the reference ficha of an example.
    let ex = /^\/exemplos\/([^/]+)$/.exec(p);
    if (method === 'GET' && ex) {
      const n = /^[1-9][0-9]?$/.test(ex[1]) ? Number(ex[1]) : NaN;
      if (!EXEMPLOS.exemplos.some((e) => e.n === n)) return json(404, { erro: 'Exemplo não encontrado.' });
      return json(200, { ficha: referenceFicha(n) });
    }
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
      const titulo = (d) => (d.respostas.plano || {}).titulo || (d.respostas.contexto || {}).uc || null;
      return json(200, { rascunhos: [...this.drafts.values()].map((d) => ({ id: d.id, titulo: titulo(d), modo: d.modo, estado: d.estado, rev: d.rev, actualizado: d.actualizado, proximo_passo: nextStep(d) })) });
    }
    if (method === 'POST' && p === '/rascunhos') {
      // { modo: 'criar' } or { modo: 'criar', exemplo: 1..6 } (the answers of the example, plan not approved).
      let respostas = {};
      if (body.exemplo !== undefined) {
        const e = EXEMPLOS.exemplos.find((x) => Number.isInteger(body.exemplo) && x.n === body.exemplo);
        if (!e) return json(400, { erro: 'Exemplo desconhecido.' });
        respostas = JSON.parse(JSON.stringify(e.respostas));
      }
      const d = makeDraft({ id: 'f0f0f0f0f0f0', rev: 1, respostas });
      this.drafts.set(d.id, d);
      return json(201, this.view(d));
    }
    // The admin routes of the pilot (review-routes.js).
    if ((p === '/uso' || p.startsWith('/revisao')) && this.user.perfil !== 'admin') return json(403, { erro: 'Sem permissão para esta operação.' });
    if (method === 'GET' && p === '/uso') return json(200, this.uso);
    if (method === 'GET' && p === '/revisao') {
      const titulo = (d) => (d.respostas.plano || {}).titulo || (d.respostas.contexto || {}).uc || null;
      const list = [...this.drafts.values()].filter((d) => d.estado === 'submetida')
        .sort((a, b) => (Date.parse(a.submetida) || 0) - (Date.parse(b.submetida) || 0))
        .map((d) => ({ id: d.id, titulo: titulo(d), autor: d.autor.nome, submetida: d.submetida || null, rev: d.rev }));
      return json(200, { revisao: list });
    }
    let rv = /^\/revisao\/([0-9a-f]{12})\/(aprovar|devolver)$/.exec(p);
    if (method === 'POST' && rv) {
      const d = this.drafts.get(rv[1]);
      if (!d) return json(404, { erro: 'Rascunho não encontrado.' });
      if (d.estado !== 'submetida') return json(409, { erro: 'Esta actividade não está à espera de revisão.', motivo: 'estado' });
      if (!Number.isInteger(body.rev)) return json(400, { erro: 'Indique a revisão do rascunho (rev).' });
      if (body.rev !== d.rev) return json(409, { erro: 'O rascunho foi alterado noutra janela. Recarregue a página.', motivo: 'rev' });
      const comentario = typeof body.comentario === 'string' ? body.comentario.trim() : '';
      if (rv[2] === 'devolver') {
        if (!comentario) return json(400, { erro: 'Escreva o comentário para o autor.' });
        if (comentario.length > 2000) return json(400, { erro: 'O campo comentario é demasiado longo (máximo 2000 caracteres).' });
      }
      const decisao = rv[2] === 'aprovar' ? 'aprovada' : 'devolvida';
      d.estado = decisao;
      d.revisao = { decisao, ...(rv[2] === 'devolver' ? { comentario } : {}), data: STAMP, revisor: this.user.nome };
      return json(200, this.view(this.save(d)));
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
    // duplicar and DELETE: the author's own draft only (another teacher's is 404, an admin gets 403).
    const authorOnly = (verb) => {
      if (d.autor.id === this.user.id) return null;
      if (this.user.perfil === 'admin') return json(403, { erro: `Só o autor pode ${verb} este rascunho.` });
      return json(404, { erro: 'Rascunho não encontrado.' });
    };
    if (method === 'POST' && rest === '/duplicar') {
      const bad = authorOnly('duplicar');
      if (bad) return bad;
      const respostas = JSON.parse(JSON.stringify(d.respostas));
      if (respostas.plano && respostas.plano.titulo) respostas.plano.titulo = `Cópia de ${respostas.plano.titulo}`;
      const seccoes = {};
      for (const [id, s] of Object.entries(d.seccoes)) if (s && s.estado === 'aceite') seccoes[id] = JSON.parse(JSON.stringify(s));
      const copy = makeDraft({ id: 'c0c0c0c0c0c0', rev: 1, respostas, seccoes, plano_aprovado: d.plano_aprovado === true, referencias: JSON.parse(JSON.stringify(d.referencias)) });
      this.drafts.set(copy.id, copy);
      return json(201, this.view(copy));
    }
    if (method === 'DELETE' && rest === '') {
      const bad = authorOnly('apagar');
      if (bad) return bad;
      if (d.estado === 'submetida') return json(409, { erro: 'Uma actividade submetida para revisão não pode ser apagada.', motivo: 'bloqueado' });
      if (!Number.isInteger(body && body.rev)) return json(400, { erro: 'Indique a revisão do rascunho (rev).' });
      const stale = write();
      if (stale) return stale;
      this.drafts.delete(d.id);
      return json(200, { ok: true, apagado: '2026-11-16T10:00:00.000Z' });
    }
    // The writes of the pilot: the author's own editable draft at the same rev.
    const editable = () => {
      if (!EDITABLE.includes(d.estado)) return json(409, { erro: 'Esta ficha foi submetida e não pode ser alterada.', motivo: 'bloqueado' });
      return write();
    };
    m = /^\/seccoes\/(\w+)\/opiniao$/.exec(rest);
    if (method === 'POST' && m) {
      const bad = editable();
      if (bad) return bad;
      if (typeof body.util !== 'boolean') return json(400, { erro: 'Indique se a secção foi útil (sim ou não).' });
      const comentario = typeof body.comentario === 'string' ? body.comentario.trim() : '';
      if (comentario.length > 500) return json(400, { erro: 'O campo comentario é demasiado longo (máximo 500 caracteres).' });
      const s = d.seccoes[m[1]];
      if (!s || s.dados === undefined || s.origem !== 'modelo') return json(409, { erro: 'Só pode dar opinião sobre texto escrito pelo modelo.', motivo: 'incompleto' });
      s.opiniao = { util: body.util, ...(comentario ? { comentario } : {}), data: STAMP, modelo: s.modelo ?? null };
      return json(200, this.view(this.save(d)));
    }
    if (method === 'POST' && rest === '/submeter') {
      const bad = editable();
      if (bad) return bad;
      d.estado = 'submetida';
      d.submetida = STAMP;
      delete d.revisao;
      return json(200, this.view(this.save(d)));
    }
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
  ROOT, BASE, SCRIPTS, INTERVIEW, PATTERNS, REFS, EXEMPLOS, USO, referenceFicha, DRAFT_ID, TEACHER, ADMIN, ANSWERS,
  makeDraft, approvedDraft, nextStep, json, FakeApi, boot, lastCall,
};
