'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { lintSection, lintEmoji } = require('../src/lint.js');
const { renderSection } = require('../src/ficha.js');
const { repoPath } = require('../src/paths.js');

const REFERENCIA = path.join(__dirname, '..', 'referencia');
const NO_CTX = { referencias: [], materials: '' };

function load(n) {
  return JSON.parse(fs.readFileSync(path.join(REFERENCIA, `ficha-${n}.json`), 'utf8'));
}

function only(rule, warnings) {
  return warnings.filter((w) => w.rule === rule);
}

// Language warnings for a plain paragraph in a free-text section.
function lingua(text) {
  return only('lingua', lintSection('correccao', text, NO_CTX));
}

// Emoji built from code points: no emoji literal may appear in a file of this repository.
const SMILE = String.fromCodePoint(0x1f600);
const CHECK = String.fromCodePoint(0x2705);
const WARN_SIGN = String.fromCodePoint(0x26a0, 0xfe0f);
const FLAG_PT = String.fromCodePoint(0x1f1f5, 0x1f1f9);
const KEYCAP = '1' + String.fromCodePoint(0xfe0f, 0x20e3);
const FAMILY = String.fromCodePoint(0x1f469, 0x200d, 0x1f4bb);

// ---------------------------------------------------------------- lingua

test('lingua: the brief examples', () => {
  const objetivo = lingua('O objetivo é...');
  assert.equal(objetivo.length, 1);
  assert.equal(objetivo[0].match, 'objetivo');
  assert.equal(objetivo[0].suggestion, 'objectivo');
  assert.equal(typeof objetivo[0].message, 'string');
  assert.ok(objetivo[0].message.length > 0);

  assert.equal(lingua('os alunos')[0].suggestion, 'estudantes');
  assert.equal(lingua('os pacientes')[0].suggestion, 'doentes');
  assert.equal(lingua('você').length, 1);
  assert.deepEqual(lingua('no ecrã'), []);
  assert.equal(lingua('na tela')[0].suggestion, 'ecrã');
});

test('lingua: a warning has the fields rule, match, message and, when known, suggestion', () => {
  const [w] = lingua('o objetivo');
  assert.deepEqual(Object.keys(w).sort(), ['match', 'message', 'rule', 'suggestion']);
  const [v] = lingua('você');
  assert.deepEqual(Object.keys(v).sort(), ['match', 'message', 'rule']);
});

