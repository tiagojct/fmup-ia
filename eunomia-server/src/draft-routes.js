'use strict';

// Routes of the drafts and the interview. registerDraftRoutes(route, config, helpers) is called from
// registerRoutes in server.js; helpers = { HttpError, requireCreds, sendJson }.
//
// Concurrency: every write sends the rev it read. A different rev is 409, so two windows on the same
// draft cannot overwrite each other. Only the author writes a draft; an admin may read any draft.

const drafts = require('./drafts.js');
const { CATALOGUE, filterPatterns } = require('./patterns.js');
const { IaeduError, parseJsonReply } = require('./iaedu.js');
const { validateSection, validateFicha, renderSection, renderQmd, slugify, SECTION_HEADINGS } = require('./ficha.js');
const { lintEmoji, lintSection } = require('./lint.js');
const { composeRegime } = require('./regime.js');
const { REFERENCES, buildMeta, assembleFicha, sectionsToAccept } = require('./assemble.js');
const { generateSection, newThreadId, hasControl, CONTROL_MESSAGE } = require('./generate.js');
const { renderMd, renderHtml } = require('./export.js');
const prompts = require('./prompts.js');

const CONFLICT = 'O rascunho foi alterado noutra janela. Recarregue a página.';
const LOCKED = 'A ficha foi submetida e não pode ser alterada.';
const LIMIT = 'Atingiu o limite diário de pedidos ao modelo.';
const NO_EMOJI = 'Retire os emojis do texto.';
const FEW_PATTERNS = 'Há menos de dois padrões do catálogo para este papel da IA e este tempo. Veja o catálogo completo.';

// Every 409 says why, so that the front end offers "Recarregar" only for a stale rev:
// rev (another window changed the draft), bloqueado (submitted), plano (plan not approved),
// passo (a step has no answer), incompleto (a section has no accepted text), invalido (the data
// of a section breaks the schema).
const CODE_SECTIONS = ['meta', 'regime_ia', 'referencias', 'declaracao'];
const MAX_REFERENCES = 20;
const MAX_COMMENT = 2000;
const EXPORTS = {
  qmd: { type: 'text/plain; charset=utf-8', body: renderQmd },
  md: { type: 'text/markdown; charset=utf-8', body: renderMd },
  html: { type: 'text/html; charset=utf-8', body: renderHtml },
};

