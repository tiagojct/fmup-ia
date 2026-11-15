'use strict';

// Starts the server from the environment (names in .env.example). It refuses to start without
// EUNOMIA_SECRET of 32 or more characters: exit code 1 and a message on stderr.

const { createStore } = require('./store.js');
const { createAuth } = require('./auth.js');
const { createIaeduClient, DEFAULT_BASE_URL } = require('./iaedu.js');
const { createServer } = require('./server.js');

const PORT = 3000;

class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
  }
}

function text(env, name, fallback) {
  const value = typeof env[name] === 'string' ? env[name].trim() : '';
  return value === '' ? fallback : value;
}

function positiveInt(env, name, fallback) {
  const value = text(env, name, null);
  if (value === null) return fallback;
  if (!/^[1-9]\d*$/.test(value)) throw new ConfigError(`${name} tem de ser um número inteiro positivo.`);
  return Number(value);
}

function loadConfig(env = process.env) {
  const secret = env.EUNOMIA_SECRET;
  if (typeof secret !== 'string' || secret.length < 32) {
    throw new ConfigError('EUNOMIA_SECRET em falta ou com menos de 32 caracteres. O servidor não arranca sem ele.');
  }
  return {
    secret,
    dataDir: text(env, 'EUNOMIA_DATA', './data'),
    dailyLimit: positiveInt(env, 'EUNOMIA_DAILY_LIMIT', 200),
    draftRetentionDays: positiveInt(env, 'EUNOMIA_DRAFT_RETENTION_DAYS', 365),
    iaeduBaseUrl: text(env, 'IAEDU_BASE_URL', DEFAULT_BASE_URL),
    basePath: '/fmup-ia/eunomia/api',
    github: {
      token: text(env, 'GITHUB_TOKEN', null),
      repo: text(env, 'GITHUB_REPO', 'tiagojct/fmup-ia'),
      branch: text(env, 'GITHUB_BRANCH', 'main'),
      commitName: text(env, 'COMMIT_NAME', null),
      commitEmail: text(env, 'COMMIT_EMAIL', null),
    },
  };
}

// Resolves with the server, already listening. Rejects with a ConfigError, or with the error of
// the data folder or of the port.
async function start(env = process.env, { port = PORT, host, logStream } = {}) {
  const cfg = loadConfig(env);
  const store = createStore(cfg.dataDir);
  try {
    store.write('.sonda.json', { ok: true }); // a data folder that cannot be written is found now, not at the first login
    store.remove('.sonda.json');
  } catch (e) {
    throw new ConfigError(`A pasta de dados não é gravável (${cfg.dataDir}): ${e.code || e.message}`);
  }
  const auth = createAuth({ store, secret: cfg.secret, dailyLimit: cfg.dailyLimit });
  const iaedu = createIaeduClient({ baseUrl: cfg.iaeduBaseUrl });
  // The server needs the IAEDU_* values only. It does not get the secret or the GitHub token.
  const iaeduEnv = Object.fromEntries(Object.entries(env).filter(([name]) => name.startsWith('IAEDU_')));
  const server = createServer({
    basePath: cfg.basePath,
    store,
    auth,
    iaedu,
    github: cfg.github,
    now: Date.now,
    env: iaeduEnv,
    draftRetentionDays: cfg.draftRetentionDays,
    logStream,
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  return server;
}

async function main() {
  let server;
  try {
    server = await start(process.env);
  } catch (e) {
    process.stderr.write(`${e instanceof ConfigError ? e.message : `Erro ao arrancar: ${e.message}`}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`${JSON.stringify({ evento: 'arranque', porta: server.address().port })}\n`);
  const stop = () => {
    server.close(() => process.exit(0));
    server.closeIdleConnections();
    setTimeout(() => process.exit(0), 10000).unref();
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}

if (require.main === module) main();

module.exports = { loadConfig, start, ConfigError };
