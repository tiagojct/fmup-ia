'use strict';

// One section from the model (design, 6.4): call, parse the JSON, validate the section against the
// schema (new profile, with the meta of the plan for the duration rule), run the lints on the
// rendered text. On errors, one retry with the error list. After the second failure the last result
// comes back with its problems as avisos, for the teacher to edit.

const crypto = require('node:crypto');
const { parseJsonReply, IaeduError } = require('./iaedu.js');
const { validateSection, renderSection } = require('./ficha.js');
const { lintSection } = require('./lint.js');
const { buildMeta } = require('./assemble.js');
const prompts = require('./prompts.js');

// Lint rules that make the server ask again. Numbers are only flagged: the teacher confirms them.
const RETRY_RULES = new Set(['lingua', 'estilo', 'referencia']);

const newThreadId = () => `thr-${crypto.randomUUID()}`;

function materialsOf(draft) {
  const m = draft.respostas && draft.respostas.materiais;
  return m && typeof m.texto === 'string' ? m.texto : '';
}

// The model sometimes wraps the answer in an object named after the section.
function unwrap(sectionId, data) {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const keys = Object.keys(data);
    if (keys.length === 1 && keys[0] === sectionId) return data[sectionId];
  }
  return data;
}

// The problems of one reply: { errors: [texts for the retry], avisos: [{ regra, texto, trecho? }] }.
function check(sectionId, data, draft) {
  const avisos = validateSection(sectionId, data, 'new', { meta: buildMeta(draft) }).map((texto) => ({ regra: 'esquema', texto }));
  let lints = [];
  try {
    const md = renderSection(sectionId, data);
    lints = lintSection(sectionId, md, { referencias: draft.referencias || [], materials: materialsOf(draft) });
  } catch {
    // data that does not render already has schema errors
  }
  for (const w of lints) avisos.push({ regra: w.rule, texto: w.message, trecho: w.match });
  const errors = avisos
    .filter((a) => a.regra === 'esquema' || RETRY_RULES.has(a.regra))
    .map((a) => (a.trecho ? `${a.texto} (${a.trecho})` : a.texto));
  return { errors, avisos };
}

// opts = { draft, sectionId, client, creds, comentario?, beforeCall? }
// beforeCall runs before each model call (the daily count); if it throws before the retry, the first
// result comes back with its avisos. Returns { dados, avisos, modelo, threadId, chamadas }.
async function generateSection({ draft, sectionId, client, creds, comentario, beforeCall = () => {} }) {
  const current = draft.seccoes && draft.seccoes[sectionId];
  const anterior = comentario && current && current.dados !== undefined ? current.dados : undefined;
  const base = prompts.writeSection(sectionId, prompts.planText(draft), materialsOf(draft), comentario, anterior, draft);
  const threadId = newThreadId();

  const ask = async (message) => {
    const reply = await client.send({ key: creds.key, agentId: creds.agentId, channelId: creds.channelId, threadId, message });
    let data;
    try {
      data = unwrap(sectionId, parseJsonReply(reply.text));
    } catch (e) {
      if (!(e instanceof IaeduError)) throw e;
      return { model: reply.model, data: undefined, errors: ['A resposta não era JSON válido.'], avisos: [] };
    }
    return { model: reply.model, data, ...check(sectionId, data, draft) };
  };

  await beforeCall();
  const first = await ask(base);
  if (first.errors.length === 0) return result(first, threadId, 1);

  try {
    await beforeCall();
  } catch (e) {
    if (first.data === undefined) throw e;
    const limite = { regra: 'limite', texto: 'Não foi possível pedir uma correcção ao modelo: atingiu o limite diário de pedidos.' };
    return result({ ...first, avisos: [...first.avisos, limite] }, threadId, 1);
  }
  const retry = join(base, first.errors);
  const second = await ask(retry);
  if (second.data === undefined) {
    if (first.data === undefined) throw new IaeduError('formato');
    return result(first, threadId, 2);
  }
  return result(second, threadId, 2);
}

function join(base, errors) {
  return `${base}\n\nA resposta anterior tinha estes problemas. Corrija-os e devolva só o JSON da secção:\n${errors.map((e) => `- ${e}`).join('\n')}`;
}

function result(r, threadId, chamadas) {
  return { dados: r.data, avisos: r.avisos, modelo: r.model || null, threadId, chamadas };
}

module.exports = { generateSection, newThreadId, check };