test('lingua: Brazilian forms and Quadro spelling, with the suggestion', () => {
  const cases = [
    ['os objetivos', 'objetivos', 'objectivos'],
    ['o objeto de estudo', 'objeto', 'objecto'],
    ['a ação do docente', 'ação', 'acção'],
    ['as ações', 'ações', 'acções'],
    ['a reação do modelo', 'reação', 'reacção'],
    ['a interação em pares', 'interação', 'interacção'],
    ['um grupo ativo', 'ativo', 'activo'],
    ['a atividade decorre', 'atividade', 'actividade'],
    ['as atividades', 'atividades', 'actividades'],
    ['o modelo reativo', 'reativo', 'reactivo'],
    ['um exercício interativo', 'interativo', 'interactivo'],
    ['o resultado direto', 'direto', 'directo'],
    ['responde diretamente', 'diretamente', 'directamente'],
    ['a correção do texto', 'correção', 'correcção'],
    ['a resposta correta', 'correta', 'correcta'],
    ['a seleção de casos', 'seleção', 'selecção'],
    ['a direção do exercício', 'direção', 'direcção'],
    ['a receção da turma', 'receção', 'recepção'],
    ['a perceção do estudante', 'perceção', 'percepção'],
    ['a exceção', 'exceção', 'excepção'],
    ['a adoção da ferramenta', 'adoção', 'adopção'],
    ['otimizar o prompt', 'otimizar', 'optimizar'],
    ['uma resposta ótima', 'ótima', 'óptima'],
    ['o aspeto formal', 'aspeto', 'aspecto'],
    ['o respetivo guião', 'respetivo', 'respectivo'],
    ['uma perspetiva crítica', 'perspetiva', 'perspectiva'],
    ['a posição exata', 'exata', 'exacta'],
    ['a eficácia efetiva', 'efetiva', 'efectiva'],
    ['o setor da saúde', 'setor', 'sector'],
    ['um ato clínico', 'ato', 'acto'],
    ['o ator principal', 'ator', 'actor'],
    ['um trabalho coletivo', 'coletivo', 'colectivo'],
    ['o ceticismo saudável', 'ceticismo', 'cepticismo'],
    ['um projeto de turma', 'projeto', 'projecto'],
    ['a situação atual', 'atual', 'actual'],
    ['o fato de que', 'fato de que', 'facto de que'],
    ['de fato', 'de fato', 'de facto'],
    ['nos contatos do docente', 'contatos', 'contactos'],
    ['registrar as respostas', 'registrar', 'registar'],
    ['os registros', 'registros', 'registos'],
    ['cada usuário', 'usuário', 'utilizador'],
    ['os usuários', 'usuários', 'utilizadores'],
    ['uma aluna', 'aluna', 'estudante'],
    ['um paciente', 'paciente', 'doente'],
    ['as telas', 'telas', 'ecrãs'],
    ['o arquivo PDF', 'arquivo', 'ficheiro'],
    ['os arquivos', 'arquivos', 'ficheiros'],
    ['o time de docentes', 'time', 'equipa'],
    ['os times', 'times', 'equipas'],
    ['a equipe', 'equipe', 'equipa'],
    ['o planejamento da aula', 'planejamento', 'planeamento'],
    ['o aprendizado', 'aprendizado', 'aprendizagem'],
    ['os aprendizados', 'aprendizados', 'aprendizagens'],
    ['o prontuário', 'prontuário', 'processo clínico'],
    ['um aplicativo', 'aplicativo', 'aplicação'],
    ['acessar o link', 'acessar', 'aceder'],
    ['checar a resposta', 'checar', 'verificar'],
    ['deletar o ficheiro', 'deletar', 'apagar / eliminar'],
    ['no celular', 'celular', 'telemóvel'],
    ['os celulares', 'celulares', 'telemóveis'],
    ['o gênero textual', 'gênero', 'género'],
    ['a análise econômica', 'econômica', 'económica'],
    ['o fenômeno', 'fenômeno', 'fenómeno'],
  ];
  for (const [text, match, suggestion] of cases) {
    const found = lingua(text);
    assert.equal(found.length, 1, `${text}: ${JSON.stringify(found)}`);
    assert.equal(found[0].match, match, text);
    assert.equal(found[0].suggestion, suggestion, text);
  }
});

test('lingua: two problems in overlapping words are both reported', () => {
  const found = lingua('Te registrar aqui.');
  assert.deepEqual(
    found.map((w) => w.match),
    ['Te registrar', 'registrar'],
  );
  assert.equal(found[1].suggestion, 'registar');
});

test('lingua: forms flagged without a suggestion', () => {
  for (const text of ['você decide', 'vocês decidem', 'Me ajuda a decidir.', 'o estudante está fazendo o exercício']) {
    const found = lingua(text);
    assert.ok(found.length >= 1, text);
    assert.equal(found[0].suggestion, undefined, text);
  }
});

test('lingua: the suggestion follows the case of the match', () => {
  assert.equal(lingua('Objetivo da actividade')[0].suggestion, 'Objectivo');
  assert.equal(lingua('Ação imediata')[0].suggestion, 'Acção');
  assert.equal(lingua('PACIENTES')[0].suggestion, 'DOENTES');
  assert.equal(lingua('Tela inicial')[0].suggestion, 'Ecrã');
});

test('lingua: accented letters count as word letters, so no match inside another word', () => {
  // "ação" is a substring of these words.
  assert.deepEqual(lingua('A situação, a avaliação e a informação'), []);
  assert.deepEqual(lingua('A simulação, a participação e a educação'), []);
  // "ativo" is a substring of these words.
  assert.deepEqual(lingua('Um critério relativo, um texto narrativo, um uso criativo e um idioma nativo'), []);
  assert.deepEqual(lingua('Uma abordagem cooperativa e alternativa'), []);
  // The Quadro forms are not flagged.
  assert.deepEqual(lingua('A acção, a reacção, a actividade, o objectivo e a correcção'), []);
  // Accented capital at the start of a word.
  assert.equal(lingua('Ação:')[0].match, 'Ação');
  // A word that ends in an accented letter next to a word that starts the pattern.
  assert.deepEqual(lingua('o ecrã e as tecnologias'), []);
});

