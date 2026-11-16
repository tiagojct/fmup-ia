'use strict';

// C0 control characters other than tab, newline and carriage return. They have no place in a ficha
// or in an answer, and U+0000 is the placeholder marker of the HTML export. One non-global constant
// for every module: a global regex keeps lastIndex between calls of test().

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/;
const CONTROL_ALL = new RegExp(CONTROL.source, 'g');
const CONTROL_MESSAGE = 'O texto tem caracteres de controlo. Retire-os.';

// True when a string anywhere in data has a control character.
function hasControl(data) {
  if (typeof data === 'string') return CONTROL.test(data);
  if (Array.isArray(data)) return data.some(hasControl);
  if (data && typeof data === 'object') return Object.values(data).some(hasControl);
  return false;
}

const stripControl = (s) => String(s).replace(CONTROL_ALL, '');

// Every string anywhere in data, for the checks that read text (the emoji lint).
function strings(data, out = []) {
  if (typeof data === 'string') out.push(data);
  else if (Array.isArray(data)) data.forEach((x) => strings(x, out));
  else if (data && typeof data === 'object') Object.values(data).forEach((x) => strings(x, out));
  return out;
}

module.exports = { CONTROL, CONTROL_MESSAGE, hasControl, stripControl, strings };
