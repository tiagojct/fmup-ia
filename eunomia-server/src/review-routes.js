'use strict';

// The pilot routes (spec D6, D7, D10): the "Foi útil?" opinion on a section, the submission of a
// ficha, the review queue and the decisions of the admin, and the usage summary. registerReviewRoutes
// is called from registerRoutes in server.js with the helpers that registerDraftRoutes returns, so
// that the rules of every draft write (rev, author only, editable state, text checks) stay in one
// place.
//
// A submitted draft is read-only (isEditable). The admin reads any draft through the ordinary
// routes (GET /rascunhos/:id, exportar); the routes below only decide. An approved draft stays
// read-only; a returned one is editable again and carries revisao.comentario until the next
// submission removes it.
//
// GET /revisao and GET /uso read every draft of every user. A damaged file is skipped there
// (drafts.listAllDrafts with skipDamaged): one bad file must not take the admin pages down.
// Deleted drafts live in apagados/ and are not read.

const drafts = require('./drafts.js');
const { validateFicha } = require('./ficha.js');
const { CONFLICT } = require('./draft-routes.js');

const MAX_OPINION = 500;
const MAX_REVIEW_COMMENT = 2000;
const NO_UTIL = 'Indique se a secção foi útil (sim ou não).';
const NOT_MODEL_TEXT = 'Só pode dar opinião sobre texto escrito pelo modelo.';
const INVALID_FICHA = 'A ficha tem erros. Corrija-os antes de submeter.';
const NOT_WAITING = 'Esta actividade não está à espera de revisão.';
const NO_REVIEW_COMMENT = 'Escreva o comentário para o autor.';

const isObject = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const time = (iso) => Date.parse(iso) || 0;

// The title that the lists show: the plan title, else the course.
function titleOf(d) {
  const r = isObject(d.respostas) ? d.respostas : {};
  return (r.plano && r.plano.titulo) || (r.contexto && r.contexto.uc) || null;
}

