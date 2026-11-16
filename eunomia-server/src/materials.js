'use strict';

// Materials and long answers: a check for personal data before the text is stored and sent to the
// model (design, 6.12). It looks for three things and returns one Portuguese line for each find:
//   - a number of 9 digits within 30 characters of "SNS" or "utente" (the SNS user number);
//   - any other number of 9 digits with a valid NIF check digit;
//   - a date within 30 characters of "nascimento" or "nasceu".
// It is a gate, not a guarantee: the teacher can confirm that the text has no personal data.

const NEAR = 30;
const NINE = /(?<![\d])\d{3}[ .]?\d{3}[ .]?\d{3}(?![\d])/g;
const SNS_WORD = /\bSNS\b|utente/giu;
const BIRTH_WORD = /nascimento|nasceu/giu;
const MONTHS = 'janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro';
const DATE = new RegExp(
  `(?<![\\d])(?:\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{2,4}|\\d{4}-\\d{1,2}-\\d{1,2}|\\d{1,2}\\s+de\\s+(?:${MONTHS})\\s+de\\s+\\d{4})(?![\\d])`,
  'giu',
);

// The positions [start, end) of every match of re in text.
function spans(text, re) {
  return [...text.matchAll(re)].map((m) => ({ start: m.index, end: m.index + m[0].length, text: m[0] }));
}

// True when a word span ends at most NEAR characters before the match or starts at most NEAR after.
function near(match, words) {
  return words.some((w) => (w.end <= match.start ? match.start - w.end <= NEAR : w.start - match.end <= NEAR));
}

function validNif(digits) {
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += Number(digits[i]) * (9 - i);
  const check = 11 - (sum % 11);
  return (check >= 10 ? 0 : check) === Number(digits[8]);
}

// detectPersonalData(texto) -> string[]: one line for each possible personal datum, in the order of
// the text. Empty when nothing is found.
function detectPersonalData(texto) {
  const text = String(texto ?? '');
  const found = [];
  const sns = spans(text, SNS_WORD);
  for (const m of spans(text, NINE)) {
    const digits = m.text.replace(/\D/g, '');
    if (near(m, sns)) found.push({ at: m.start, line: `Possível número de utente do SNS: ${m.text}` });
    else if (validNif(digits)) found.push({ at: m.start, line: `Possível NIF: ${m.text}` });
  }
  const birth = spans(text, BIRTH_WORD);
  for (const m of spans(text, DATE)) {
    if (near(m, birth)) found.push({ at: m.start, line: `Possível data de nascimento: ${m.text}` });
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.line);
}

module.exports = { detectPersonalData, validNif };