test('lingua: a word at the end of a sentence, of a line or of the text is caught', () => {
  assert.equal(lingua('Isto serve para os alunos.')[0].match, 'alunos');
  assert.equal(lingua('Isto serve para os alunos')[0].match, 'alunos');
  assert.equal(lingua('Isto serve para os alunos!\nOutra linha.')[0].match, 'alunos');
  assert.equal(lingua('(alunos)')[0].match, 'alunos');
  assert.equal(lingua('"alunos", disse')[0].match, 'alunos');
  assert.equal(lingua('Alunos')[0].suggestion, 'Estudantes');
});

test('lingua: correct European Portuguese words are not flagged', () => {
  const text = [
    'O fato de banho ficou no estômago da fêmea.',
    'A divisão celular e o acesso acessível.',
    'Um contacto, um registo, um facto, um projecto, um actor.',
    'O médico escreveu um relatório deletério.',
    'Estão a fazer o exercício. Ele está lindo, quando chega o comando.',
    'Ajuda-me a decidir. O que me ajuda é isto.',
    'Estudantes e doentes no ecrã, em arquivo.',
    'Mantém em arquivo as notas. Real time e just-in-time.',
    'O atum e a tuna. Um tema actual.',
  ].join('\n');
  assert.deepEqual(lingua(text), []);
  // The stem "atua" is flagged, "atum" is not.
  assert.equal(lingua('a atuação do docente')[0].suggestion, 'actuação');
});

test('lingua: a form that is repeated gives one warning', () => {
  const found = lingua('Os alunos e os alunos. Os Alunos.');
  assert.equal(found.length, 1);
});

test('lingua: two different forms give two warnings, in the order of the text', () => {
  assert.deepEqual(
    lingua('Os alunos e os pacientes.').map((w) => w.match),
    ['alunos', 'pacientes'],
  );
  assert.deepEqual(
    lingua('Os pacientes e os alunos.').map((w) => w.match),
    ['pacientes', 'alunos'],
  );
});

test('lingua: when two entries match the same words, the first entry wins', () => {
  // "eletrônico" is in the list as a form of its own, and the circumflex entry would match it too.
  const found = lingua('um sinal eletrônico');
  assert.equal(found.length, 1);
  assert.equal(found[0].suggestion, 'electrónico');
  // "ônibus" and the circumflex entry.
  const bus = lingua('o ônibus');
  assert.equal(bus.length, 1);
  assert.equal(bus[0].suggestion, 'autocarro');
});

test('lingua: code is skipped, the text around it is not', () => {
  assert.deepEqual(lingua('Usa `alunos` e `objetivo` no código.'), []);
  assert.deepEqual(lingua('Usa ``a `tela` aqui`` no código.'), []);
  const fenced = ['Antes.', '```text', 'Os alunos e os pacientes.', '```', 'Depois.'].join('\n');
  assert.deepEqual(lingua(fenced), []);
  const tilde = ['~~~', 'o objetivo', '~~~'].join('\n');
  assert.deepEqual(lingua(tilde), []);
  const mixed = ['O prompt:', '```text', 'Os alunos.', '```', 'Os pacientes ficam fora do bloco.'].join('\n');
  const found = lingua(mixed);
  assert.deepEqual(
    found.map((w) => w.match),
    ['pacientes'],
  );
  // A fence that is never closed runs to the end of the text.
  assert.deepEqual(lingua('```\nos alunos\n'), []);
  // A longer fence is closed only by a fence of at least the same length.
  const nested = ['````', '```', 'os alunos', '```', '````', 'os pacientes'].join('\n');
  assert.deepEqual(
    lingua(nested).map((w) => w.match),
    ['pacientes'],
  );
});

test('lingua: link addresses and URLs are skipped', () => {
  assert.deepEqual(lingua('Ver [a ficha](3-aluno-corretor.qmd) e <https://exemplo.pt/tela/objetivo>.'), []);
  assert.deepEqual(lingua('Ver https://exemplo.pt/alunos/ hoje.'), []);
  assert.equal(lingua('Ver [os alunos](x.qmd).')[0].match, 'alunos');
});

test('lingua: is applied to every section id', () => {
  for (const id of ['meta', 'objectivo', 'formato', 'prompt_base', 'papeis', 'correccao', 'armadilhas', 'plano_b', 'extras']) {
    const found = only('lingua', lintSection(id, 'os alunos', NO_CTX));
    assert.equal(found.length, 1, id);
  }
});

// ---------------------------------------------------------------- estilo: emoji

