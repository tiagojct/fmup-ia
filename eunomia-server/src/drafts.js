'use strict';

// Drafts and the interview (design, 6.5). The interview is data (eunomia/interview.json): the steps,
// their order, their fields and their conditions. This module checks the answers, finds the next
// step, holds the plan gate and marks the sections that a changed answer makes stale.
//
// Draft = { id, autor: { id, nome }, modo, rev, estado, versao, criado, actualizado, aberto,
//           respostas: { [passo]: valor }, plano_aprovado, seccoes: { [id]: Seccao },
//           referencias: [], threads: { [id]: threadId } }
// Seccao = { dados?, estado: 'vazia' | 'gerada' | 'aceite' | 'a-actualizar', avisos: [], modelo,
//            origem?: 'modelo' | 'docente' }
// Stored as rascunhos/<userId>/<draftId>.json. rev grows by one on each write.

const fs = require('node:fs');
const crypto = require('node:crypto');
const { repoPath } = require('./paths.js');
const { CATALOGUE, findPattern } = require('./patterns.js');
const { REGIMES, MISMATCH } = require('./regime.js');

const INTERVIEW = JSON.parse(fs.readFileSync(repoPath('eunomia', 'interview.json'), 'utf8'));
const VERBOS = JSON.parse(fs.readFileSync(repoPath('eunomia', 'verbos.json'), 'utf8'));
const STEPS = new Map(INTERVIEW.passos.map((p) => [p.id, p]));

const DAY_MS = 24 * 60 * 60 * 1000;
const DRAFT_ID = /^[0-9a-f]{12}$/;
const EDITABLE = ['rascunho', 'devolvida'];

// The sections that the model writes, in the ficha order. meta, regime_ia, referencias and
// declaracao come from code.
const MODEL_SECTIONS = ['objectivo', 'formato', 'prompt_base', 'papeis', 'correccao', 'armadilhas', 'plano_b'];

// The answers each section is written from. A change to one of them, after the plan is approved,
// marks the section as to update. 'plano.notas' is the notes field of the plan step: the title and
// subtitle of the plan go to the meta table only.
const SECTION_DEPENDS = {
  objectivo: ['objectivo', 'plano.notas'],
  formato: ['contexto', 'objectivo', 'padrao', 'materiais', 'plano.notas'],
  prompt_base: ['contexto', 'papel_ia', 'regime', 'padrao', 'materiais', 'plano.notas'],
  papeis: ['contexto', 'papel_ia', 'regime', 'padrao', 'plano.notas'],
  correccao: ['objectivo', 'evidencia', 'padrao', 'plano.notas'],
  armadilhas: ['objectivo', 'papel_ia', 'padrao', 'plano.notas'],
  plano_b: ['contexto', 'papel_ia', 'regime', 'padrao', 'plano.notas'],
};

// States that the purge keeps: the work is under review or published.
const KEPT_STATES = ['submetida', 'aprovada'];

class DraftError extends Error {
  constructor(message, erros = []) {
    super(message);
    this.name = 'DraftError';
    this.erros = erros;
  }
}

const isObject = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const clone = (x) => JSON.parse(JSON.stringify(x));
const iso = (ms) => new Date(ms).toISOString();

// ---------------------------------------------------------------- creating

function createDraft(user, modo = 'criar', now = Date.now()) {
  if (!user || typeof user.id !== 'string') throw new TypeError('Utilizador inválido.');
  if (!['criar', 'refinar'].includes(modo)) throw new TypeError(`Modo desconhecido: ${modo}.`);
  const t = iso(now);
  return {
    id: crypto.randomBytes(6).toString('hex'),
    autor: { id: user.id, nome: user.name },
    modo,
    rev: 1,
    estado: 'rascunho',
    versao: 1,
    criado: t,
    actualizado: t,
    aberto: t,
    respostas: {},
    plano_aprovado: false,
    seccoes: {},
    referencias: [],
    threads: {},
  };
}

// ---------------------------------------------------------------- steps

function stepApplies(step, respostas) {
  const c = step.condicao;
  if (!c) return true;
  const answer = respostas[c.passo];
  return isObject(answer) && answer[c.campo] === c.igual;
}

function nextStep(draft) {
  for (const step of INTERVIEW.passos) {
    if (!stepApplies(step, draft.respostas)) continue;
    if (step.id === 'plano') return draft.plano_aprovado ? null : 'plano';
    if (draft.respostas[step.id] === undefined) return step.id;
  }
  return null;
}

// The applicable steps that have no answer, plano included.
function missingSteps(draft) {
  return INTERVIEW.passos.filter((s) => stepApplies(s, draft.respostas) && draft.respostas[s.id] === undefined);
}

