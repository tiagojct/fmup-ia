'use strict';

// Routes of the drafts and the interview. registerDraftRoutes(route, config, helpers) is called from
// registerRoutes in server.js; helpers = { HttpError, requireCreds, sendJson }.
//
// Concurrency: every write sends the rev it read. A different rev is 409, so two windows on the same
// draft cannot overwrite each other. Only the author writes a draft. An admin reads the draft of
// another author only after the author has submitted it (see readable).
//
// Lifecycle (spec D3, D4): POST /rascunhos makes an empty draft, or with { exemplo: 1..6 } a draft
// with the answers of that example (plan not approved). POST /rascunhos/:id/duplicar copies the
// author's own draft in any state; the source is not changed, so it needs no rev. DELETE
// /rascunhos/:id with rev moves the draft to apagados/ (kept DELETED_DAYS days); a submitted draft
// cannot be deleted. The three ways to make a draft share the cap of MAX_DRAFTS. GET /exemplos/:n is
// public: the reference ficha of example n, for the walk-through.
//
// registerDraftRoutes returns the helpers that other route modules use: { readable, writable, save,
// view, modelSection, personalDataGate, checkText, optionalText, readyFicha, now }.

const drafts = require('./drafts.js');
const { CATALOGUE, filterPatterns } = require('./patterns.js');
const { IaeduError, parseJsonReply } = require('./iaedu.js');
const { validateSection, validateFicha, renderSection, renderQmd, slugify, SECTION_HEADINGS } = require('./ficha.js');
const { lintEmoji, lintSection } = require('./lint.js');
const { composeRegime } = require('./regime.js');
const { REFERENCES, buildMeta, assembleFicha, sectionsToAccept } = require('./assemble.js');
const { generateSection, newThreadId } = require('./generate.js');
const { hasControl, stripControl, strings, CONTROL_MESSAGE } = require('./control.js');
const { renderMd, renderHtml } = require('./export.js');
const { renderDocx } = require('./docx.js');
const { renderFolhetoMd, renderFolhetoHtml } = require('./folheto.js');
const { detectPersonalData } = require('./materials.js');
const prompts = require('./prompts.js');
const { findExample, referenceFicha, draftFromExample } = require('./exemplos.js');

const CONFLICT = 'O rascunho foi alterado noutra janela. Recarregue a página.';
const LOCKED = 'A ficha foi submetida e não pode ser alterada.';
const LIMIT = 'Atingiu o limite diário de pedidos ao modelo.';
const NO_EMOJI = 'Retire os emojis do texto.';
const FEW_PATTERNS = 'Há menos de dois padrões do catálogo para este papel da IA e este tempo. Veja o catálogo completo.';
const SHARED_AUTH = 'A chave partilhada da IAedu falhou. Avise o responsável da Eunomia.';
const PERSONAL_DATA = 'O texto pode ter dados pessoais de doentes ou estudantes. Retire-os, ou confirme que o texto não os tem.';
// Free-text answers longer than this are checked for personal data; the materials always are.
const PERSONAL_DATA_MIN = 200;
const MAX_DRAFTS = 100;
const TOO_MANY = `Atingiu o máximo de ${MAX_DRAFTS} rascunhos. Continue um dos rascunhos que já tem, ou apague os que já não usa.`;
const NOT_FOUND = 'Rascunho não encontrado.';
// The states in which an admin may read the draft of another author: the author has submitted it.
// In any other state the admin gets 404, as for a draft that does not exist.
const ADMIN_READS = ['submetida', 'aprovada', 'devolvida'];
const NO_EXAMPLE = 'Exemplo desconhecido.';
const SUBMITTED = 'Uma actividade submetida para revisão não pode ser apagada.';
// The time budget of one request that calls the model, retry included: below the 100 s after which
// Cloudflare drops the request.
const MODEL_BUDGET_MS = 90000;