test('estilo: an emoji gives a warning in any section', () => {
  for (const id of ['meta', 'objectivo', 'formato', 'prompt_base', 'papeis', 'correccao', 'armadilhas', 'plano_b']) {
    const found = only('estilo', lintSection(id, `Muito bem ${SMILE} e pronto.`, NO_CTX));
    assert.equal(found.length, 1, id);
    assert.equal(found[0].match, SMILE);
    assert.equal(typeof found[0].message, 'string');
  }
});

test('lintEmoji: finds emoji and nothing else', () => {
  for (const emoji of [SMILE, CHECK, WARN_SIGN, FLAG_PT, KEYCAP, FAMILY]) {
    const found = lintEmoji(`antes ${emoji} depois`);
    assert.equal(found.length, 1, JSON.stringify(emoji));
    assert.equal(found[0].rule, 'estilo');
    assert.equal(found[0].match, emoji);
  }
  assert.deepEqual(lintEmoji(''), []);
  assert.deepEqual(lintEmoji('Texto com acentos: ção, ões, ê, ü; números 1 2 3 #4 *5; (c) 2026.'), []);
  assert.deepEqual(lintEmoji('Marcas: \u{A9} \u{AE} \u{2122}, setas -> e travessão \u{2014}.'), []);
});

test('lintEmoji: one warning for each different emoji', () => {
  const found = lintEmoji(`${SMILE} ${SMILE} ${CHECK}`);
  assert.deepEqual(
    found.map((w) => w.match),
    [SMILE, CHECK],
  );
});

test('lintEmoji: looks inside code as well', () => {
  assert.equal(lintEmoji('```\nolá ' + SMILE + '\n```').length, 1);
  assert.equal(only('estilo', lintSection('prompt_base', '`' + SMILE + '`', NO_CTX)).length, 1);
});

// ---------------------------------------------------------------- estilo: bold at the start of list items

test('estilo: a bold lead-in in armadilhas is allowed', () => {
  assert.deepEqual(only('estilo', lintSection('armadilhas', '**Saída de papel.** Perante...', NO_CTX)), []);
  const list = ['- **Saída de papel.** Perante insistência.', '- **Excesso de fluência.** O doente simulado.'].join('\n');
  assert.deepEqual(only('estilo', lintSection('armadilhas', list, NO_CTX)), []);
});

test('estilo: bold at the start of a list item is flagged in other sections', () => {
  const found = only('estilo', lintSection('papeis', '- **Nota:** texto', NO_CTX));
  assert.equal(found.length, 1);
  assert.equal(found[0].match, '**Nota:**');
  assert.equal(typeof found[0].message, 'string');

  for (const line of ['* **Nota:** texto', '+ **Nota:** texto', '  - **Nota:** texto', '1. **Nota:** texto', '2) **Nota:** texto', '- __Nota:__ texto']) {
    assert.equal(only('estilo', lintSection('papeis', line, NO_CTX)).length, 1, line);
  }
  for (const id of ['objectivo', 'prompt_base', 'correccao', 'plano_b', 'extras', 'meta']) {
    assert.equal(only('estilo', lintSection(id, '- **Nota:** texto', NO_CTX)).length, 1, id);
  }
});

test('estilo: bold that does not start a list item is allowed', () => {
  assert.deepEqual(only('estilo', lintSection('papeis', 'O estudante **não** consulta a ficha.', NO_CTX)), []);
  assert.deepEqual(only('estilo', lintSection('papeis', '**Nota.** Um parágrafo que começa com negrito.', NO_CTX)), []);
  assert.deepEqual(only('estilo', lintSection('papeis', '- Um item com **negrito** a meio.', NO_CTX)), []);
  assert.deepEqual(only('estilo', lintSection('papeis', '| **Competência** | Anamnese |', NO_CTX)), []);
  assert.deepEqual(only('estilo', lintSection('papeis', '```\n- **Nota:** texto\n```', NO_CTX)), []);
});

test('estilo: the time label in formato is allowed, in the shape renderSection writes', () => {
  assert.deepEqual(only('estilo', lintSection('formato', '- **5 min.** Enquadramento', NO_CTX)), []);
  assert.deepEqual(only('estilo', lintSection('formato', '- **10 a 15 min.** Discussão', NO_CTX)), []);
  const block = renderSection('formato', {
    blocos: [
      { minutos: 5, texto: 'Enquadramento.' },
      { minutos: 10, minutos_max: 15, texto: 'Discussão.' },
    ],
  });
  assert.deepEqual(only('estilo', lintSection('formato', block, NO_CTX)), []);
});

