'use strict';

// The pattern catalogue (eunomia/patterns.json) and the filter that proposes two or three patterns
// from the answers of the interview (design, 6.5 step 6 and 6.7). The code filters; the model only
// explains why each proposed pattern fits.

const fs = require('node:fs');
const { repoPath } = require('./paths.js');

const CATALOGUE = JSON.parse(fs.readFileSync(repoPath('eunomia', 'patterns.json'), 'utf8')).padroes;

const MAX_PROPOSALS = 3;

const isInt = Number.isInteger;

// The time the teacher has, in minutes: [min, max]. Null when the answers do not say.
function available(contexto) {
  if (!contexto || !isInt(contexto.duracao_min)) return null;
  const max = isInt(contexto.duracao_max) ? contexto.duracao_max : contexto.duracao_min;
  return [contexto.duracao_min, max];
}

const MIN_PROPOSALS = 2;
const RELAXED_DURATION = 1.5; // a relaxed pattern may need up to 50 % more time

const MOTIVO_DURACAO = 'A duração típica deste padrão é maior do que o tempo indicado: reduza as fases ou divida a actividade.';
const MOTIVO_LUGAR = 'Este padrão decorre fora da aula, ao longo do semestre, e não numa sessão em aula.';

// Up to three patterns for the answers. The catalogue uses the AI role values of the interview and
// of the ficha schema. Hard filters: the AI role, a typical minimum that fits in the time, and no
// continuous pattern for an activity in class. When fewer than two pass, the filters are relaxed in
// this order until two are found: the duration (up to 50 % over), then the setting. A relaxed pattern
// is a copy with ajuste 'parcial' and ajuste_motivo. The AI role is never relaxed. Within each group
// the patterns that name the area come first, then those whose typical duration overlaps the time;
// the catalogue order breaks ties. Strict patterns come before relaxed ones.
function filterPatterns(answers, catalogue = CATALOGUE) {
  const r = answers || {};
  const contexto = r.contexto || {};
  const papel = r.papel_ia ? r.papel_ia.papel : undefined;
  const time = available(contexto);
  const inClass = contexto.modalidade === undefined || contexto.modalidade === 'em_aula';
  const sameRole = catalogue.filter((p) => !papel || p.papel_ia === papel);

  // null: passes; a string: passes only when that relaxation is on; false: never.
  const check = (p, { duration, setting }) => {
    if (p.duracao_tipica === null) return !inClass || (setting ? MOTIVO_LUGAR : false);
    if (!time || p.duracao_tipica.min <= time[1]) return true;
    return duration && p.duracao_tipica.min <= time[1] * RELAXED_DURATION ? MOTIVO_DURACAO : false;
  };

  const score = (p) => {
    let s = 0;
    if (contexto.area && Array.isArray(p.areas) && p.areas.includes(contexto.area)) s += 2;
    if (time && p.duracao_tipica && p.duracao_tipica.min <= time[1] && p.duracao_tipica.max >= time[0]) s += 1;
    return s;
  };
  const rank = (list) =>
    list
      .map((p) => ({ p, i: catalogue.indexOf(p), s: score(p) }))
      .sort((a, b) => b.s - a.s || a.i - b.i)
      .map((x) => x.p);

  let out = rank(sameRole.filter((p) => check(p, {}) === true));
  for (const relax of [{ duration: true }, { duration: true, setting: true }]) {
    if (out.length >= MIN_PROPOSALS) break;
    const taken = new Set(out.map((p) => p.id));
    const extra = sameRole
      .filter((p) => !taken.has(p.id))
      .map((p) => ({ p, motivo: check(p, relax) }))
      .filter((x) => typeof x.motivo === 'string');
    out = out.concat(rank(extra.map((x) => x.p)).map((p) => ({ ...p, ajuste: 'parcial', ajuste_motivo: extra.find((x) => x.p === p).motivo })));
  }
  return out.slice(0, MAX_PROPOSALS);
}

function findPattern(id, catalogue = CATALOGUE) {
  return catalogue.find((p) => p.id === id) || null;
}

module.exports = { CATALOGUE, filterPatterns, findPattern };
