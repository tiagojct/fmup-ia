'use strict';

// The side panel "A sua ficha até agora" (front end, spec C) shows the AI regime as the ficha
// prints it. Its strings live in eunomia/i18n-pt.js; this test keeps them equal to ficha.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PAPEL_TEXTO, REGIME_TEXTO, renderSection } = require('../src/ficha.js');
const { repoPath } = require('../src/paths.js');

function loadPt() {
  const w = {};
  new Function('window', fs.readFileSync(repoPath('eunomia', 'i18n-pt.js'), 'utf8'))(w);
  return w.EUNOMIA_PT;
}

test('the panel strings in i18n-pt.js equal ficha.js PAPEL_TEXTO and the regime sentence of the ficha', () => {
  const P = loadPt().painel;
  assert.deepEqual(P.papeis, PAPEL_TEXTO);
  assert.deepEqual(P.regimes, REGIME_TEXTO);
  for (const [papel, papelTexto] of Object.entries(PAPEL_TEXTO)) {
    for (const regime of Object.keys(REGIME_TEXTO)) {
      const sentence = P.regimeFrase(P.regimes[regime]);
      assert.equal(sentence, `Regime para os estudantes durante a actividade, ${REGIME_TEXTO[regime]}.`);
      // The rendered regime_ia section of the ficha has both lines, as the panel shows them.
      const md = renderSection('regime_ia', { papel, regime });
      assert.ok(md.includes(papelTexto), `${papel}: papel`);
      assert.ok(md.includes(sentence), `${papel} ${regime}: regime`);
    }
  }
  const md = renderSection('regime_ia', { papel: 'ferramenta', regime: 'condicionado', condicoes: 'Só com declaração.' });
  assert.ok(md.includes(P.condicoes('Só com declaração.')));
});