test('estilo: other bold in formato, and a time label outside formato, is flagged', () => {
  assert.equal(only('estilo', lintSection('formato', '- **Nota:** texto', NO_CTX)).length, 1);
  assert.equal(only('estilo', lintSection('formato', '- **5 minutos** texto', NO_CTX)).length, 1);
  assert.equal(only('estilo', lintSection('formato', '- **5 min** texto', NO_CTX)).length, 1);
  assert.equal(only('estilo', lintSection('papeis', '- **5 min.** texto', NO_CTX)).length, 1);
  assert.equal(only('estilo', lintSection('correccao', '- **5 min.** texto', NO_CTX)).length, 1);
});

test('estilo: a numbered bold question lead in correccao is allowed, as in the reference fichas', () => {
  assert.deepEqual(only('estilo', lintSection('correccao', '1. **Que erros escaparam aos grupos?** Normalmente os de raciocínio.', NO_CTX)), []);
  assert.deepEqual(only('estilo', lintSection('correccao', '  12) **Onde falhou a ferramenta?** Na limitação.', NO_CTX)), []);
  for (const n of [1, 2, 4]) {
    const md = renderSection('correccao', load(n).correccao);
    assert.deepEqual(only('estilo', lintSection('correccao', md, NO_CTX)), [], `ficha ${n}`);
  }
});

test('estilo: a bold lead on a bullet in correccao, and a numbered one elsewhere, is still flagged', () => {
  assert.equal(only('estilo', lintSection('correccao', '- **Pergunta?** texto', NO_CTX)).length, 1);
  assert.equal(only('estilo', lintSection('correccao', '* **Pergunta?** texto', NO_CTX)).length, 1);
  assert.equal(only('estilo', lintSection('papeis', '1. **Pergunta?** texto', NO_CTX)).length, 1);
  assert.equal(only('estilo', lintSection('formato', '1. **Pergunta?** texto', NO_CTX)).length, 1);
});

test('estilo: the armadilhas list from renderSection passes', () => {
  const md = renderSection('armadilhas', [
    { lead: 'Saída de papel.', texto: 'Perante insistência, o doente simulado ajuda.' },
    { lead: 'Excesso de fluência.', texto: 'O doente responde como um manual.' },
  ]);
  assert.deepEqual(only('estilo', lintSection('armadilhas', md, NO_CTX)), []);
});

// ---------------------------------------------------------------- referencia

const HOLDERRIED = {
  id: 'holderried-2024',
  texto:
    'Holderried F, Stegemann-Philipps C, Herschbach L, et al. A Generative Pretrained Transformer (GPT)-Powered Chatbot as a Simulated Patient to Practice History Taking. *JMIR Medical Education*. 2024;10:e53961. DOI: [10.2196/53961](https://doi.org/10.2196/53961). PMID: 38227363.',
};

function refs(text, referencias = []) {
  return only('referencia', lintSection('correccao', text, { referencias, materials: '' }));
}

test('referencia: a DOI that is not in the references gives a warning', () => {
  const found = refs('ver doi:10.2196/53961', []);
  assert.equal(found.length, 1);
  assert.equal(found[0].rule, 'referencia');
  assert.equal(found[0].match, '10.2196/53961');
  assert.equal(typeof found[0].message, 'string');
});

test('referencia: a DOI that is in a reference text gives no warning', () => {
  assert.deepEqual(refs('ver doi:10.2196/53961', [{ texto: 'Autor X. Título. DOI: 10.2196/53961.' }]), []);
  assert.deepEqual(refs('ver doi:10.2196/53961', [HOLDERRIED]), []);
});

test('referencia: DOI forms, case, punctuation and links', () => {
  assert.equal(refs('ver https://doi.org/10.2196/53961.', [])[0].match, '10.2196/53961');
  assert.equal(refs('ver (10.2196/53961)', [])[0].match, '10.2196/53961');
  assert.equal(refs('ver [10.2196/53961](https://doi.org/10.2196/53961)', []).length, 1);
  assert.equal(refs('ver 10.1016/S0140-6736(20)30183-5.', [])[0].match, '10.1016/S0140-6736(20)30183-5');
  assert.deepEqual(refs('ver DOI 10.2196/53961', [{ texto: 'doi:10.2196/53961' }]), []);
  assert.deepEqual(refs('ver 10.1002/ABC.1', [{ texto: 'https://doi.org/10.1002/abc.1' }]), []);
  assert.deepEqual(refs('ver 10.2196/53961;', [HOLDERRIED]), []);
});

