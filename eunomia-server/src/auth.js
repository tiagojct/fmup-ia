'use strict';

// Access codes, sessions and limits.
//
//   codes.json   { codes: [{ id, name, role, created, salt, hash }] }. A code is 12 characters of
//                an alphabet without 0, O, 1, I. Only a scrypt hash with a salt of its own is
//                kept. A revoked entry keeps id, name, role, created and revoked; salt and hash go.
//                The file is read on each call, so a code that bin/codes.js adds or revokes in
//                another process works at once.
//   usage.json   { "<YYYY-MM-DD>": { "<id>": <model calls> } }, UTC days, the last 31 days.
//   Sessions     a cookie value "<base64url(payload)>.<base64url(hmac-sha256)>", payload { id, exp }.
//                The user is read from codes.json on each verify: a revoked code ends its sessions.
//   Rate limits  in memory, a sliding window of one minute.
//
// login() is async: scrypt runs on the thread pool and does not block other requests, and a login
// tries each active code. Everything else is synchronous. now is a function that returns
// milliseconds, as Date.now does; tests inject it.

const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 characters: one byte & 31 has no bias
const CODE_LENGTH = 12;
const CODE_FORMAT = new RegExp(`^[${ALPHABET}]{${CODE_LENGTH}}$`);
const ROLES = ['teacher', 'admin'];
const KEY_LENGTH = 32;
const COOKIE_NAME = 'eunomia';
const SESSION_MS = 12 * 60 * 60 * 1000;
const WINDOW_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const USAGE_DAYS = 31;
const MAX_NAME_LENGTH = 100;

function generateCode() {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let code = '';
  for (const byte of bytes) code += ALPHABET[byte & 31];
  return code;
}

// What a person may type: any case, with spaces or hyphens. Null when it cannot be a code.
function normalizeCode(input) {
  if (typeof input !== 'string' || input.length > 64) return null;
  const code = input.toUpperCase().replace(/[\s-]+/g, '');
  return CODE_FORMAT.test(code) ? code : null;
}