function registerReviewRoutes(
  route,
  config,
  { HttpError, readable, writable, save, view, modelSection, personalDataGate, checkText, optionalText, readyFicha, now },
) {
  const { store, auth } = config;
  const stamp = () => new Date(now()).toISOString();

  // ---------------------------------------------------------------- opinion and submission

  // "Foi útil?" on a section that the model wrote. The author only, in an editable state, at the
  // same rev. A second opinion replaces the first.
  route('POST', '/rascunhos/:id/seccoes/:sec/opiniao', (req, res, ctx) => {
    const sec = modelSection(ctx);
    const d = writable(ctx);
    const { util } = ctx.body;
    if (typeof util !== 'boolean') throw new HttpError(400, NO_UTIL);
    const comentario = optionalText(ctx.body.comentario, MAX_OPINION, 'comentario');
    checkText(comentario);
    personalDataGate(ctx, [comentario]);
    const s = (d.seccoes || {})[sec];
    if (!s || s.dados === undefined || s.origem !== 'modelo') {
      throw new HttpError(409, NOT_MODEL_TEXT, {}, { motivo: 'incompleto' });
    }
    s.opiniao = { util, ...(comentario ? { comentario } : {}), data: stamp(), modelo: s.modelo ?? null };
    return view(save(d));
  });

  // The ficha goes to review: complete (the gate of the export) and valid for the new profile. It is
  // read-only until the admin decides. An earlier return is forgotten.
  route('POST', '/rascunhos/:id/submeter', (req, res, ctx) => {
    const d = writable(ctx);
    const ficha = readyFicha(d);
    const erros = validateFicha(ficha, 'new');
    if (erros.length > 0) throw new HttpError(409, INVALID_FICHA, {}, { erros, motivo: 'invalido' });
    d.estado = 'submetida';
    d.submetida = stamp();
    delete d.revisao;
    return view(save(d));
  });

  // ---------------------------------------------------------------- the review queue

  // The submitted drafts of every teacher, the one that waits longest first.
  route(
    'GET',
    '/revisao',
    () => ({
      revisao: drafts
        .listAllDrafts(store, { skipDamaged: true })
        .filter((d) => d.estado === 'submetida')
        .sort((a, b) => time(a.submetida) - time(b.submetida) || String(a.id).localeCompare(String(b.id)))
        .map((d) => ({
          id: d.id,
          titulo: titleOf(d),
          autor: typeof d.autor.nome === 'string' ? d.autor.nome : null,
          submetida: d.submetida ?? null,
          rev: d.rev,
        })),
    }),
    'admin',
  );

  // The draft that a decision acts on: any author's, submitted, at the rev the admin saw.
  function reviewable(ctx) {
    const d = readable(ctx);
    if (d.estado !== 'submetida') throw new HttpError(409, NOT_WAITING, {}, { motivo: 'estado' });
    const { rev } = ctx.body;
    if (!Number.isInteger(rev)) throw new HttpError(400, 'Indique a revisão do rascunho (rev).');
    if (rev !== d.rev) throw new HttpError(409, CONFLICT, {}, { motivo: 'rev' });
    return d;
  }

  function decide(ctx, d, decisao, comentario) {
    d.estado = decisao;
    d.revisao = { decisao, ...(comentario ? { comentario } : {}), data: stamp(), revisor: ctx.user.name };
    return view(save(d));
  }

  route(
    'POST',
    '/revisao/:id/aprovar',
    (req, res, ctx) => decide(ctx, reviewable(ctx), 'aprovada'),
    'admin',
  );

  // The comment is for the author, who reads it at the top of the draft: it is required.
  route(
    'POST',
    '/revisao/:id/devolver',
    (req, res, ctx) => {
      const d = reviewable(ctx);
      const comentario = optionalText(ctx.body.comentario, MAX_REVIEW_COMMENT, 'comentario');
      if (!comentario) throw new HttpError(400, NO_REVIEW_COMMENT);
      checkText(comentario);
      personalDataGate(ctx, [comentario]);
      return decide(ctx, d, 'devolvida', comentario);
    },
    'admin',
  );

  // ---------------------------------------------------------------- usage

  // Per user: the drafts by state and the model calls. Per model section: the Sim and Não counts and
  // the comments of the opinions (those in the section and those in anterior), newest first. Never
  // the text of a section and never the name of an author in seccoes.
  route(
    'GET',
    '/uso',
    () => {
      const all = drafts.listAllDrafts(store, { skipDamaged: true });
      const usage = auth.usageSummary();

      const states = new Map();
      for (const d of all) {
        const counts = states.get(d.autor.id) || new Map();
        counts.set(d.estado, (counts.get(d.estado) || 0) + 1);
        states.set(d.autor.id, counts);
      }
      const utilizadores = auth
        .list()
        .map((c) => ({
          id: c.id,
          nome: c.name,
          perfil: c.role,
          revogado: Boolean(c.revoked),
          rascunhos: Object.fromEntries(states.get(c.id) || []),
          pedidos_hoje: (usage.utilizadores[c.id] || {}).hoje || 0,
          pedidos_30_dias: (usage.utilizadores[c.id] || {}).dias30 || 0,
        }))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt') || a.id.localeCompare(b.id));

      const seccoes = drafts.MODEL_SECTIONS.map((id) => ({ id, sim: 0, nao: 0, comentarios: [] }));
      const byId = new Map(seccoes.map((s) => [s.id, s]));
      for (const d of all) {
        for (const [id, s] of Object.entries(isObject(d.seccoes) ? d.seccoes : {})) {
          const entry = byId.get(id);
          if (!entry || !isObject(s)) continue;
          for (const o of [s.opiniao, isObject(s.anterior) ? s.anterior.opiniao : undefined]) {
            if (!isObject(o) || typeof o.util !== 'boolean') continue;
            if (o.util) entry.sim += 1;
            else entry.nao += 1;
            if (typeof o.comentario === 'string' && o.comentario !== '') {
              entry.comentarios.push({ util: o.util, texto: o.comentario, data: o.data ?? null, modelo: o.modelo ?? null });
            }
          }
        }
      }
      for (const s of seccoes) s.comentarios.sort((a, b) => time(b.data) - time(a.data));

      return { limite_diario: usage.limite, utilizadores, seccoes };
    },
    'admin',
  );
}

module.exports = { registerReviewRoutes, MAX_OPINION, MAX_REVIEW_COMMENT };