test('referencia: a DOI that is only the start of a known DOI is not known', () => {
  assert.equal(refs('ver 10.2196/5396', [HOLDERRIED]).length, 1);
  assert.equal(refs('ver 10.2196/53961', [{ texto: '10.2196/539612' }]).length, 1);
});

test('referencia: the doi and pmid fields of a reference count as well', () => {
  assert.deepEqual(refs('ver 10.2196/53961', [{ texto: 'Sem identificador.', doi: '10.2196/53961' }]), []);
  assert.deepEqual(refs('PMID 38227363', [{ texto: 'Sem identificador.', pmid: '38227363' }]), []);
  assert.deepEqual(refs('PMID 38227363', [{ texto: 'Sem identificador.', pmid: 38227363 }]), []);
});

test('referencia: a PMID follows the same rule', () => {
  const found = refs('Ver PMID 38227363 para o detalhe.', []);
  assert.equal(found.length, 1);
  assert.equal(found[0].match, 'PMID 38227363');
  assert.deepEqual(refs('Ver PMID: 38227363.', [HOLDERRIED]), []);
  assert.equal(refs('Ver PMID: 38227364.', [HOLDERRIED]).length, 1);
  assert.equal(refs('Ver https://pubmed.ncbi.nlm.nih.gov/38227363/', []).length, 1);
});

test('referencia: an author-year citation follows the same rule', () => {
  const found = refs('(Holderried et al., 2024)', []);
  assert.equal(found.length, 1);
  assert.equal(found[0].match, 'Holderried et al., 2024');
  assert.deepEqual(refs('(Holderried et al., 2024)', [HOLDERRIED]), []);
});

test('referencia: author-year forms', () => {
  const forms = [
    '(Holderried et al., 2024)',
    '(Holderried et al. 2024)',
    '(Holderried, 2024)',
    '(Holderried & Costa, 2024)',
    '(Holderried e Costa, 2024)',
    '(Holderried and Costa, 2024)',
    '(Holderried, Costa, 2024)',
    '(Holderried, 2024a)',
    '(Holderried, 2024, p. 5)',
    '(ver Holderried et al., 2024)',
    '(Costa, 2020; Holderried et al., 2024)',
    'Holderried et al. (2024) mostram',
    'Holderried (2024) mostra',
    'Segundo Holderried et al., 2024, o modelo',
  ];
  for (const text of forms) {
    const found = refs(text, []);
    assert.ok(
      found.some((w) => /Holderried/.test(w.match) && /2024/.test(w.match)),
      `${text}: ${JSON.stringify(found)}`,
    );
    assert.deepEqual(
      refs(text, [HOLDERRIED, { texto: 'Costa M. Outro estudo. 2020.' }]),
      [],
      text,
    );
  }
});

test('referencia: surname and year must both be in the same reference', () => {
  assert.equal(refs('(Holderried et al., 2023)', [HOLDERRIED]).length, 1);
  assert.equal(refs('(Holderrieder et al., 2024)', [HOLDERRIED]).length, 1);
  // Surname in one reference, year in another.
  assert.equal(refs('(Holderried et al., 2025)', [HOLDERRIED, { texto: 'Costa M. 2025.' }]).length, 1);
  // The surname is matched without regard to case and accents.
  assert.deepEqual(refs('(Müller et al., 2022)', [{ texto: 'Muller A. Um estudo. 2022.' }]), []);
});

test('referencia: surnames with a hyphen, an apostrophe, a particle or an accent', () => {
  const known = { texto: "Falcão-Pires I, O'Brien P, Costa M. Estudo. 2023;12:1-9." };
  assert.deepEqual(refs('(Falcão-Pires et al., 2023)', [known]), []);
  assert.deepEqual(refs("(O'Brien et al., 2023)", [known]), []);
  assert.deepEqual(refs('(Falcao-Pires et al., 2023)', [known]), []);
  assert.equal(refs('(Falcão-Pires et al., 2022)', [known]).length, 1);
  const particle = refs('(de Souza et al., 2020)', []);
  assert.equal(particle.length, 1);
  assert.equal(particle[0].match, 'de Souza et al., 2020');
  assert.deepEqual(refs('(de Souza et al., 2020)', [{ texto: 'Souza R. Um estudo. 2020.' }]), []);
});