function sameBytes(a, b) {
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function userOf(entry) {
  return { id: entry.id, name: entry.name, role: entry.role };
}

function createAuth({ store, secret, dailyLimit = 200, now = Date.now } = {}) {
  if (!store) throw new TypeError('O armazenamento é obrigatório.');
  if (typeof secret !== 'string' || secret.length < 32) {
    throw new TypeError('O segredo da sessão tem de ter pelo menos 32 caracteres.');
  }
  if (!Number.isInteger(dailyLimit) || dailyLimit < 1) {
    throw new TypeError('O limite diário de chamadas ao modelo tem de ser um número inteiro positivo.');
  }

  // ------------------------------------------------------------ codes

  function readCodes() {
    const file = store.read('codes.json', { codes: [] });
    if (!file || !Array.isArray(file.codes)) throw new Error('codes.json inválido: falta a lista "codes".');
    return file;
  }

  function addCode(name, role = 'teacher') {
    if (typeof name !== 'string' || name.trim() === '') throw new TypeError('O nome é obrigatório.');
    const clean = name.trim().replace(/\s+/g, ' ');
    if (clean.length > MAX_NAME_LENGTH) throw new TypeError(`O nome tem de ter no máximo ${MAX_NAME_LENGTH} caracteres.`);
    if (!ROLES.includes(role)) throw new TypeError(`Perfil inválido. Perfis: ${ROLES.join(', ')}.`);

    const file = readCodes();
    let id = crypto.randomBytes(4).toString('hex');
    while (file.codes.some((c) => c.id === id)) id = crypto.randomBytes(4).toString('hex');

    const code = generateCode();
    const salt = crypto.randomBytes(16);
    const hash = crypto.scryptSync(code, salt, KEY_LENGTH);
    file.codes.push({
      id,
      name: clean,
      role,
      created: new Date(now()).toISOString(),
      salt: salt.toString('hex'),
      hash: hash.toString('hex'),
    });
    store.write('codes.json', file);
    return { id, code };
  }

  // True when an active code was revoked.
  function revoke(id) {
    const file = readCodes();
    const entry = file.codes.find((c) => c.id === id && !c.revoked);
    if (!entry) return false;
    entry.revoked = new Date(now()).toISOString();
    delete entry.salt;
    delete entry.hash;
    store.write('codes.json', file);
    return true;
  }

  function list() {
    return readCodes().codes.map((c) => ({
      id: c.id,
      name: c.name,
      role: c.role,
      created: c.created,
      revoked: c.revoked || null,
    }));
  }

  // The user of the code, or null. Every active code is checked, each with its own salt.
  async function login(code) {
    const normal = normalizeCode(code);
    if (!normal) return null;
    const active = readCodes().codes.filter((c) => !c.revoked && c.salt && c.hash);
    const matches = await Promise.all(
      active.map(async (c) => {
        const derived = await scrypt(normal, Buffer.from(c.salt, 'hex'), KEY_LENGTH);
        return sameBytes(derived, Buffer.from(c.hash, 'hex')) ? c.id : null;
      }),
    );
    const id = matches.find(Boolean);
    if (!id) return null;
    // The code may have been revoked while the hashes ran.
    const entry = readCodes().codes.find((c) => c.id === id && !c.revoked);
    return entry ? userOf(entry) : null;
  }

  // ------------------------------------------------------------ sessions

  function mac(payload) {
    return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  }

  function sign(user) {
    if (!user || typeof user.id !== 'string' || user.id === '') throw new TypeError('Utilizador inválido.');
    const payload = Buffer.from(JSON.stringify({ id: user.id, exp: now() + SESSION_MS })).toString('base64url');
    return `${payload}.${mac(payload)}`;
  }

  function verify(value) {
    if (typeof value !== 'string' || value.length > 1024) return null;
    const parts = value.split('.');
    if (parts.length !== 2) return null;
    const [payload, signature] = parts;
    if (!/^[A-Za-z0-9_-]+$/.test(payload) || !/^[A-Za-z0-9_-]+$/.test(signature)) return null;
    if (!sameBytes(Buffer.from(mac(payload)), Buffer.from(signature))) return null;
    let data;
    try {
      data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    } catch {
      return null;
    }
    if (!data || typeof data.id !== 'string' || !Number.isFinite(data.exp) || data.exp <= now()) return null;
    const entry = readCodes().codes.find((c) => c.id === data.id && !c.revoked);
    return entry ? userOf(entry) : null;
  }

  // ------------------------------------------------------------ limits

  function today() {
    return new Date(now()).toISOString().slice(0, 10);
  }

  // Counts one model call for the user, unless the limit of the UTC day is reached. A refused call
  // is not counted. The count is written before the call goes ahead.
  function countModelCall(userId) {
    if (typeof userId !== 'string' || userId === '') throw new TypeError('Utilizador inválido.');
    const day = today();
    const usage = Object.assign(Object.create(null), store.read('usage.json', {}));
    const counts = Object.assign(Object.create(null), usage[day]);
    const used = Number.isInteger(counts[userId]) ? counts[userId] : 0;
    if (used >= dailyLimit) return { ok: false, used, limit: dailyLimit };

    counts[userId] = used + 1;
    const oldest = new Date(now() - (USAGE_DAYS - 1) * DAY_MS).toISOString().slice(0, 10);
    const kept = {};
    for (const key of Object.keys(usage).sort()) if (key >= oldest) kept[key] = usage[key];
    kept[day] = counts;
    store.write('usage.json', kept);
    return { ok: true, used: used + 1, limit: dailyLimit };
  }

  const hits = new Map();

  // True when the call is allowed. A refused call is not counted, so the window opens again one
  // minute after the oldest counted call.
  function rateLimit(key, perMinute) {
    if (typeof key !== 'string' || key === '') throw new TypeError('Chave de limite inválida.');
    if (!Number.isInteger(perMinute) || perMinute < 1) throw new TypeError('O limite por minuto tem de ser um número inteiro positivo.');
    const t = now();
    const since = t - WINDOW_MS;
    const recent = (hits.get(key) || []).filter((x) => x > since);
    if (recent.length >= perMinute) {
      hits.set(key, recent);
      return false;
    }
    recent.push(t);
    hits.set(key, recent);
    if (hits.size > 5000) {
      for (const [k, v] of hits) if (v[v.length - 1] <= since) hits.delete(k);
    }
    return true;
  }

  return { addCode, revoke, list, login, sign, verify, countModelCall, rateLimit };
}

module.exports = { createAuth, COOKIE_NAME, SESSION_MS, ALPHABET };