function options(campo) {
  if (campo.opcoes === 'catalogo') return CATALOGUE.map((p) => ({ id: p.id, rotulo: p.nome }));
  return campo.opcoes || [];
}

function blankValue(v) {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);
}

function requiredNow(campo, value) {
  if (campo.obrigatorio) return true;
  const c = campo.obrigatorio_se;
  if (!c) return false;
  const other = value[c.campo];
  if (c.igual !== undefined) return other === c.igual;
  if (c.contem !== undefined) return Array.isArray(other) && other.includes(c.contem);
  return false;
}

// One field: the clean value (undefined when blank) and the errors.
function checkField(campo, raw) {
  const name = `"${campo.rotulo}"`;
  if (blankValue(raw)) return { value: undefined, errors: [] };
  switch (campo.tipo) {
    case 'texto':
    case 'texto_longo': {
      if (typeof raw !== 'string') return { errors: [`O campo ${name} tem de ser texto.`] };
      const v = raw.trim();
      if (campo.max && v.length > campo.max) return { errors: [`O campo ${name} tem ${v.length} caracteres; o máximo é ${campo.max}.`] };
      return { value: v, errors: [] };
    }
    case 'numero': {
      if (!Number.isInteger(raw)) return { errors: [`O campo ${name} tem de ser um número inteiro.`] };
      if ((campo.min !== undefined && raw < campo.min) || (campo.max !== undefined && raw > campo.max)) {
        return { errors: [`O campo ${name} tem de estar entre ${campo.min} e ${campo.max}.`] };
      }
      return { value: raw, errors: [] };
    }
    case 'escolha': {
      if (!options(campo).some((o) => o.id === raw)) return { errors: [`O campo ${name} não tem a opção indicada.`] };
      return { value: raw, errors: [] };
    }
    case 'escolha_multipla': {
      const ids = options(campo).map((o) => o.id);
      if (!Array.isArray(raw) || !raw.every((x) => ids.includes(x))) return { errors: [`O campo ${name} tem opções que não existem.`] };
      return { value: ids.filter((id) => raw.includes(id)), errors: [] };
    }
    default:
      throw new Error(`Tipo de campo desconhecido em interview.json: ${campo.tipo}`);
  }
}

// Rules between fields of one step.
function stepRules(stepId, v) {
  const errors = [];
  if (stepId === 'contexto' && Number.isInteger(v.duracao_min) && Number.isInteger(v.duracao_max) && v.duracao_max < v.duracao_min) {
    errors.push('A duração máxima é inferior à duração indicada.');
  }
  return errors;
}

// Warnings that do not block the answer.
function stepWarnings(stepId, v, respostas) {
  if (stepId === 'regime_themis' && v.policy && respostas.regime && REGIMES[respostas.regime.regime]) {
    return v.policy === REGIMES[respostas.regime.regime].policy ? [] : [MISMATCH];
  }
  if (stepId === 'objectivo' && typeof v.texto === 'string' && !checkOutcomeVerb(v.texto).ok) {
    return [
      'O objectivo não tem um verbo observável (por exemplo conduzir, identificar ou justificar). Pode mantê-lo, mas a avaliação fica mais difícil de desenhar.',
    ];
  }
  return [];
}

// Applies one answer to a copy of the draft. Returns { draft, errors, avisos }; with errors, draft
// is the draft unchanged. After the plan is approved, a changed answer marks dependent sections.
function applyAnswer(draft, stepId, value) {
  const step = STEPS.get(stepId);
  if (!step) return { draft, errors: [`Passo desconhecido: ${stepId}.`], avisos: [] };
  if (!stepApplies(step, draft.respostas)) return { draft, errors: ['Este passo não se aplica a esta actividade.'], avisos: [] };
  if (!isObject(value)) return { draft, errors: ['A resposta tem de ser um objecto JSON.'], avisos: [] };

  const errors = [];
  const known = new Set(step.campos.map((c) => c.id));
  for (const key of Object.keys(value)) if (!known.has(key)) errors.push(`Campo não previsto: ${key}.`);

  const clean = {};
  for (const campo of step.campos) {
    const r = checkField(campo, value[campo.id]);
    errors.push(...r.errors);
    if (r.value !== undefined) clean[campo.id] = r.value;
    else if (r.errors.length === 0 && requiredNow(campo, value)) errors.push(`Falta o campo "${campo.rotulo}".`);
  }
  if (errors.length === 0) errors.push(...stepRules(stepId, clean));
  if (errors.length > 0) return { draft, errors, avisos: [] };

  let out = clone(draft);
  const old = draft.respostas[stepId];
  // For the plan step only the notes reach the model; for the others, the whole answer.
  const changed =
    stepId === 'plano'
      ? ((old && old.notas) || '') !== (clean.notas || '') ? ['plano.notas'] : []
      : JSON.stringify(old) !== JSON.stringify(clean) ? [stepId] : [];
  out.respostas[stepId] = clean;
  if (out.plano_aprovado && changed.length > 0) {
    out = markStale(out, changed);
    syncSections(out);
  }
  return { draft: out, errors: [], avisos: stepWarnings(stepId, clean, out.respostas) };
}

