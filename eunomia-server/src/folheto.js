'use strict';

// The student handout (spec D8): what a student needs to read before the activity, built by code
// from the ficha, with no model call. It has the objective, what the student does (the blocks of
// formato and the student role), what the AI regime allows, the Themis clause when there is one
// that applies, and the declaration line.
//
// Never in it: the teacher role, the base prompt, the way to mark, the traps, the plan B, the
// references, the meta table, the protected competence and the warnings of the Themis policy.
//
//   renderFolhetoMd(ficha)    Markdown: # title, the subtitle, then four ## sections
//   renderFolhetoHtml(ficha)  the printable page of export.js htmlPage (the title and the subtitle
//                             are the page's own, the Markdown below them is the same)

const { renderSection } = require('./ficha.js');
const { htmlPage } = require('./export.js');

const REGIME_SENTENCE = {
  permitido: 'Pode usar ferramentas de IA nesta actividade.',
  condicionado: 'Pode usar ferramentas de IA nesta actividade, nas condições indicadas.',
  proibido: 'Não pode usar ferramentas de IA nesta actividade.',
};

const trimmed = (s) => (typeof s === 'string' ? s.trim() : '');

// One paragraph of free text with the escapes of the other Markdown exports (a bare @ is \@).
// renderSection('correccao') is the section that writes its one text field and nothing else.
const plain = (value) => renderSection('correccao', { texto: trimmed(value) });

// The Markdown without the title and the subtitle.
function body(ficha) {
  const regime = ficha.regime_ia || {};
  const sections = [
    ['Objectivo', [renderSection('objectivo', { texto: ficha.objectivo.texto })]],
    ['O que vai fazer', [renderSection('formato', ficha.formato), plain(ficha.papeis.estudante)]],
    [
      'Uso de IA nesta actividade',
      [
        REGIME_SENTENCE[regime.regime] || '',
        trimmed(regime.condicoes) ? `Condições: ${plain(regime.condicoes)}` : '',
        regime.themis && regime.regime !== 'proibido' ? plain(regime.themis.clausula) : '',
      ],
    ],
    ['Declaração de uso de IA', [renderSection('declaracao', ficha.declaracao)]],
  ];
  return sections
    .map(([heading, blocks]) => [`## ${heading}`, ...blocks.filter((b) => b !== '')].join('\n\n'))
    .join('\n\n');
}

const renderFolhetoMd = (ficha) => `# ${ficha.meta.titulo}\n\n${ficha.meta.subtitulo}\n\n${body(ficha)}\n`;

const renderFolhetoHtml = (ficha) => htmlPage(ficha.meta.titulo, ficha.meta.subtitulo, body(ficha));

module.exports = { renderFolhetoMd, renderFolhetoHtml };