// Every 409 says why, so that the front end offers "Recarregar" only for a stale rev:
// rev (another window changed the draft), bloqueado (submitted), plano (plan not approved),
// passo (a step has no answer), incompleto (a section has no accepted text), invalido (the data
// of a section breaks the schema), limite (the teacher has MAX_DRAFTS drafts), estado (a review
// action on a draft that is not submetida).
const CODE_SECTIONS = ['meta', 'regime_ia', 'referencias', 'declaracao'];
const MAX_REFERENCES = 20;
const MAX_COMMENT = 2000;
// The downloads. The filename is the slug of the title plus suffix. body returns a string, or a
// Promise of a Buffer for the Word file. Control characters never reach a text download (the HTML
// converter and the Word export strip them too).
const WORD = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const EXPORTS = {
  qmd: { type: 'text/plain; charset=utf-8', suffix: '.qmd', body: (f) => stripControl(renderQmd(f)) },
  md: { type: 'text/markdown; charset=utf-8', suffix: '.md', body: (f) => stripControl(renderMd(f)) },
  html: { type: 'text/html; charset=utf-8', suffix: '.html', body: renderHtml },
  docx: { type: WORD, suffix: '.docx', body: renderDocx },
  folheto: { type: 'text/html; charset=utf-8', suffix: '-folheto.html', body: renderFolhetoHtml },
  'folheto-md': { type: 'text/markdown; charset=utf-8', suffix: '-folheto.md', body: (f) => stripControl(renderFolhetoMd(f)) },
};
const UNKNOWN_FORMAT = 'Formato desconhecido. Use qmd, md, html, docx, folheto ou folheto-md.';
const HTML_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:";