// ---------------------------------------------------------------- the plan gate and the sections

// The sections the model writes for these answers. prompt_base and plano_b only when AI has a role.
function applicableSections(respostas) {
  const papel = isObject(respostas.papel_ia) ? respostas.papel_ia.papel : undefined;
  const ai = papel !== undefined && papel !== 'nenhum';
  return MODEL_SECTIONS.filter((id) => ai || (id !== 'prompt_base' && id !== 'plano_b'));
}

// Adds an empty entry for each applicable section that has none. Keeps the others, so that text is
// not lost when the AI role changes back.
function syncSections(draft) {
  for (const id of applicableSections(draft.respostas)) {
    if (!draft.seccoes[id]) draft.seccoes[id] = { estado: 'vazia', avisos: [], modelo: null };
  }
  return draft;
}

function approvePlan(draft) {
  const missing = missingSteps(draft);
  if (missing.length > 0) {
    throw new DraftError(
      `Responda primeiro a estes passos: ${missing.map((s) => s.titulo).join(', ')}.`,
      missing.map((s) => s.titulo),
    );
  }
  const out = clone(draft);
  out.plano_aprovado = true;
  return syncSections(out);
}

function markStale(draft, changedSteps) {
  const out = clone(draft);
  for (const [id, sec] of Object.entries(out.seccoes || {})) {
    if (!sec || sec.estado === 'vazia') continue;
    if ((SECTION_DEPENDS[id] || []).some((s) => changedSteps.includes(s))) sec.estado = 'a-actualizar';
  }
  return out;
}

// One line per decision, for the plan page and for the model prompts.
function planSummary(draft) {
  const r = draft.respostas || {};
  const label = (stepId, campoId, value) => {
    const campo = STEPS.get(stepId).campos.find((c) => c.id === campoId);
    const opt = options(campo).find((o) => o.id === value);
    return opt ? opt.rotulo : value;
  };
  const lines = [];
  const add = (rotulo, valor) => {
    if (valor !== undefined && valor !== null && String(valor).trim() !== '') lines.push({ rotulo, valor: String(valor) });
  };
  const c = r.contexto || {};
  add('Unidade curricular', c.uc);
  add('Ciclo de estudos e ano', c.programa);
  if (c.area) add('Área', label('contexto', 'area', c.area));
  if (c.nivel) add('Tipo de oferta formativa', label('contexto', 'nivel', c.nivel));
  add('Número de estudantes', c.estudantes);
  if (c.modalidade) add('Onde decorre', label('contexto', 'modalidade', c.modalidade));
  if (Number.isInteger(c.duracao_min)) add('Duração', duracaoTexto(c));
  const o = r.objectivo || {};
  add('Objectivo', o.texto);
  add('Competência protegida', o.competencia_protegida);
  const e = r.evidencia || {};
  add('Evidência', e.descricao);
  if (e.avaliacao) add('Avaliação', label('evidencia', 'avaliacao', e.avaliacao));
  if (r.papel_ia) add('Papel da IA', label('papel_ia', 'papel', r.papel_ia.papel));
  if (r.regime) {
    add('Regime de IA para os estudantes', label('regime', 'regime', r.regime.regime));
    add('Condições', r.regime.condicoes);
  }
  if (r.padrao) {
    const p = findPattern(r.padrao.padrao);
    add('Padrão', p ? `${p.nome}. ${p.mecanismo}` : r.padrao.padrao);
    add('Formato de grupo', r.padrao.formato_grupo || (p && p.formato_grupo));
  }
  if (r.materiais && r.materiais.texto) add('Materiais', `${r.materiais.texto.length} caracteres de texto`);
  const pl = r.plano || {};
  add('Título', pl.titulo);
  add('Subtítulo', pl.subtitulo);
  add('Notas para a redacção', pl.notas);
  return lines;
}

function duracaoTexto(contexto) {
  const { duracao_min: min, duracao_max: max } = contexto;
  return Number.isInteger(max) && max !== min ? `${min} a ${max} minutos` : `${min} minutos`;
}

// ---------------------------------------------------------------- the outcome verb

const ARTICLES = new Set(
  'o a os as um uma uns umas da do das dos na no nas nos pela pelo pelas pelos à ao às aos sua seu suas seus esta este essa esse'.split(' '),
);

