'use strict';

// Shared harness for the route tests: a server on a free port with a temporary data folder.
// Not a test file (no .test.js suffix), so the runner does not run it by itself.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createServer } = require('../src/server.js');
const { createStore } = require('../src/store.js');
const { createAuth } = require('../src/auth.js');

const SECRET = 'segredo-de-teste-com-mais-de-32-caracteres!';
const BASE = '/fmup-ia/eunomia/api';

async function startApp(t, extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eunomia-app-'));
  const store = createStore(dir);
  const sink = { write: () => true };
  const config = {
    basePath: BASE,
    store,
    auth: createAuth({ store, secret: SECRET, dailyLimit: 200 }),
    iaedu: { send: async () => ({ text: '{}', model: null }) },
    github: null,
    now: Date.now,
    env: {},
    logStream: sink,
    errorStream: sink,
    limits: { requestsPerMinute: 10000 },
    ...extra,
  };
  const server = createServer(config);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  // Every call carries X-Eunomia: 1, as the front end does; csrf: false leaves it out.
  async function call(method, route, { body, headers = {}, cookie, raw, csrf = true } = {}) {
    const h = csrf ? { 'x-eunomia': '1', ...headers } : { ...headers };
    if (cookie) h.cookie = `eunomia=${cookie}`;
    let payload = raw;
    if (body !== undefined) {
      payload = JSON.stringify(body);
      h['content-type'] = 'application/json';
    }
    const res = await fetch(`${url}${BASE}${route}`, { method, headers: h, body: payload });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      // not JSON
    }
    return { status: res.status, headers: res.headers, json, text };
  }

  // A teacher or an admin with a session cookie.
  async function person(name, role = 'teacher') {
    const { id, code } = config.auth.addCode(name, role);
    const user = await config.auth.login(code);
    return { id, user, cookie: config.auth.sign(user) };
  }

  return { url, call, person, config, store, dir, server };
}

// Answers for a complete create flow (formative, AI as counterpart).
function respostasCompletas() {
  return {
    contexto: {
      uc: 'Bioética Clínica',
      programa: 'Mestrado em Bioética, 1.º ano',
      area: 'bioetica',
      nivel: 'uc_master',
      estudantes: 24,
      modalidade: 'em_aula',
      duracao_min: 40,
      duracao_max: 50,
    },
    objectivo: {
      texto: 'No fim da actividade, o estudante sustenta uma posição sobre uma questão controversa e responde às objecções mais fortes.',
      competencia_protegida: 'A competência protegida é a argumentação.',
      competencia: 'Argumentação fundamentada',
    },
    evidencia: { descricao: 'Resposta escrita a cada objecção, discutida em plenário.', avaliacao: 'formativa' },
    papel_ia: { papel: 'contraparte' },
    regime: { regime: 'permitido' },
    padrao: { padrao: 'advogado_diabo' },
    materiais: {},
    plano: { titulo: 'Debate sobre o fim de vida', subtitulo: 'Argumentação e antecipação de objecções' },
  };
}

module.exports = { startApp, respostasCompletas, BASE, SECRET };
