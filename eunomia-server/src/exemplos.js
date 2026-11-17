'use strict';

// The worked examples (eunomia/exemplos.json, spec B): for each of the seven reference fichas, the
// interview answers that lead to it, with one line on why each answer. Examples 1 to 6 follow the
// six training fichas; example 7 (an activity without AI) is written for Eunomia and is fictitious.
// The same file feeds the tutorial, "Ver exemplo" on each step and "Começar a partir deste
// exemplo". No model call.
//
// Exemplo = { n: 1..7, titulo, respostas: { [passo]: valor }, porque: { [passo]: string },
//             nota?: { [passo]: string } }
//   nota marks an answer that the ficha does not state.

const fs = require('node:fs');
const path = require('node:path');
const { repoPath } = require('./paths.js');
const drafts = require('./drafts.js');

const EXEMPLOS = JSON.parse(fs.readFileSync(repoPath('eunomia', 'exemplos.json'), 'utf8'));

const MAX_EXAMPLE = 7;

// The example with this number, or null. Only an integer from 1 to 7: "1" or 1.5 is null.
function findExample(n) {
  if (!Number.isInteger(n) || n < 1 || n > MAX_EXAMPLE) return null;
  return EXEMPLOS.exemplos.find((e) => e.n === n) || null;
}

const FICHAS = new Map();

// The reference ficha N (eunomia-server/referencia/ficha-N.json), read once. Null for another n.
function referenceFicha(n) {
  if (!findExample(n)) return null;
  if (!FICHAS.has(n)) {
    const file = path.join(__dirname, '..', 'referencia', `ficha-${n}.json`);
    FICHAS.set(n, JSON.parse(fs.readFileSync(file, 'utf8')));
  }
  return FICHAS.get(n);
}

// A new draft with the answers of example n, step by step in the interview order. The plan is not
// approved: the teacher reviews every step. An answer that fails the validation is a bug in
// exemplos.json, so it throws.
function draftFromExample(user, n, now = Date.now()) {
  const e = findExample(n);
  if (!e) throw new TypeError(`Exemplo desconhecido: ${n}.`);
  let d = drafts.createDraft(user, 'criar', now);
  for (const step of drafts.INTERVIEW.passos) {
    if (e.respostas[step.id] === undefined) continue;
    const r = drafts.applyAnswer(d, step.id, e.respostas[step.id]);
    if (r.errors.length > 0) throw new Error(`exemplos.json: passo ${step.id}: ${r.errors.join(' ')}`);
    d = r.draft;
  }
  return d;
}

module.exports = { EXEMPLOS, findExample, referenceFicha, draftFromExample };