// Every form that counts for a verb: the infinitive and the 3rd person of the present, singular and
// plural. Irregular forms come from verbos.json.
function verbForms(inf) {
  if (VERBOS.formas[inf]) return [inf, ...VERBOS.formas[inf]];
  const stem = inf.slice(0, -2);
  if (inf.endsWith('uzir')) return [inf, inf.slice(0, -2), `${stem}em`];
  if (inf.endsWith('ar')) return [inf, `${stem}a`, `${stem}am`];
  if (inf.endsWith('er') || inf.endsWith('ir')) return [inf, `${stem}e`, `${stem}em`];
  return [inf];
}

// The spelling of the 1990 agreement that a teacher may type: the c of cc, cç and ct and the p of
// pt fall (seleccionar -> selecionar, detectar -> detetar). It counts as the same verb.
const ao90 = (inf) => inf.replace(/c(?=[cçt])/g, '').replace(/p(?=t)/g, '');

const FORM_TO_VERB = new Map();
for (const nivel of VERBOS.niveis) {
  for (const inf of nivel.verbos) {
    const spellings = ao90(inf) === inf ? [inf] : [inf, ao90(inf)];
    for (const spelling of spellings) {
      for (const form of verbForms(spelling)) FORM_TO_VERB.set(form, { verbo: inf, nivel: nivel.id, infinitivo: form === spelling });
    }
  }
}

// The first observable verb of the text, as an infinitive. A form right after an article is a noun
// ("a crítica", "uma lista"), unless it is the infinitive ("aprende a conduzir").
function checkOutcomeVerb(text) {
  const tokens = String(text ?? '').toLowerCase().match(/\p{L}+/gu) || [];
  for (let i = 0; i < tokens.length; i++) {
    const hit = FORM_TO_VERB.get(tokens[i]);
    if (!hit) continue;
    if (!hit.infinitivo && i > 0 && ARTICLES.has(tokens[i - 1])) continue;
    return { ok: true, verbo: hit.verbo, nivel: hit.nivel };
  }
  return { ok: false, verbo: null };
}

// ---------------------------------------------------------------- storage

const draftFile = (userId, id) => `rascunhos/${userId}/${id}.json`;

// The draft for this user: the user's own, or (for an admin) any. Null when there is none.
function findDraft(store, user, id) {
  if (!DRAFT_ID.test(String(id))) return null;
  const own = store.read(draftFile(user.id, id), null);
  if (own) return own;
  if (user.role !== 'admin') return null;
  for (const dir of store.list('rascunhos')) {
    if (dir === user.id || !/^[0-9a-f]+$/.test(dir)) continue;
    const d = store.read(draftFile(dir, id), null);
    if (d) return d;
  }
  return null;
}

function saveDraft(store, draft, now = Date.now()) {
  draft.rev += 1;
  draft.actualizado = iso(now);
  store.write(draftFile(draft.autor.id, draft.id), draft);
  return draft;
}

function listDrafts(store, userId) {
  return store
    .list(`rascunhos/${userId}`)
    .filter((name) => name.endsWith('.json'))
    .map((name) => store.read(`rascunhos/${userId}/${name}`, null))
    .filter(Boolean);
}

const isEditable = (draft) => EDITABLE.includes(draft.estado);

// Removes the drafts that nobody changed or opened for more than `days` days, in any state except
// submetida and aprovada. Returns the number removed. A damaged file is left alone.
function purgeOldDrafts(store, now, days) {
  let removed = 0;
  const limit = days * DAY_MS;
  for (const dir of store.list('rascunhos')) {
    for (const name of store.list(`rascunhos/${dir}`)) {
      if (!name.endsWith('.json')) continue;
      const rel = `rascunhos/${dir}/${name}`;
      let d;
      try {
        d = store.read(rel, null);
      } catch {
        continue;
      }
      if (!d || KEPT_STATES.includes(d.estado)) continue;
      const last = Math.max(Date.parse(d.actualizado) || 0, Date.parse(d.aberto) || 0);
      if (now - last > limit && store.remove(rel)) removed += 1;
    }
  }
  return removed;
}

module.exports = {
  INTERVIEW,
  STEPS,
  MODEL_SECTIONS,
  SECTION_DEPENDS,
  DRAFT_ID,
  DraftError,
  createDraft,
  applyAnswer,
  nextStep,
  missingSteps,
  approvePlan,
  markStale,
  applicableSections,
  syncSections,
  planSummary,
  duracaoTexto,
  checkOutcomeVerb,
  findDraft,
  saveDraft,
  listDrafts,
  isEditable,
  purgeOldDrafts,
};