test('referencia: only the author-year shapes of a citation are read', () => {
  for (const text of [
    'Em 2024 houve mudanças.',
    'A turma de 2024 fez o exercício.',
    '(em 2024)',
    '(2024)',
    '(ver a ficha 3, 2024)',
    'Janeiro de 2024, em Lisboa.',
    'No Quadro, 2024 é o ano.',
    'O módulo 10.5 e o ponto 2.3.',
  ]) {
    assert.deepEqual(refs(text, []), [], text);
  }
});

test('referencia: a citation is checked in the whole text, code included', () => {
  assert.equal(refs('```\n(Holderried et al., 2024)\n```', []).length, 1);
});

test('referencia: references may be plain strings, and ctx may be partial', () => {
  assert.deepEqual(refs('ver 10.2196/53961', ['Autor. DOI 10.2196/53961']), []);
  assert.equal(only('referencia', lintSection('correccao', 'ver 10.2196/53961', {})).length, 1);
  assert.equal(only('referencia', lintSection('correccao', 'ver 10.2196/53961')).length, 1);
});

test('referencia: one warning for each different citation', () => {
  const found = refs('(Costa, 2020) e (Costa, 2020), 10.1000/abc e PMID 123456', []);
  assert.equal(found.length, 3);
});

// ---------------------------------------------------------------- numero

function numeros(text, materials = '') {
  return only('numero', lintSection('armadilhas', text, { referencias: [], materials }));
}

test('numero: a percentage that is not in the materials gives a warning', () => {
  const found = numeros('em 56,4 % dos casos', '');
  assert.equal(found.length, 1);
  assert.equal(found[0].rule, 'numero');
  assert.equal(found[0].match, '56,4 %');
  assert.equal(typeof found[0].message, 'string');
  assert.deepEqual(numeros('em 56,4 % dos casos', 'O estudo refere 56,4 % de respostas inventadas.'), []);
});

test('numero: the decimal mark and the spacing do not matter', () => {
  assert.deepEqual(numeros('em 56,4 % dos casos', 'taxa de 56.4%'), []);
  assert.deepEqual(numeros('em 56.4% dos casos', 'taxa de 56,4 %'), []);
  assert.equal(numeros('em 56,4% dos casos')[0].match, '56,4%');
  assert.equal(numeros('em 56,4\u{A0}% dos casos')[0].match, '56,4\u{A0}%');
  assert.equal(numeros('em 50 por cento dos casos')[0].match, '50 por cento');
});

test('numero: a number counts as known only as a whole number', () => {
  assert.equal(numeros('em 50 % dos casos', 'havia 150 estudantes').length, 1);
  assert.equal(numeros('em 56 % dos casos', 'a taxa foi 56,4').length, 1);
  assert.equal(numeros('em 6,4 % dos casos', 'a taxa foi 56,4').length, 1);
  assert.equal(numeros('em 56 % dos casos', 'a taxa foi 0,56').length, 1);
  assert.deepEqual(numeros('em 50 % dos casos', 'metade, ou seja 50 de 100'), []);
});

test('numero: a range is known when all its numbers are known', () => {
  assert.equal(numeros('entre 20 e 30 % dos casos', 'só 20 casos')[0].match, '20 e 30 %');
  assert.deepEqual(numeros('entre 20 e 30 % dos casos', '20 a 30'), []);
});

test('numero: other statistics are flagged too', () => {
  const stats = [
    'com p < 0,05',
    'com p=0.03',
    'com P = 0,001',
    'um OR = 2,3',
    'um OR de 2,3',
    'um RR 1,8',
    'um HR de 0,7',
    'uma AUC de 0,91',
    'um kappa de 0,62',
    'uma média de 52,3 ± 4,1 anos',
    'amostra n = 120',
    'um r = 0,45',
    'um d de Cohen = 0,8',
    'um dp de 1,2',
    'uma SD = 4.1',
  ];
  for (const text of stats) {
    assert.equal(numeros(text, '').length, 1, text);
  }
  assert.deepEqual(numeros('com p < 0,05', 'limiar p < 0,05'), []);
  assert.deepEqual(numeros('um OR = 2,3', 'OR 2.3'), []);
  assert.equal(numeros('52,3 ± 4,1', 'media 52,3').length, 1);
  assert.deepEqual(numeros('52,3 ± 4,1', 'media 52,3 e dp 4,1'), []);
});

