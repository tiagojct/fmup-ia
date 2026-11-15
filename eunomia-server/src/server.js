'use strict';

// The HTTP server of Eunomia: plain node:http, JSON in and out, one route table.
//
// Adding a route (later tasks): add a line to registerRoutes() below, or write a module that
// exports (route, config) and call it from there.
//
//   route(method, pattern, handler, access)
//     pattern   a path under basePath, with ":name" for a segment: '/rascunhos/:id'.
//     access    'user' (default: a valid session), 'admin' (a session of an admin) or 'public'.
//     handler   (req, res, ctx) => data | Promise<data>
//               ctx = { user, params, body, creds, credsError, query }
//                 user     { id, name, role }, null on a public route
//                 params   the decoded values of the ":name" segments
//                 body     the parsed JSON object, {} when the request has no body (1 MB limit)
//                 creds    { key, agentId, channelId, source: 'own' | 'shared' | 'alt' } or null.
//                          Use requireCreds(ctx) in a route that calls the model.
//                 query    URLSearchParams
//               Return data to send it as JSON with status 200, throw HttpError(status, text) for
//               an error, or write the response with res and return nothing.
//
// Errors are JSON: { erro: "<texto em português>" }. The key, the agent and the channel of the
// own-key mode (headers X-Iaedu-*) are read for the request and never stored or logged.

const http = require('node:http');
const { COOKIE_NAME, SESSION_MS } = require('./auth.js');
const { IaeduError } = require('./iaedu.js');
const { logRequest, logError } = require('./log.js');
const { registerDraftRoutes } = require('./draft-routes.js');

const MAX_BODY = 1024 * 1024;
const DEFAULT_BASE_PATH = '/fmup-ia/eunomia/api';
const DEFAULT_COOKIE_PATH = '/fmup-ia/eunomia';
const DEFAULT_LIMITS = { loginPerMinute: 5, requestsPerMinute: 120 };

// extra: more fields for the JSON body next to erro, for example { erros: [...] } or { motivo }.
class HttpError extends Error {
  constructor(status, erro, headers = {}, extra = {}) {
    super(erro);
    this.name = 'HttpError';
    this.status = status;
    this.erro = erro;
    this.headers = headers;
    this.extra = extra;
  }
}

// The upstream errors of the IAedu client. They are never 401: for the front end that means
// "log in again". The reason goes in "motivo" so that the front end can tell a wrong key from a limit.
const IAEDU_STATUS = { auth: 502, limite: 429, servico: 502, tempo: 504, formato: 502 };

// ---------------------------------------------------------------- helpers

function sendJson(res, status, data, headers = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(body);
}

function cookieValue(req) {
  const header = req.headers.cookie;
  if (typeof header !== 'string') return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i !== -1 && part.slice(0, i).trim() === COOKIE_NAME) return part.slice(i + 1).trim();
  }
  return null;
}

// The address that counts for the login limit: the first entry of X-Forwarded-For (Caddy and
// Cloudflare are in front of the server), else the address of the socket.
function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const first = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : '';
  return (first || req.socket.remoteAddress || 'desconhecido').slice(0, 64);
}

function sessionCookie(value, cookiePath, maxAge) {
  return `${COOKIE_NAME}=${value}; HttpOnly; Secure; SameSite=Strict; Path=${cookiePath}; Max-Age=${maxAge}`;
}

function splitUrl(url) {
  const raw = String(url ?? '');
  const i = raw.indexOf('?');
  const pathname = i === -1 ? raw : raw.slice(0, i);
  const query = new URLSearchParams(i === -1 ? '' : raw.slice(i + 1).split('#')[0]);
  return { pathname, query };
}

// Reads the body up to the limit. After the limit it answers at once and discards the rest of
// the upload, so the connection stays usable and the client can read the 413.
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    const cleanup = () => {
      req.removeListener('data', onData);
      req.removeListener('end', onEnd);
      req.removeListener('error', onError);
      req.removeListener('close', onClose);
    };
    const tooLarge = () => {
      cleanup();
      req.resume();
      req.on('error', () => {});
      reject(new HttpError(413, 'O pedido é demasiado grande.'));
    };
    const onData = (chunk) => {
      size += chunk.length;
      if (size > limit) return tooLarge();
      chunks.push(chunk);
    };
    const onEnd = () => {
      cleanup();
      resolve(Buffer.concat(chunks));
    };
    const onError = () => {
      cleanup();
      reject(new HttpError(400, 'O pedido foi interrompido.'));
    };
    // 'close' after 'end' is normal; before the end the client has gone.
    const onClose = () => {
      if (!req.complete) onError();
    };

    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > limit) return tooLarge();
    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);
    req.on('close', onClose);
  });
}

// The body as a JSON object. No body is {}. A body needs the JSON content type: a form post from
// another site cannot send it without a preflight, which is a second guard next to SameSite.
async function readJson(req) {
  const buffer = await readBody(req, MAX_BODY);
  const text = buffer.toString('utf8');
  if (text.trim() === '') return {};
  if (!/^application\/json\s*(;|$)/i.test(req.headers['content-type'] || '')) {
    throw new HttpError(415, 'O pedido tem de ser JSON (Content-Type: application/json).');
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new HttpError(400, 'O corpo do pedido não é JSON válido.');
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'O corpo do pedido tem de ser um objecto JSON.');
  }
  return value;
}