function registerDraftRoutes(route, config, { HttpError, sendJson, requireCreds }) {
  const { store } = config;
  const now = () => (config.now ? config.now() : Date.now());

  const view = (d, extra = {}) => ({
    rascunho: d,
    proximo_passo: drafts.nextStep(d),
    plano: drafts.planSummary(d),
    ...extra,
  });

  // The draft for reading: the author's own, or for an admin the draft of another author once it is
  // submitted (ADMIN_READS). Before that the admin gets the 404 of a missing draft, so that the admin
  // cannot tell that it exists. Every route that reads or acts on a draft goes through this function,
  // also through owned, writable and authorOnly.
  function readable(ctx) {
    const d = drafts.findDraft(store, ctx.user, ctx.params.id);
    if (!d) throw new HttpError(404, NOT_FOUND);
    if ((d.autor || {}).id !== ctx.user.id && !ADMIN_READS.includes(d.estado)) throw new HttpError(404, NOT_FOUND);
    return d;
  }

  // The cap of MAX_DRAFTS drafts per teacher, for every way of making a draft.
  function checkRoom(user) {
    const own = store.list(`rascunhos/${user.id}`).filter((name) => name.endsWith('.json')).length;
    if (own >= MAX_DRAFTS) throw new HttpError(409, TOO_MANY, {}, { motivo: 'limite' });
  }

  // The author's own draft, for duplicar and DELETE. An admin on another user's draft is 403.
  function authorOnly(ctx, verb) {
    const d = readable(ctx);
    if (d.autor.id !== ctx.user.id) throw new HttpError(403, `Só o autor pode ${verb} este rascunho.`);
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

  // A model call: the credentials of the request, the daily count before each call, one deadline for
  // all the calls of the request, and the auth errors. A wrong own key is 401 with motivo "auth" (the
  // session is fine); the shared key is never tried in its place. A wrong shared key is a 502 with its
  // own message: the teacher cannot fix it, the person in charge can.
  async function withModel(ctx, fn) {
    const creds = requireCreds(ctx);
    const deadline = Date.now() + (config.modelBudgetMs ?? MODEL_BUDGET_MS);
    const count = () => {
      if (!config.auth.countModelCall(ctx.user.id).ok) throw new HttpError(429, LIMIT);
    };
    try {
      return await fn(creds, count, deadline);
    } catch (e) {
      if (e instanceof IaeduError && e.code === 'auth') {
        if (creds.source === 'own') throw new HttpError(401, e.messagePt, {}, { motivo: 'auth' });
        throw new HttpError(502, SHARED_AUTH, {}, { motivo: 'chave_partilhada' });
      }
      throw e;
    }
  }

  async function askOnce(ctx, message) {
    return withModel(ctx, async (creds, count, deadline) => {
      count();
      const reply = await config.iaedu.send({
        key: creds.key,
        agentId: creds.agentId,
        channelId: creds.channelId,
        threadId: newThreadId(),
        message,
        deadline,
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

  // Personal data (design, 6.12) in teacher text that is stored or sent to the model: 422 with the
  // findings, unless the request confirms that there is none (exactly true, nothing else).
  function personalDataGate(ctx, texts) {
    if (ctx.body.confirmo_sem_dados_pessoais === true) return;
    const achados = texts.filter((t) => typeof t === 'string').flatMap(detectPersonalData);
    if (achados.length > 0) throw new HttpError(422, PERSONAL_DATA, {}, { motivo: 'dados_pessoais', achados });
  }

  // Teacher text that is stored: no control characters (400) and no emoji (422), as for sections.
  function checkText(data) {
    if (hasControl(data)) throw new HttpError(400, CONTROL_MESSAGE);
    const emojis = strings(data).flatMap((t) => lintEmoji(t).map((w) => w.match));
    if (emojis.length > 0) throw new HttpError(422, NO_EMOJI, {}, { erros: [...new Set(emojis)] });
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
    const exemplo = ctx.body.exemplo;
    if (exemplo !== undefined && !findExample(exemplo)) throw new HttpError(400, NO_EXAMPLE);
    checkRoom(ctx.user);
    const d = exemplo === undefined ? drafts.createDraft(ctx.user, 'criar', now()) : draftFromExample(ctx.user, exemplo, now());
    store.write(`rascunhos/${ctx.user.id}/${d.id}.json`, d);
    sendJson(res, 201, view(d));
  });

  // A copy of the author's own draft, in any state (spec D3b).
  route('POST', '/rascunhos/:id/duplicar', (req, res, ctx) => {
    const source = authorOnly(ctx, 'duplicar');
    checkRoom(ctx.user);
    const copy = drafts.duplicateDraft(source, ctx.user, now());
    store.write(`rascunhos/${ctx.user.id}/${copy.id}.json`, copy);
    sendJson(res, 201, view(copy));
  });

  // Soft delete (spec D4): the author's own draft, at the same rev, not while it is under review.
  route('DELETE', '/rascunhos/:id', (req, res, ctx) => {
    const d = authorOnly(ctx, 'apagar');
    if (d.estado === 'submetida') throw new HttpError(409, SUBMITTED, {}, { motivo: 'bloqueado' });
    const { rev } = ctx.body;
    if (!Number.isInteger(rev)) throw new HttpError(400, 'Indique a revisão do rascunho (rev).');
    if (rev !== d.rev) throw new HttpError(409, CONFLICT, {}, { motivo: 'rev' });
    return { ok: true, apagado: drafts.deleteDraft(store, d, now()) };
  });

  // The reference ficha of an example, for the walk-through. Public: the invitation email links to it.
  route(
    'GET',
    '/exemplos/:n',
    (req, res, ctx) => {
      const n = /^[1-9][0-9]?$/.test(ctx.params.n) ? Number(ctx.params.n) : NaN;
      const ficha = referenceFicha(n);
      if (!ficha) throw new HttpError(404, 'Exemplo não encontrado.');
      return { ficha };
    },
    'public',
  );

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
    checkText(ctx.body.valor);
    const r = drafts.applyAnswer(d, ctx.params.passo, ctx.body.valor);
    if (r.errors.length > 0) throw new HttpError(400, 'A resposta tem erros.', {}, { erros: r.errors });
    // The materials, and any free text over PERSONAL_DATA_MIN characters.
    personalDataGate(
      ctx,
      strings(r.draft.respostas[ctx.params.passo]).filter((t) => ctx.params.passo === 'materiais' || t.length > PERSONAL_DATA_MIN),
    );
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
    const d = readable({ user: ctx.user, params: { id } });
    const padroes = filterPatterns(d.respostas, CATALOGUE);
    return padroes.length < 2 ? { padroes, nota: FEW_PATTERNS } : { padroes };
  });

  // ---------------------------------------------------------------- the model tasks (Task 9)

  route('GET', '/referencias', () => ({ referencias: REFERENCES }));

  // Up to two sharper versions of the outcome. The teacher picks one or keeps their own: nothing is
  // saved here.
  route('POST', '/rascunhos/:id/objectivo/sugerir', async (req, res, ctx) => {
    const d = owned(ctx);
    const unsaved = optionalText(ctx.body.texto, 1000, 'texto');
    const texto = unsaved || (d.respostas.objectivo && d.respostas.objectivo.texto);
    if (!texto) throw new HttpError(400, 'Escreva primeiro o objectivo.');
    // The unsaved text goes to the model without the check of PUT respostas.
    personalDataGate(ctx, [unsaved]);
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
    personalDataGate(ctx, [comentario]);
    const out = await withModel(ctx, (creds, count, deadline) =>
      generateSection({ draft: d, sectionId: sec, client: config.iaedu, creds, comentario, beforeCall: count, deadline }),
    );
    // The call takes seconds: the draft must not have changed meanwhile.
    const fresh = drafts.findDraft(store, ctx.user, d.id);
    // Deleted in another window meanwhile: 404, never a re-created file.
    if (!fresh) throw new HttpError(404, NOT_FOUND);
    if (fresh.rev !== d.rev) throw new HttpError(409, CONFLICT, {}, { motivo: 'rev' });
    // The text it replaces stays as anterior (one level), so that "Repor" can bring it back.
    const anterior = previousVersion(fresh.seccoes[sec]);
    fresh.seccoes[sec] = {
      dados: out.dados,
      estado: 'gerada',
      avisos: out.avisos,
      modelo: out.modelo,
      origem: 'modelo',
      gerado: new Date(now()).toISOString(),
      ...(anterior ? { anterior } : {}),
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
      // The "Foi útil?" opinion is about the model text and stays with the section.
      ...(prev.opiniao ? { opiniao: prev.opiniao } : {}),
      ...(prev.anterior ? { anterior: prev.anterior } : {}),
    };
    return view(save(d));
  });

  // Swaps the text of a section with the version before the last "Nova versão". A second call swaps
  // back. Rev-guarded like every write.
  route('POST', '/rascunhos/:id/seccoes/:sec/repor', (req, res, ctx) => {
    const sec = modelSection(ctx);
    const d = writable(ctx);
    planGate(d, 'repor secções');
    applicable(d, sec);
    const s = d.seccoes[sec];
    if (!s || !s.anterior || s.anterior.dados === undefined) {
      throw new HttpError(409, 'Esta secção não tem uma versão anterior.', {}, { motivo: 'incompleto' });
    }
    const { anterior, ...current } = s;
    d.seccoes[sec] = { ...anterior, anterior: previousVersion(current) };
    return view(save(d));
  });

  // The part of a section that "Repor" brings back, or null when the section has no text.
  function previousVersion(s) {
    if (!s || s.dados === undefined) return null;
    const { anterior, ...rest } = s;
    return rest;
  }

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
    checkText(list.map((item) => (item && typeof item.texto === 'string' && typeof item.id !== 'string' ? item.texto : '')));
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

  // The regime notes of the final check: { texto, tipo }. tipo 'aviso' is for the teacher to act on
  // (a missing Themis clause, a policy that differs from the regime); tipo 'informacao' is a Themis
  // policy message, which the ficha prints next to the clause. Only the avisos count in
  // X-Eunomia-Avisos.
  function regimeNotes(d) {
    const r = composeRegime(d.respostas);
    const info = r.avisos_themis || [];
    return [
      ...r.avisos.filter((a) => !info.includes(a)).map((texto) => ({ texto, tipo: 'aviso' })),
      ...info.map((texto) => ({ texto, tipo: 'informacao' })),
    ];
  }

  // The number of problems the teacher should act on: schema errors, regime avisos and steps still
  // to answer. Policy information does not count.
  function actionableCount(d, ficha) {
    const steps = drafts.missingSteps(d).filter((s) => s.id !== 'plano').length;
    const avisos = regimeNotes(d).filter((n) => n.tipo === 'aviso').length;
    return validateFicha(ficha, 'new').length + avisos + steps;
  }

  // The schema problems and the regime avisos do not block the download: the teacher decides. Their
  // number (actionableCount) goes in X-Eunomia-Avisos and the list in verificacao-final. The gate and
  // the header are the same for every format.
  route('GET', '/rascunhos/:id/exportar', async (req, res, ctx) => {
    const formato = ctx.query.get('formato') || 'qmd';
    if (!Object.hasOwn(EXPORTS, formato)) throw new HttpError(400, UNKNOWN_FORMAT);
    const kind = EXPORTS[formato];
    const d = readable(ctx);
    const ficha = readyFicha(d);
    const count = actionableCount(d, ficha);
    const body = await kind.body(ficha);
    const slug = slugify(ficha.meta.titulo || '') || 'ficha';
    const headers = {
      'Content-Type': kind.type,
      'Content-Length': Buffer.byteLength(body),
      'Content-Disposition': `attachment; filename="${slug}${kind.suffix}"`,
      'X-Eunomia-Avisos': String(count),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    };
    if (kind.type.startsWith('text/html')) headers['Content-Security-Policy'] = HTML_CSP;
    res.writeHead(200, headers);
    res.end(body);
  });

  route('GET', '/rascunhos/:id/verificacao-final', (req, res, ctx) => {
    const d = readable(ctx);
    planGate(d, 'verificar a ficha');
    const ficha = assembleFicha(d);
    return {
      erros: validateFicha(ficha, 'new'),
      avisos_regime: regimeNotes(d),
      passos_em_falta: drafts.missingSteps(d).filter((s) => s.id !== 'plano').map((s) => s.id),
      seccoes_em_falta: sectionsToAccept(d),
      referencias_a_verificar: ficha.referencias.filter((r) => r.origem === 'docente').length,
    };
  });

  return { readable, writable, save, view, modelSection, personalDataGate, checkText, optionalText, readyFicha, now };
}

module.exports = { registerDraftRoutes, CONFLICT, LOCKED, LIMIT, MAX_DRAFTS, MODEL_BUDGET_MS };
