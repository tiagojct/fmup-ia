'use strict';

// Routes of the drafts and the interview. registerDraftRoutes(route, config, helpers) is called from
// registerRoutes in server.js; helpers = { HttpError, requireCreds, sendJson }.
//
// Concurrency: every write sends the rev it read. A different rev is 409, so two windows on the same
// draft cannot overwrite each other. Only the author writes a draft; an admin may read any draft.

const drafts = require('./drafts.js');
const { CATALOGUE, filterPatterns } = require('./patterns.js');

const CONFLICT = 'O rascunho foi alterado noutra janela. Recarregue a página.';
const LOCKED = 'A ficha foi submetida e não pode ser alterada.';

function registerDraftRoutes(route, config, { HttpError, sendJson }) {
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
    if (!drafts.isEditable(d)) throw new HttpError(409, LOCKED);
    const { rev } = ctx.body;
    if (!Number.isInteger(rev)) throw new HttpError(400, 'Indique a revisão do rascunho (rev).');
    if (rev !== d.rev) throw new HttpError(409, CONFLICT);
    return d;
  }

  const save = (d) => drafts.saveDraft(store, d, now());

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
      if (e instanceof drafts.DraftError) throw new HttpError(409, e.message, {}, { erros: e.erros });
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
    return { padroes: filterPatterns(d.respostas, CATALOGUE) };
  });
}

module.exports = { registerDraftRoutes, CONFLICT, LOCKED };