// ---------------------------------------------------------------- IAedu credentials

// Own-key headers win. Without them, the shared set from the environment. ?modelo=amalia selects
// the IAEDU_ALT_* set. Own-key headers that are not all there are an error and never fall back
// to the shared key: the teacher would spend the shared quota without knowing it.
function resolveCreds(req, query, env) {
  const header = (name) => {
    const v = req.headers[name];
    return typeof v === 'string' ? v.trim() : '';
  };
  const own = { key: header('x-iaedu-key'), agentId: header('x-iaedu-agent'), channelId: header('x-iaedu-channel') };
  if (own.key || own.agentId || own.channelId) {
    if (own.key && own.agentId && own.channelId) return { creds: { ...own, source: 'own' }, error: null };
    return { creds: null, error: new HttpError(400, 'Indique a chave, o ID do agente e o ID do canal IAedu.') };
  }

  const modelo = query.get('modelo') || '';
  if (modelo !== '' && modelo !== 'amalia') return { creds: null, error: new HttpError(400, 'Modelo desconhecido.') };
  const alt = modelo === 'amalia';
  const prefix = alt ? 'IAEDU_ALT_' : 'IAEDU_';
  const set = { key: env[`${prefix}API_KEY`], agentId: env[`${prefix}AGENT_ID`], channelId: env[`${prefix}CHANNEL_ID`] };
  if (set.key && set.agentId && set.channelId) return { creds: { ...set, source: alt ? 'alt' : 'shared' }, error: null };
  const text = alt
    ? 'O modelo AMALIA não está configurado neste servidor.'
    : 'O modelo não está configurado neste servidor. Indique a sua própria chave IAedu nas definições.';
  return { creds: null, error: new HttpError(503, text) };
}

// For a route that calls the model: the credentials, or the error that says why there are none.
function requireCreds(ctx) {
  if (ctx.creds) return ctx.creds;
  throw ctx.credsError || new HttpError(503, 'O modelo não está configurado neste servidor.');
}

// ---------------------------------------------------------------- routes

// The one route table. Each route is private (a session is needed) unless it says 'public'.
function registerRoutes(route, config) {
  const { auth, limits } = config;
  const cookiePath = config.cookiePath ?? DEFAULT_COOKIE_PATH;
  const person = (u) => ({ id: u.id, nome: u.name, perfil: u.role });

  route('GET', '/saude', () => ({ ok: true }), 'public');

  route(
    'POST',
    '/login',
    async (req, res, ctx) => {
      if (!auth.rateLimit(`login:${clientIp(req)}`, limits.loginPerMinute)) {
        throw new HttpError(429, 'Demasiadas tentativas. Tente de novo daqui a um minuto.', { 'Retry-After': '60' });
      }
      if (typeof ctx.body.codigo !== 'string' || ctx.body.codigo.trim() === '') {
        throw new HttpError(400, 'Indique o código de acesso.');
      }
      const user = await auth.login(ctx.body.codigo);
      if (!user) throw new HttpError(401, 'Código inválido.');
      res.setHeader('Set-Cookie', sessionCookie(auth.sign(user), cookiePath, SESSION_MS / 1000));
      return person(user);
    },
    'public',
  );

  // Sessions are signed, not stored: a logout removes the cookie from the browser. A code that is
  // revoked ends its sessions at once, because verify() reads the code on each request.
  route(
    'POST',
    '/logout',
    (req, res) => {
      res.setHeader('Set-Cookie', sessionCookie('', cookiePath, 0));
      return { ok: true };
    },
    'public',
  );

  route('GET', '/me', (req, res, ctx) => person(ctx.user));

  route(
    'GET',
    '/codigos',
    () => ({
      codigos: auth.list().map((c) => ({ id: c.id, nome: c.name, perfil: c.role, criado: c.created, revogado: c.revoked })),
    }),
    'admin',
  );

  route(
    'POST',
    '/codigos',
    (req, res, ctx) => {
      const { nome, admin } = ctx.body;
      if (typeof nome !== 'string' || nome.trim() === '') throw new HttpError(400, 'Indique o nome.');
      if (admin !== undefined && typeof admin !== 'boolean') throw new HttpError(400, 'O campo "admin" tem de ser verdadeiro ou falso.');
      let made;
      try {
        made = auth.addCode(nome, admin ? 'admin' : 'teacher');
      } catch (e) {
        if (e instanceof TypeError) throw new HttpError(400, e.message); // the messages of addCode are for the user
        throw e;
      }
      sendJson(res, 201, { id: made.id, codigo: made.code });
    },
    'admin',
  );

  route(
    'DELETE',
    '/codigos/:id',
    (req, res, ctx) => {
      if (!auth.revoke(ctx.params.id)) throw new HttpError(404, 'Código não encontrado.');
      return { ok: true };
    },
    'admin',
  );

  // The drafts, the interview and the sections (Tasks 7 and 9). The module gets the helpers it
  // needs from here, so that it does not require this file.
  registerDraftRoutes(route, config, { HttpError, requireCreds, sendJson });
}

