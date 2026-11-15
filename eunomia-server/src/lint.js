'use strict';

// Lints for the Markdown of model-generated sections (the output of renderSection).
// Teacher text and the reference fixtures are not linted. Every lint gives warnings:
// nothing here blocks. The teacher reads the warnings and decides.
//
//   lingua      Brazilian forms and spelling that differs from the Quadro (eunomia/lint-pt.json).
//   estilo      emoji; bold at the start of a list item where the house style does not use it.
//   referencia  a DOI, PMID or author-year citation that is not in the ficha references.
//   numero      a percentage or statistic that is not in the teacher materials.

const fs = require('node:fs');
const { repoPath } = require('./paths.js');

// ---------------------------------------------------------------- helpers

const LETTER_OR_DIGIT = String.raw`\p{L}\p{N}_`;

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
}

function spaces(s) {
  return s.replace(/[^\n\r]/g, ' ');
}

// Replaces fenced code blocks and inline code spans with spaces of the same length, so that
// the offsets of the text stay the same. An unclosed fence runs to the end of the text.
// The rules for fences and spans are the ones renderSection uses to escape "@".
function maskCode(md) {
  let fence = null;
  return md
    .split('\n')
    .map((line) => {
      const m = line.match(/^\s*(`{3,}|~{3,})/);
      if (fence) {
        if (m && m[1][0] === fence[0] && m[1].length >= fence.length && /^\s*[`~]+\s*$/.test(line)) fence = null;
        return spaces(line);
      }
      if (m) {
        fence = m[1];
        return spaces(line);
      }
      return line.replace(/(`+)(.+?)(?<!`)\1(?!`)/g, spaces);
    })
    .join('\n');
}

// Link addresses and bare URLs are not prose.
function maskLinks(text) {
  return text
    .replace(/\]\([^)\n]*\)/g, (m) => `](${spaces(m.slice(2, -1))})`)
    .replace(/https?:\/\/[^\s<>)\]"]+/g, spaces);
}

function dedupe(warnings, key = (w) => w.match.toLowerCase()) {
  const seen = new Set();
  return warnings.filter((w) => {
    const k = `${w.rule}|${key(w)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ---------------------------------------------------------------- lingua

// eunomia/lint-pt.json is a list of { pattern, flags, replacement?, message }.
//   pattern      regular expression source. It is wrapped in Unicode word boundaries and compiled
//                with the flags "gu" plus the flags of the entry (i, m, s). It may use lookarounds
//                and capture groups.
//   replacement  the suggestion, with $1 to $9 and $& as in String.replace. Without it the
//                warning has no suggestion. The suggestion takes the case of the match.
//   message      the text for the teacher.
// The order matters: when two entries match the same words, the first one wins.
function loadLintPt() {
  const file = repoPath('eunomia', 'lint-pt.json');
  const list = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(list)) throw new Error(`${file}: a lista de regras tem de ser uma matriz.`);
  return list.map((entry, i) => {
    const where = `${file}, regra ${i + 1}`;
    if (!entry || typeof entry.pattern !== 'string' || typeof entry.message !== 'string') {
      throw new Error(`${where}: faltam pattern e message.`);
    }
    const flags = entry.flags === undefined ? '' : entry.flags;
    if (typeof flags !== 'string' || !/^[ims]*$/.test(flags)) throw new Error(`${where}: flags inválidas.`);
    if (entry.replacement !== undefined && typeof entry.replacement !== 'string') {
      throw new Error(`${where}: replacement tem de ser texto.`);
    }
    // Whole words only. \b does not treat accented letters as word characters, so the
    // boundaries are lookarounds on Unicode letters and digits.
    const source = `(?<![${LETTER_OR_DIGIT}])(?:${entry.pattern})(?![${LETTER_OR_DIGIT}])`;
    let re;
    try {
      re = new RegExp(source, `${flags}gu`);
    } catch (e) {
      throw new Error(`${where}: ${e.message}`);
    }
    return { re, replacement: entry.replacement, message: entry.message };
  });
}

const LINT_PT = loadLintPt();

// "$1" to "$9" and "$&" in the replacement, as in String.replace.
function expand(template, m) {
  return template.replace(/\$(\d|&|\$)/g, (_, k) => (k === '$' ? '$' : k === '&' ? m[0] : (m[Number(k)] ?? '')));
}

// The suggestion follows the case of the match: Objetivo gives Objectivo, OBJETIVO gives OBJECTIVO.
function matchCase(source, suggestion) {
  const letters = source.replace(/[^\p{L}]/gu, '');
  if (letters.length > 1 && letters === letters.toUpperCase() && letters !== letters.toLowerCase()) {
    return suggestion.toUpperCase();
  }
  const first = source.match(/\p{L}/u);
  if (first && first[0] !== first[0].toLowerCase()) return suggestion.charAt(0).toUpperCase() + suggestion.slice(1);
  return suggestion;
}

function lintLingua(text) {
  const prose = maskLinks(maskCode(text));
  const found = [];
  for (const rule of LINT_PT) {
    for (const m of prose.matchAll(rule.re)) {
      const warning = { rule: 'lingua', match: m[0] };
      if (rule.replacement !== undefined) warning.suggestion = matchCase(m[0], expand(rule.replacement, m));
      warning.message = rule.message;
      found.push({ start: m.index, warning });
    }
  }
  // In the order of the text, not of the rule list. The sort is stable and dedupe keeps the first
  // warning for a form, so when two entries match the same word the entry that is first in the list wins.
  found.sort((a, b) => a.start - b.start);
  return dedupe(found.map((f) => f.warning));
}

// ---------------------------------------------------------------- estilo

// Emoji: pictographs, symbols that have an emoji form, flags (two regional indicators),
// keycaps and joined sequences. (c), (r) and the trade mark sign are not emoji here.
const EMOJI = new RegExp(
  [
    String.raw`[\u{1F1E6}-\u{1F1FF}]{2}`,
    String.raw`[0-9#*]\u{FE0F}?\u{20E3}`,
    String.raw`(?:\p{Extended_Pictographic}|\p{Emoji_Presentation})(?:\u{FE0F}|\p{Emoji_Modifier})*` +
      String.raw`(?:\u{200D}(?:\p{Extended_Pictographic}|\p{Emoji_Presentation})(?:\u{FE0F}|\p{Emoji_Modifier})*)*`,
  ].join('|'),
  'gu',
);
const NOT_EMOJI = /^[\u{A9}\u{AE}\u{2122}]\u{FE0F}?$/u;

// The emoji rule alone, for text the teacher edits. It reads the whole text, code included:
// the house style has no emoji anywhere.
function lintEmoji(text) {
  const found = [];
  for (const m of String(text ?? '').matchAll(EMOJI)) {
    if (NOT_EMOJI.test(m[0])) continue;
    found.push({
      rule: 'estilo',
      match: m[0],
      message: 'Não usar emojis.',
    });
  }
  return dedupe(found, (w) => w.match);
}

// Bold at the start of a list item is allowed in three shapes only: the time label of a block in
// formato ("- **5 min.** ..." or "- **5 a 10 min.** ..."), the lead-in phrase of an item in armadilhas
// ("- **Lead.** ..."), and the question that leads a numbered item in correccao ("1. **Pergunta?** ..."),
// as in the reference fichas. Each entry takes the text between the ** marks and tells if the shape
// is allowed in that section; numbered is true when the item has a number and not a bullet.
const ALLOWED_BOLD = {
  formato: (lead) => /^\d+(?: a \d+)? min\.$/.test(lead),
  armadilhas: (lead) => lead.trim() !== '',
  correccao: (lead, numbered) => numbered && lead.trim() !== '',
};
const BOLD_ITEM = /^[ \t]*([-*+]|\d{1,3}[.)])[ \t]+(\*\*|__)(?=\S)(.+?)\2/;
const BOLD_MESSAGE =
  'Negrito no início de um item de lista. Só se usa nos tempos de formato (por exemplo, "5 min."), na frase de abertura de cada armadilha e na pergunta de cada item numerado da correcção.';

function lintBold(sectionId, text) {
  const allowed = ALLOWED_BOLD[sectionId];
  const found = [];
  for (const line of maskCode(text).split('\n')) {
    const m = line.match(BOLD_ITEM);
    if (!m) continue;
    const [, marker, bold, lead] = m;
    if (allowed && allowed(lead, /^\d/.test(marker))) continue;
    found.push({ rule: 'estilo', match: `${bold}${lead}${bold}`, message: BOLD_MESSAGE });
  }
  return dedupe(found);
}

// ---------------------------------------------------------------- referencia

// Names of authors: an optional particle (de, van, ...) and a capitalised surname.
const PARTICLE = String.raw`(?:(?:de|da|do|dos|das|van|von|der|den|di|del|la|le|el)\s+)*`;
const SURNAME = String.raw`\p{Lu}[\p{L}'\u{2019}\-]+`;
const NAME = `${PARTICLE}${SURNAME}`;
const FIRST = `${PARTICLE}(?<sur>${SURNAME})`;
const ETAL = String.raw`\s+et\s+al\.?`;
const WITH = `\\s+(?:&|e|and)\\s+${NAME}`;
const YEAR = String.raw`(?<year>(?:19|20)\d{2})[a-z]?(?!\d)`;

// (Autor et al., 2024), (Autor, 2024), (Autor e Outro, 2024), (Autor, Outro, 2024).
const IN_PARENS = [
  new RegExp(`^${FIRST}${ETAL},?\\s*${YEAR}`, 'u'),
  new RegExp(`^${FIRST}(?:,\\s+${NAME})*(?:${WITH})?,\\s*${YEAR}`, 'u'),
];
// Autor (2024), Autor et al. (2024), Autor e Outro (2024).
const NARRATIVE = new RegExp(
  `(?<![\\p{L}])${FIRST}(?:${ETAL}|${WITH})?\\s*\\(\\s*${YEAR}\\s*(?:[,:;][^)]*)?\\)`,
  'gu',
);
// Autor et al., 2024 (in running text).
const ET_AL_YEAR = new RegExp(`(?<![\\p{L}])${FIRST}${ETAL},?\\s+${YEAR}`, 'gu');
const LEAD_WORDS = /^(?:ver|cf\.?|v\.|see|e\.g\.,?|p\. ex\.,?|por exemplo,?)\s+/i;

const DOI = /(?<![\p{L}\p{N}.])10\.\d{4,9}\/[^\s"'<>\[\]|`]+/gu;
const PMID = [/\bPMID\s*[:#]?\s*(\d{4,9})(?!\d)/gi, /pubmed\.ncbi\.nlm\.nih\.gov\/(\d{4,9})(?!\d)/gi];

// A DOI ends where the sentence ends: strip closing punctuation and a bracket that has no opening one.
function cleanDoi(raw) {
  let doi = raw;
  for (;;) {
    const before = doi;
    doi = doi.replace(/[.,;:!?*_]+$/, '');
    if (doi.endsWith(')') && doi.split(')').length > doi.split('(').length) doi = doi.slice(0, -1);
    if (doi === before) return doi;
  }
}

function plain(s) {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function referenceTexts(referencias) {
  if (!Array.isArray(referencias)) return [];
  return referencias.map((r) => {
    if (typeof r === 'string') return r;
    if (!r || typeof r !== 'object') return '';
    return [r.texto, r.doi, r.pmid].filter((v) => v !== undefined && v !== null).map(String).join(' ');
  });
}

// True when needle is in haystack as a whole identifier: no letter or digit before it, and
// nothing after it that would make it the start of a longer identifier.
function hasIdentifier(haystack, needle) {
  for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + 1)) {
    const before = haystack[i - 1] ?? '';
    const after = haystack[i + needle.length] ?? '';
    const next = haystack[i + needle.length + 1] ?? '';
    const startsOk = !/[\p{L}\p{N}]/u.test(before);
    const endsOk = !/[\p{L}\p{N}\-_/]/u.test(after) && !(after === '.' && /[\p{L}\p{N}]/u.test(next));
    if (startsOk && endsOk) return true;
  }
  return false;
}

function citations(text) {
  const found = [];
  const add = (match, surname, year) => found.push({ match: match.trim(), surname, year });
  for (const group of text.matchAll(/[(\[]([^()\[\]]{3,300})[)\]]/g)) {
    for (const segment of group[1].split(';')) {
      const s = segment.trim().replace(LEAD_WORDS, '');
      for (const re of IN_PARENS) {
        const m = s.match(re);
        if (m) {
          add(m[0], m.groups.sur, m.groups.year);
          break;
        }
      }
    }
  }
  for (const re of [NARRATIVE, ET_AL_YEAR]) {
    for (const m of text.matchAll(re)) add(m[0], m.groups.sur, m.groups.year);
  }
  return found;
}

function lintReferencias(text, referencias) {
  const texts = referenceTexts(referencias);
  const lower = texts.map((t) => t.toLowerCase());
  const folded = texts.map(plain);
  const found = [];

  for (const m of text.matchAll(DOI)) {
    const doi = cleanDoi(m[0]);
    if (lower.some((t) => hasIdentifier(t, doi.toLowerCase()))) continue;
    found.push({
      rule: 'referencia',
      match: doi,
      message: 'DOI que não consta das referências da ficha. O modelo não escreve referências: confirmar a fonte ou retirar.',
    });
  }

  for (const re of PMID) {
    for (const m of text.matchAll(re)) {
      const id = m[1];
      if (texts.some((t) => new RegExp(`(?<!\\d)${id}(?!\\d)`).test(t))) continue;
      found.push({
        rule: 'referencia',
        match: `PMID ${id}`,
        message: 'PMID que não consta das referências da ficha. O modelo não escreve referências: confirmar a fonte ou retirar.',
      });
    }
  }

  for (const c of citations(text)) {
    const surname = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(plain(c.surname))}(?![\\p{L}\\p{N}])`, 'u');
    const year = new RegExp(`(?<!\\d)${c.year}(?!\\d)`);
    if (folded.some((t) => surname.test(t) && year.test(t))) continue;
    found.push({
      rule: 'referencia',
      match: c.match,
      message: 'Citação que não consta das referências da ficha. O modelo não escreve referências: confirmar a fonte ou retirar.',
    });
  }

  return dedupe(found, (w) => plain(w.match).replace(/\s+/g, ' '));
}

// ---------------------------------------------------------------- numero

const NUM = String.raw`\d+(?:[.,]\d+)*`;
const NUM1 = String.raw`\d+(?:[.,]\d+)?`;
const SIGN = String.raw`[-\u{2212}]?`;
const LABEL_START = String.raw`(?<![\p{L}\p{N}])`;

// Each rule has one capture group: the numbers of the statistic.
const STATISTICS = [
  // 56,4 %, 20 e 30 %, 50 por cento
  new RegExp(String.raw`(?<![\p{N}.,])(${NUM}(?:\s*(?:a|e|-|\u{2013})\s*${NUM})?)[\s\u{A0}\u{202F}]*(?:%|\u{2030}|por\s+cento(?![\p{L}]))`, 'giu'),
  // p < 0,05, p=0.03
  new RegExp(String.raw`${LABEL_START}[pP]\s*(?:<=|>=|<|>|=|\u{2264}|\u{2265})\s*(\d*[.,]?\d+)`, 'gu'),
  // OR = 2,3, RR 1,8, AUC de 0,91
  new RegExp(String.raw`${LABEL_START}(?:OR|RR|HR|IRR|AUC|AUROC|SMD|NNT|NNH|IC|CI|DP|SD|dp|sd)\s*(?:de\s+|=|:)?\s*${SIGN}(${NUM1})`, 'gu'),
  // kappa de 0,62, odds ratio de 2,4, d de Cohen = 0,8
  new RegExp(
    String.raw`${LABEL_START}(?:kappa|\u{3BA}|odds\s+ratio|hazard\s+ratio|risco\s+relativo|d\s+de\s+Cohen|Cohen['\u{2019}]?s\s+d)\s*(?:de\s+|=|:)?\s*${SIGN}(${NUM1})`,
    'giu',
  ),
  // n = 120, r = 0,45, t(28) = 2,3
  new RegExp(String.raw`${LABEL_START}(?:R\u{B2}|\u{3C7}\u{B2}|R2|[rRFtnNdg\u{3B2}\u{3C1}])\s*(?:\([^)]{1,20}\)\s*)?=\s*${SIGN}(${NUM1})`, 'gu'),
  // 52,3 ± 4,1
  new RegExp(String.raw`(?<![\p{N}.,])(${NUM1}\s*(?:±|\+\/-)\s*${NUM1})`, 'gu'),
];

// 56,4 and 56.4 are the same number. 56 is not in 156 or in 56,4, and 6,4 is not in 56,4.
function hasNumber(materials, token) {
  const t = escapeRegExp(token.replace(/,/g, '.'));
  return new RegExp(`(?<!\\d)(?<!\\d\\.)${t}(?!\\d)(?!\\.\\d)`).test(materials);
}

function lintNumeros(text, materials) {
  const known = String(materials ?? '').replace(/(\d),(?=\d)/g, '$1.');
  const hits = [];
  for (const re of STATISTICS) {
    for (const m of text.matchAll(re)) hits.push({ start: m.index, end: m.index + m[0].length, match: m[0].trim(), numbers: m[1] });
  }
  hits.sort((a, b) => a.start - b.start || b.end - a.end);
  const found = [];
  let until = 0;
  for (const hit of hits) {
    if (hit.start < until) continue;
    until = hit.end;
    const numbers = hit.numbers.match(/\d+(?:[.,]\d+)*/g) || [];
    if (numbers.every((n) => hasNumber(known, n))) continue;
    found.push({
      rule: 'numero',
      match: hit.match,
      message: 'Percentagem ou dado estatístico que não consta dos materiais do docente. Confirmar a fonte ou retirar.',
    });
  }
  return dedupe(found, (w) => w.match.toLowerCase().replace(/\s+/g, ' '));
}

// ---------------------------------------------------------------- the lints together

// text is the Markdown from renderSection. Code (fenced blocks and inline spans) is skipped by the
// language, bold and number lints: a pasted prompt holds fictional data and its own wording.
// The emoji and reference lints read the whole text.
function lintSection(sectionId, text, ctx = {}) {
  const md = typeof text === 'string' ? text : '';
  const { referencias = [], materials = '' } = ctx || {};
  return [
    ...lintLingua(md),
    ...lintBold(sectionId, md),
    ...lintEmoji(md),
    ...lintReferencias(md, referencias),
    ...lintNumeros(maskCode(md), materials),
  ];
}

module.exports = { lintSection, lintEmoji };
