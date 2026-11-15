'use strict';

// One JSON line for each request: method, path, status and the time in milliseconds.
// The line is built from these four values only. It never holds a query string, a header
// (cookie, x-iaedu-*), a body or an access code: the draft text and the keys must not reach the logs.

function pathOf(url) {
  const raw = String(url ?? '');
  const end = raw.search(/[?#]/);
  return (end === -1 ? raw : raw.slice(0, end)).slice(0, 200);
}

function logRequest(req, status, ms, out = process.stdout) {
  const line = {
    method: String(req.method ?? '').slice(0, 16),
    path: pathOf(req.url),
    status,
    ms: Math.round(ms * 10) / 10,
  };
  out.write(`${JSON.stringify(line)}\n`);
}

// An unexpected error. The message of an error can hold a key or a piece of a draft (a parse error
// quotes the text), so the line has the error type, its code and the first frames of the stack.
function logError(e, out = process.stderr) {
  const frames = String((e && e.stack) || '')
    .split('\n')
    .filter((l) => /^\s+at /.test(l))
    .slice(0, 3)
    .map((l) => l.trim());
  const line = { evento: 'erro', tipo: (e && e.name) || 'Error', codigo: (e && e.code) || null, onde: frames };
  out.write(`${JSON.stringify(line)}\n`);
}

module.exports = { logRequest, logError };
