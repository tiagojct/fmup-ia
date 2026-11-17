'use strict';

// A draft becomes a ficha (eunomia/ficha.schema.json). The model sections come from the draft; meta,
// regime_ia, referencias and declaracao come from code (design, 6.4 and 6.8).

const fs = require('node:fs');
const { repoPath } = require('./paths.js');
const drafts = require('./drafts.js');
const { findPattern } = require('./patterns.js');
const { composeRegime, toFichaRegime } = require('./regime.js');

const REFERENCES = JSON.parse(fs.readFileSync(repoPath('eunomia', 'references.json'), 'utf8')).referencias;

const isObject = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

// The .ficha-meta table, from the answers. Fields with no answer are left out.
function buildMeta(draft) {
  const r = draft.respostas || {};
  const c = r.contexto || {};
  const plano = r.plano || {};
  const padrao = r.padrao ? findPattern(r.padrao.padrao) : null;
  const papel = r.papel_ia ? r.papel_ia.papel : undefined;
  const meta = {
    titulo: plano.titulo,
    subtitulo: plano.subtitulo,
    competencia: r.objectivo && r.objectivo.competencia,
    formato: (r.padrao && r.padrao.formato_grupo) || (padrao && padrao.formato_grupo),
    ano: c.programa,
    areas: drafts.areaLabel(c),
    ferramenta: papel === undefined ? undefined : papel === 'nenhum' ? 'Nenhuma' : (r.papel_ia.ferramenta || 'IAedu'),
  };
  if (Number.isInteger(c.duracao_min)) {
    const max = Number.isInteger(c.duracao_max) ? c.duracao_max : c.duracao_min;
    meta.duracao = { min: c.duracao_min, max, texto: drafts.duracaoTexto(c) };
  }
  for (const k of Object.keys(meta)) if (meta[k] === undefined) delete meta[k];
  return meta;
}

// The models that wrote the sections in the ficha, without repeats.
function modelsUsed(draft) {
  const names = drafts
    .applicableSections(draft.respostas || {})
    .map((id) => draft.seccoes && draft.seccoes[id] && draft.seccoes[id].modelo)
    .filter((m) => typeof m === 'string' && m !== '');
  return [...new Set(names)];
}

// The AI-use declaration (Quadro, chapter 4): the tool, the model and the author who reviewed it.
function declaracaoTexto(draft) {
  const models = modelsUsed(draft);
  const autor = draft.autor.nome;
  if (models.length === 0) return `Ficha preparada através da Eunomia (FMUP · IA), sem texto gerado por IA, e revista por ${autor}.`;
  return `Ficha preparada com apoio de IA generativa (IAedu, ${models.join(', ')}) através da Eunomia (FMUP · IA) e revista por ${autor}.`;
}

function assembleFicha(draft) {
  const r = draft.respostas || {};
  const ficha = { meta: buildMeta(draft) };
  for (const id of drafts.applicableSections(r)) {
    const sec = draft.seccoes && draft.seccoes[id];
    if (sec && sec.dados !== undefined) ficha[id] = sec.dados;
  }
  ficha.regime_ia = toFichaRegime(composeRegime(r));
  ficha.referencias = (draft.referencias || []).map((x) => ({ ...x }));
  ficha.declaracao = { texto: declaracaoTexto(draft) };
  const meta = { autor: draft.autor.nome, versao: draft.versao || 1, estado: draft.estado };
  const models = modelsUsed(draft);
  if (models.length) meta.modelo = models.join(', ');
  ficha.meta_eunomia = meta;
  if (isObject(draft.derived_from)) ficha.derived_from = draft.derived_from;
  return ficha;
}

// The applicable model sections that are not accepted yet (a teacher edit is accepted).
function sectionsToAccept(draft) {
  return drafts.applicableSections(draft.respostas || {}).filter((id) => !(draft.seccoes[id] && draft.seccoes[id].estado === 'aceite'));
}

module.exports = { REFERENCES, buildMeta, declaracaoTexto, assembleFicha, sectionsToAccept, modelsUsed };