test('numero: ordinary numbers are not statistics', () => {
  for (const text of [
    '- **5 min.** Enquadramento',
    'de 30 a 45 minutos',
    'grupos de 3 estudantes',
    'em 2024, na ficha 3',
    'a regra 5 do prompt',
    'um doente de 72 anos',
    'o ponto 2.3',
    'a sala 12, no piso 2',
    'o n.º 4/2026 do CNE',
  ]) {
    assert.deepEqual(numeros(text, ''), [], text);
  }
});

test('numero: one warning for each different value, and code is skipped', () => {
  assert.equal(numeros('56,4 % e 56,4 % e 12 %').length, 2);
  assert.deepEqual(numeros('```text\nUm conjunto com 18% de valores ausentes e p < 0,05.\n```'), []);
  assert.deepEqual(numeros('o valor `56,4 %` aparece no código'), []);
  assert.equal(numeros('o valor 56,4 % fora do código `x`').length, 1);
});

test('numero: ctx.materials may be missing', () => {
  assert.equal(only('numero', lintSection('armadilhas', 'em 56,4 % dos casos', { referencias: [] })).length, 1);
  assert.equal(only('numero', lintSection('armadilhas', 'em 56,4 % dos casos')).length, 1);
});

// ---------------------------------------------------------------- the lint list

test('lint-pt.json: every entry has a pattern and a message and compiles', () => {
  const list = JSON.parse(fs.readFileSync(repoPath('eunomia', 'lint-pt.json'), 'utf8'));
  assert.ok(Array.isArray(list));
  assert.ok(list.length >= 20);
  for (const entry of list) {
    assert.equal(typeof entry.pattern, 'string', JSON.stringify(entry));
    assert.ok(entry.pattern.length > 0);
    assert.equal(typeof entry.flags, 'string', entry.pattern);
    assert.match(entry.flags, /^[ims]*$/, entry.pattern);
    assert.equal(typeof entry.message, 'string', entry.pattern);
    assert.ok(entry.message.length > 0, entry.pattern);
    if ('replacement' in entry) assert.equal(typeof entry.replacement, 'string', entry.pattern);
    assert.doesNotThrow(() => new RegExp(entry.pattern, `${entry.flags}gu`), entry.pattern);
    // Messages are text for the teacher: no emoji and no Brazilian spelling.
    assert.deepEqual(lintEmoji(entry.message), [], entry.pattern);
    assert.deepEqual(lingua(entry.message), [], entry.message);
  }
});

// ---------------------------------------------------------------- the reference fichas

test('the six reference fichas: house style passes the style and language lints', () => {
  for (let n = 1; n <= 6; n += 1) {
    const ficha = load(n);
    const ctx = { referencias: ficha.referencias || [], materials: '' };
    for (const id of ['meta', 'objectivo', 'formato', 'prompt_base', 'papeis', 'armadilhas', 'plano_b']) {
      if (ficha[id] === undefined) continue;
      const md = renderSection(id, ficha[id]);
      const found = lintSection(id, md, ctx).filter((w) => w.rule === 'lingua' || w.rule === 'referencia');
      assert.deepEqual(found, [], `ficha ${n}, ${id}`);
      if (id === 'formato' || id === 'armadilhas') {
        assert.deepEqual(only('estilo', lintSection(id, md, ctx)), [], `ficha ${n}, ${id}`);
      }
      assert.deepEqual(lintEmoji(md), [], `ficha ${n}, ${id}`);
    }
  }
});

test('ficha 1: the percentage in armadilhas is flagged until the materials hold it', () => {
  const ficha = load(1);
  const md = renderSection('armadilhas', ficha.armadilhas);
  const flagged = only('numero', lintSection('armadilhas', md, { referencias: ficha.referencias, materials: '' }));
  assert.deepEqual(
    flagged.map((w) => w.match),
    ['56,4 %'],
  );
  assert.deepEqual(only('numero', lintSection('armadilhas', md, { referencias: ficha.referencias, materials: '56,4' })), []);
});

test('the pasted prompts of the reference fichas raise no number warning (they sit in code)', () => {
  for (const n of [3, 5]) {
    const ficha = load(n);
    const md = renderSection('prompt_base', ficha.prompt_base);
    assert.deepEqual(only('numero', lintSection('prompt_base', md, NO_CTX)), [], `ficha ${n}`);
  }
});
