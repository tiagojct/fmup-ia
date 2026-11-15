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

// Up to three patterns for the answers. The catalogue uses the AI role values of the interview and
// of the ficha schema. Hard filters: the AI role, a typical minimum that fits in the
// time, and no continuous pattern for an activity in class. Then the patterns that name the area come
// first, then those whose typical duration overlaps the time; the catalogue order breaks ties.
function filterPatterns(answers, catalogue = CATALOGUE) {
  const r = answers || {};
  const contexto = r.contexto || {};
  const papel = r.papel_ia ? r.papel_ia.papel : undefined;
  const time = available(contexto);
  const inClass = contexto.modalidade === undefined || contexto.modalidade === 'em_aula';

  const fits = catalogue.filter((p) => {
    if (papel && p.papel_ia !== papel) return false;
    if (p.duracao_tipica === null) return !inClass;
    if (time && p.duracao_tipica.min > time[1]) return false;
    return true;
  });

  const score = (p) => {
    let s = 0;
    if (contexto.area && Array.isArray(p.areas) && p.areas.includes(contexto.area)) s += 2;
    if (time && p.duracao_tipica && p.duracao_tipica.min <= time[1] && p.duracao_tipica.max >= time[0]) s += 1;
    return s;
  };
  return fits
    .map((p, i) => ({ p, i, s: score(p) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, MAX_PROPOSALS)
    .map((x) => x.p);
}

function findPattern(id, catalogue = CATALOGUE) {
  return catalogue.find((p) => p.id === id) || null;
}

module.exports = { CATALOGUE, filterPatterns, findPattern };