function registerDraftRoutes(route, config, { HttpError, sendJson, requireCreds }) {
  const { store } = config;
  const now = () => (config.now ? config.now() : Date.now());

  const view = (d, extra = {}) => ({
    rascunho: d,
    proximo_passo: drafts.nextStep(d),
    plano: drafts.planSummary(d),
    ...extra,
  });

  // The draft for reading: the author's own, or any draft for an admin.
  function readable(ctx) {
    const d = drafts.findDraft(store, ctx.user, ctx.params.id);
    if (!d) throw new HttpError(404, 'Rascunho não encontrado.');
    return d;
  }

  // The draft for writing: only the author, only in an editable state, only at the same rev.
  function writable(ctx) {
    const d = readable(ctx);
    if (d.autor.id !== ctx.user.id) throw new HttpError(403, 'Só o autor pode alterar este rascunho.');
    if (!drafts.isEditable(d)) throw new HttpError(409, LOCKED, {}, { motivo: 'bloqueado' });
    const { rev } = ctx.body;
    if (!Number.isInteger(rev)) throw new HttpError(400, 'Indique a revisão do rascunho (rev).');
    if (rev !== d.rev) throw new HttpError(409, CONFLICT, {}, { motivo: 'rev' });
    return d;
  }

  const save = (d) => drafts.saveDraft(store, d, now());

  // The author's draft in an editable state, for a model call that does not change it.
  function owned(ctx) {
    const d = readable(ctx);
    if (d.autor.id !== ctx.user.id) throw new HttpError(403, 'Só o autor pode alterar este rascunho.');
    if (!drafts.isEditable(d)) throw new HttpError(409, LOCKED, {}, { motivo: 'bloqueado' });
    return d;
  }

  // The section of the route: a model section, or 400 for a section that code writes.
  function modelSection(ctx) {
    const sec = ctx.params.sec;
    if (CODE_SECTIONS.includes(sec)) throw new HttpError(400, `A secção ${sec} é escrita pelo código, não pelo modelo.`);
    if (!drafts.MODEL_SECTIONS.includes(sec)) throw new HttpError(404, 'Secção desconhecida.');
    return sec;
  }

  function planGate(d, what) {
    if (!d.plano_aprovado) throw new HttpError(409, `Aprove o plano antes de ${what}.`, {}, { motivo: 'plano' });
  }

  function applicable(d, sec) {
    if (!drafts.applicableSections(d.respostas).includes(sec)) {
      throw new HttpError(400, `A secção ${sec} não se aplica a esta actividade.`);
    }
  }

  // A model call: the credentials of the request, the daily count before each call, and the own-key
  // error. A wrong own key is 401 with motivo "auth" (the session is fine); the shared key is never
  // tried in its place. A wrong shared key stays a 502 (server.js), because the teacher cannot fix it.
  async function withModel(ctx, fn) {
    const creds = requireCreds(ctx);
    const count = () => {
      if (!config.auth.countModelCall(ctx.user.id).ok) throw new HttpError(429, LIMIT);
    };
    try {
      return await fn(creds, count);
    } catch (e) {
      if (e instanceof IaeduError && e.code === 'auth' && creds.source === 'own') {
        throw new HttpError(401, e.messagePt, {}, { motivo: 'auth' });
      }
      throw e;
    }
  }

  async function askOnce(ctx, message) {
    return withModel(ctx, async (creds, count) => {
      count();
      const reply = await config.iaedu.send({
        key: creds.key,
        agentId: creds.agentId,
        channelId: creds.channelId,
        threadId: newThreadId(),
        message,
      });
      return { data: parseJsonReply(reply.text), modelo: reply.model || null };
    });
  }

  // Lint avisos for model text that is shown to the teacher but does not go into the ficha.
  function lintText(text, d) {
    const materials = d.respostas.materiais && typeof d.respostas.materiais.texto === 'string' ? d.respostas.materiais.texto : '';
    return lintSection('correccao', text, { referencias: d.referencias || [], materials }).map((w) => ({
      regra: w.rule,
      texto: w.message,
      trecho: w.match,
    }));
  }

  function optionalText(value, max, name) {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value !== 'string') throw new HttpError(400, `O campo ${name} tem de ser texto.`);
    const v = value.trim();
    if (v.length > max) throw new HttpError(400, `O campo ${name} tem no máximo ${max} caracteres.`);
    return v || undefined;
  }

  route('POST', '/rascunhos', (req, res, ctx) => {
    const modo = ctx.body.modo === undefined ? 'criar' : ctx.body.modo;
    if (modo !== 'criar') throw new HttpError(400, 'Modo desconhecido. Para melhorar uma actividade existente, use o modo refinar.');
    const d = drafts.createDraft(ctx.user, 'criar', now());
    store.write(`rascunhos/${ctx.user.id}/${d.id}.json`, d);
    sendJson(res, 201, view(d));
  });

  route('GET', '/rascunhos', (req, res, ctx) => {
    const list = drafts
      .listDrafts(store, ctx.user.id)
      .sort((a, b) => String(b.actualizado).localeCompare(String(a.actualizado)))
      .map((d) => ({
        id: d.id,
        titulo: (d.respostas.plano && d.respostas.plano.titulo) || (d.respostas.contexto && d.respostas.contexto.uc) || null,
        modo: d.modo,
        estado: d.estado,
        rev: d.rev,
        actualizado: d.actualizado,
        proximo_passo: drafts.nextStep(d),
      }));
    return { rascunhos: list };
  });

  route('GET', '/rascunhos/:id', (req, res, ctx) => {
    const d = readable(ctx);
    // The retention period counts from the last opening too. One write a day at most.
    if (d.autor.id === ctx.user.id && now() - (Date.parse(d.aberto) || 0) > 24 * 60 * 60 * 1000) {
      d.aberto = new Date(now()).toISOString();
      store.write(`rascunhos/${d.autor.id}/${d.id}.json`, d);
    }
    return view(d);
  });

  route('PUT', '/rascunhos/:id/respostas/:passo', (req, res, ctx) => {
    const d = writable(ctx);
    const r = drafts.applyAnswer(d, ctx.params.passo, ctx.body.valor);
    if (r.errors.length > 0) throw new HttpError(400, 'A resposta tem erros.', {}, { erros: r.errors });
    return view(save(r.draft), { avisos: r.avisos });
  });

  route('POST', '/rascunhos/:id/plano/aprovar', (req, res, ctx) => {
    const d = writable(ctx);
    let out;
    try {
      out = drafts.approvePlan(d);
    } catch (e) {
      if (e instanceof drafts.DraftError) throw new HttpError(409, e.message, {}, { erros: e.erros, motivo: 'passo' });
      throw e;
    }
    return view(save(out));
  });

  // The catalogue, or the two or three patterns proposed for a draft.
  route('GET', '/padroes', (req, res, ctx) => {
    const id = ctx.query.get('rascunho');
    if (!id) return { padroes: CATALOGUE };
    const d = drafts.findDraft(store, ctx.user, id);
    if (!d) throw new HttpError(404, 'Rascunho não encontrado.');
    const padroes = filterPatterns(d.respostas, CATALOGUE);
    return padroes.length < 2 ? { padroes, nota: FEW_PATTERNS } : { padroes };
  });

  // ---------------------------------------------------------------- the model tasks (Task 9)

  route('GET', '/referencias', () => ({ referencias: REFERENCES }));

  // Up to two sharper versions of the outcome. The teacher picks one or keeps their own: nothing is
  // saved here.
  route('POST', '/rascunhos/:id/objectivo/sugerir', async (req, res, ctx) => {
    const d = owned(ctx);
    const texto = optionalText(ctx.body.texto, 1000, 'texto') || (d.respostas.objectivo && d.respostas.objectivo.texto);
    if (!texto) throw new HttpError(400, 'Escreva primeiro o objectivo.');
    const respostas = { ...d.respostas, objectivo: { ...(d.respostas.objectivo || {}), texto } };
    const { data, modelo } = await askOnce(ctx, prompts.sharpenOutcome(respostas));
    const list = Array.isArray(data.sugestoes) ? data.sugestoes : [];
    const sugestoes = list
      .filter((x) => typeof x === 'string' && x.trim() !== '')
      .slice(0, 2)
      .map((x) => {
        const t = x.trim().slice(0, 1000);
        const v = drafts.checkOutcomeVerb(t);
        return { texto: t, ok: v.ok, verbo: v.verbo, avisos: lintText(t, d) };
      });
    return { sugestoes, modelo };
  });

  // Why each proposed pattern fits. The code chooses the patterns; explanations for other ids are
  // dropped.
  route('POST', '/rascunhos/:id/padroes/explicar', async (req, res, ctx) => {
    const d = owned(ctx);
    const padroes = filterPatterns(d.respostas, CATALOGUE);
    if (padroes.length === 0) return { padroes: [], modelo: null };
    const { data, modelo } = await askOnce(ctx, prompts.explainPatterns(d.respostas, padroes));
    const byId = new Map();
    for (const x of Array.isArray(data.explicacoes) ? data.explicacoes : []) {
      if (x && typeof x.id === 'string' && typeof x.texto === 'string') byId.set(x.id, x.texto.trim().slice(0, 1000));
    }
    return {
      padroes: padroes.map((p) => {
        const explicacao = byId.get(p.id) || null;
        return { ...p, explicacao, avisos: explicacao ? lintText(explicacao, d) : [] };
      }),
      modelo,
    };
  });

  route('POST', '/rascunhos/:id/seccoes/:sec/gerar', async (req, res, ctx) => {
    const sec = modelSection(ctx);
    const d = writable(ctx);
    planGate(d, 'gerar secções');
    applicable(d, sec);
    const comentario = optionalText(ctx.body.comentario, MAX_COMMENT, 'comentario');
    const out = await withModel(ctx, (creds, count) =>
      generateSection({ draft: d, sectionId: sec, client: config.iaedu, creds, comentario, beforeCall: count }),
    );
    // The call takes seconds: the draft must not have changed meanwhile.
    const fresh = drafts.findDraft(store, ctx.user, d.id);
    if (!fresh || fresh.rev !== d.rev) throw new HttpError(409, CONFLICT, {}, { motivo: 'rev' });
    fresh.seccoes[sec] = {
      dados: out.dados,
      estado: 'gerada',
      avisos: out.avisos,
      modelo: out.modelo,
      origem: 'modelo',
      gerado: new Date(now()).toISOString(),
    };
    fresh.threads = { ...(fresh.threads || {}), [sec]: out.threadId };
    return view(save(fresh));
  });

  // The teacher's own text: schema validation, no control characters and no emoji (422). The other
  // lints are for model text (design, 6.8). The text is the teacher's, so the section counts as
  // accepted.
  route('PUT', '/rascunhos/:id/seccoes/:sec', (req, res, ctx) => {
    const sec = modelSection(ctx);
    const d = writable(ctx);
    planGate(d, 'editar secções');
    applicable(d, sec);
    const dados = ctx.body.dados;
    const erros = validateSection(sec, dados, 'new', { meta: buildMeta(d) });
    if (erros.length > 0) throw new HttpError(400, 'A secção tem erros.', {}, { erros });
    if (hasControl(dados)) throw new HttpError(400, CONTROL_MESSAGE);
    const emojis = lintEmoji(renderSection(sec, dados));
    if (emojis.length > 0) throw new HttpError(422, NO_EMOJI, {}, { erros: emojis.map((w) => w.match) });
    const prev = d.seccoes[sec] || {};
    d.seccoes[sec] = {
      dados,
      estado: 'aceite',
      avisos: [],
      modelo: prev.modelo || null,
      origem: 'docente',
      editado: new Date(now()).toISOString(),
    };
    return view(save(d));
  });

  route('POST', '/rascunhos/:id/seccoes/:sec/aceitar', (req, res, ctx) => {
    const sec = modelSection(ctx);
    const d = writable(ctx);
    planGate(d, 'aceitar secções');
    applicable(d, sec);
    const s = d.seccoes[sec];
    if (!s || s.dados === undefined) throw new HttpError(409, 'A secção ainda não tem texto.', {}, { motivo: 'incompleto' });
    // Text that breaks the schema is not accepted: the teacher edits it first (PUT).
    const erros = validateSection(sec, s.dados, 'new', { meta: buildMeta(d) });
    if (hasControl(s.dados)) erros.push(CONTROL_MESSAGE);
    if (erros.length > 0) {
      throw new HttpError(409, 'A secção tem erros. Edite-a antes de a aceitar.', {}, { erros, motivo: 'invalido' });
    }
    s.estado = 'aceite';
    return view(save(d));
  });

  // References: an id from references.json, or a text typed by the teacher (origem docente, checked
  // in the review). The model never writes a reference.
  route('PUT', '/rascunhos/:id/referencias', (req, res, ctx) => {
    const d = writable(ctx);
    const list = ctx.body.referencias;
    if (!Array.isArray(list)) throw new HttpError(400, 'Indique a lista de referências.');
    if (list.length > MAX_REFERENCES) throw new HttpError(400, `No máximo ${MAX_REFERENCES} referências.`);
    const out = [];
    const seen = new Set();
    for (const item of list) {
      if (item && typeof item.id === 'string') {
        const ref = REFERENCES.find((r) => r.id === item.id);
        if (!ref) throw new HttpError(400, `Referência desconhecida: ${item.id}.`);
        if (seen.has(ref.id)) continue;
        seen.add(ref.id);
        out.push({ id: ref.id, texto: ref.texto, origem: 'curada' });
      } else if (item && typeof item.texto === 'string' && item.texto.trim() !== '') {
        const texto = item.texto.trim();
        if (texto.length > 2000) throw new HttpError(400, 'Cada referência tem no máximo 2000 caracteres.');
        out.push({ texto, origem: 'docente' });
      } else {
        throw new HttpError(400, 'Cada referência tem um id da lista ou um texto.');
      }
    }
    d.referencias = out;
    return view(save(d));
  });

  // ---------------------------------------------------------------- export

  function readyFicha(d) {
    planGate(d, 'exportar a ficha');
    // A step that became due after the plan was approved (evidencia changed to sumativa).
    const steps = drafts.missingSteps(d).filter((s) => s.id !== 'plano');
    if (steps.length > 0) {
      throw new HttpError(409, `Responda primeiro a este passo: ${steps.map((s) => s.titulo).join(', ')}.`, {}, {
        motivo: 'passo',
        passos: steps.map((s) => s.id),
      });
    }
    const missing = sectionsToAccept(d);
    if (missing.length > 0) {
      const names = missing.map((id) => SECTION_HEADINGS[id] || id).join(', ');
      throw new HttpError(409, `Faltam aceitar estas secções: ${names}.`, {}, { seccoes: missing, motivo: 'incompleto' });
    }
    const ficha = assembleFicha(d);
    // Data that does not render (an old draft, a bug) is a 409 that names the section, never a 500.
    for (const id of drafts.applicableSections(d.respostas)) {
      try {
        renderSection(id, ficha[id]);
      } catch {
        throw new HttpError(409, `A secção ${SECTION_HEADINGS[id] || id} tem dados inválidos. Edite-a antes de exportar.`, {}, {
          seccoes: [id],
          motivo: 'invalido',
        });
      }
    }
    return ficha;
  }

  // The regime avisos (Themis policy warnings, a missing clause, a policy that differs from the
  // regime). They count in X-Eunomia-Avisos with the schema problems.
  const regimeAvisos = (d) => composeRegime(d.respostas).avisos;

  // The schema problems of the whole ficha do not block the download: the teacher decides. Their
  // number goes in X-Eunomia-Avisos and the list in verificacao-final.
  route('GET', '/rascunhos/:id/exportar', (req, res, ctx) => {
    const formato = ctx.query.get('formato') || 'qmd';
    const kind = EXPORTS[formato];
    if (!kind) throw new HttpError(400, 'Formato desconhecido. Use qmd, md ou html.');
    const d = readable(ctx);
    const ficha = readyFicha(d);
    const erros = [...validateFicha(ficha, 'new'), ...regimeAvisos(d)];
    const body = kind.body(ficha);
    const slug = slugify(ficha.meta.titulo || '') || 'ficha';
    const headers = {
      'Content-Type': kind.type,
      'Content-Length': Buffer.byteLength(body),
      'Content-Disposition': `attachment; filename="${slug}.${formato}"`,
      'X-Eunomia-Avisos': String(erros.length),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    };
    if (formato === 'html') headers['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'; img-src data:";
    res.writeHead(200, headers);
    res.end(body);
  });

  route('GET', '/rascunhos/:id/verificacao-final', (req, res, ctx) => {
    const d = readable(ctx);
    planGate(d, 'verificar a ficha');
    const ficha = assembleFicha(d);
    return {
      erros: validateFicha(ficha, 'new'),
      avisos_regime: regimeAvisos(d),
      passos_em_falta: drafts.missingSteps(d).filter((s) => s.id !== 'plano').map((s) => s.id),
      seccoes_em_falta: sectionsToAccept(d),
      referencias_a_verificar: ficha.referencias.filter((r) => r.origem === 'docente').length,
    };
  });
}

module.exports = { registerDraftRoutes, CONFLICT, LOCKED, LIMIT };