// ---------------------------------------------------------------- the server

function compile(pattern) {
  const names = [];
  const source = pattern
    .split('/')
    .map((segment) => {
      if (segment.startsWith(':')) {
        names.push(segment.slice(1));
        return '([^/]+)';
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return { regex: new RegExp(`^${source}$`), names };
}

// config = { basePath, store, auth, iaedu, github, now, env, limits, logStream, errorStream, routes }
// Only store and auth are needed here. env holds IAEDU_* (default process.env). logStream and
// errorStream take the request log and the error log (default stdout and stderr). routes is a
// function (route, config) that adds routes: for tests and for modules of later tasks.
function createServer(config) {
  if (!config || !config.store || !config.auth) throw new TypeError('createServer precisa de store e auth.');
  const cfg = {
    basePath: DEFAULT_BASE_PATH,
    now: Date.now,
    env: process.env,
    ...config,
    limits: { ...DEFAULT_LIMITS, ...config.limits },
  };
  const basePath = String(cfg.basePath).replace(/\/+$/, '');
  const logOut = cfg.logStream || process.stdout;
  const errOut = cfg.errorStream || process.stderr;

  const routes = [];
  const route = (method, pattern, handler, access = 'user') => {
    if (!['public', 'user', 'admin'].includes(access)) throw new TypeError(`Acesso desconhecido: ${access}`);
    routes.push({ method, access, handler, ...compile(pattern) });
  };
  registerRoutes(route, cfg);
  if (typeof cfg.routes === 'function') cfg.routes(route, cfg);

  // The route for a path under basePath, or what is known about the path.
  function match(method, pathname) {
    if (pathname !== basePath && !pathname.startsWith(`${basePath}/`)) return { found: null, allowed: [] };
    let local = pathname.slice(basePath.length) || '/';
    if (local.length > 1 && local.endsWith('/')) local = local.slice(0, -1);
    const allowed = [];
    for (const r of routes) {
      const m = r.regex.exec(local);
      if (!m) continue;
      if (r.method === method || (method === 'HEAD' && r.method === 'GET')) {
        let params;
        try {
          params = Object.fromEntries(r.names.map((name, i) => [name, decodeURIComponent(m[i + 1])]));
        } catch {
          return { found: null, allowed: [] }; // a bad percent sequence matches nothing
        }
        return { found: r, params };
      }
      allowed.push(r.method);
    }
    return { found: null, allowed };
  }

  async function handle(req, res) {
    const { pathname, query } = splitUrl(req.url);
    const { found, params, allowed } = match(req.method, pathname);
    if (!found) {
      if (allowed.length > 0) throw new HttpError(405, 'Método não permitido.', { Allow: [...new Set(allowed)].join(', ') });
      throw new HttpError(404, 'Não encontrado.');
    }

    let user = null;
    if (found.access !== 'public') {
      user = cfg.auth.verify(cookieValue(req));
      if (!user) throw new HttpError(401, 'Sessão inválida ou expirada. Inicie sessão.');
      if (found.access === 'admin' && user.role !== 'admin') throw new HttpError(403, 'Sem permissão para esta operação.');
      if (!cfg.auth.rateLimit(`req:${user.id}`, cfg.limits.requestsPerMinute)) {
        throw new HttpError(429, 'Demasiados pedidos. Espere um momento.', { 'Retry-After': '60' });
      }
    }

    const body = await readJson(req);
    const { creds, error: credsError } = resolveCreds(req, query, cfg.env);
    const result = await found.handler(req, res, { user, params, body, creds, credsError, query });

    if (result !== undefined && !res.headersSent) sendJson(res, 200, result);
    else if (!res.headersSent) throw new Error('A rota não respondeu.');
  }

  function fail(res, e) {
    if (res.headersSent) {
      res.destroy(); // too late for a JSON error
      return;
    }
    if (e instanceof HttpError) return sendJson(res, e.status, { ...e.extra, erro: e.erro }, e.headers);
    if (e instanceof IaeduError) return sendJson(res, IAEDU_STATUS[e.code] || 502, { erro: e.messagePt, motivo: e.code });
    logError(e, errOut);
    sendJson(res, 500, { erro: 'Erro interno do servidor.' });
  }

  const server = http.createServer((req, res) => {
    const started = process.hrtime.bigint();
    let logged = false;
    const done = (status) => {
      if (logged) return;
      logged = true;
      logRequest(req, status, Number(process.hrtime.bigint() - started) / 1e6, logOut);
    };
    res.on('finish', () => done(res.statusCode));
    res.on('close', () => done(499)); // the client left before the reply was sent
    handle(req, res).catch((e) => fail(res, e));
  });
  // Caddy keeps connections to the upstream open for a long time; a shorter timeout here gives 502s.
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;
  return server;
}

module.exports = { createServer, requireCreds, HttpError, MAX_BODY };
