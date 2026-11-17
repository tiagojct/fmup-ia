'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const {
  validateFicha,
  validateSection,
  renderQmd,
  renderSection,
  readEunomiaFrontMatter,
  slugify,
  SECTION_ORDER,
} = require('../src/ficha.js');
const { repoRoot, repoPath } = require('../src/paths.js');

const REFERENCIA = path.join(__dirname, '..', 'referencia');
const FICHAS_QMD = [
  '1-doente-virtual',
  '2-critica-de-outputs',
  '3-aluno-corretor',
  '4-advogado-do-diabo',
  '5-fazer-e-comparar',
  '6-tutor-restringido',
];

function load(n) {
  return JSON.parse(fs.readFileSync(path.join(REFERENCIA, `ficha-${n}.json`), 'utf8'));
}

function clone(x) {
  return JSON.parse(JSON.stringify(x));
}

function splitQmd(src) {
  const m = src.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  return { front: m[1], body: m[2] };
}

// Section headings only: "## " lines outside code fences and outside ::: divs (callout titles).
function headings(qmd) {
  const found = [];
  let inCode = false;
  let inDiv = false;
  for (const line of qmd.split('\n')) {
    if (/^```/.test(line)) inCode = !inCode;
    else if (!inCode && /^:::\s*\{/.test(line)) inDiv = true;
    else if (!inCode && /^:::\s*$/.test(line)) inDiv = false;
    else if (!inCode && !inDiv && /^## /.test(line)) found.push(line.slice(3));
  }
  return found;
}

function newProfileFicha() {
  const f = load(1);
  f.regime_ia = { papel: 'contraparte', regime: 'permitido' };
  f.declaracao = {
    texto: 'Material preparado com o Eunomia (IAedu, GPT-4o) e revisto por Tiago Jacinto.',
  };
  return f;
}

// ---------------------------------------------------------------- fixtures

for (let n = 1; n <= 7; n += 1) {
  test(`ficha ${n} is valid in the reference profile`, () => {
    assert.deepEqual(validateFicha(load(n), 'reference'), []);
  });
}

test('SECTION_ORDER has the eleven sections in the ficha order', () => {
  assert.deepEqual(SECTION_ORDER, [
    'meta',
    'objectivo',
    'formato',
    'prompt_base',
    'papeis',
    'correccao',
    'armadilhas',
    'plano_b',
    'regime_ia',
    'referencias',
    'declaracao',
  ]);
});

// ---------------------------------------------------------------- profiles

test('ficha 1 in profile new misses regime_ia and declaracao', () => {
  const errors = validateFicha(load(1), 'new');
  assert.ok(errors.includes('Falta a secção regime_ia.'), errors.join(' | '));
  assert.ok(errors.includes('Falta a secção declaracao.'), errors.join(' | '));
});

test('a complete new ficha is valid in profile new', () => {
  assert.deepEqual(validateFicha(newProfileFicha(), 'new'), []);
});

test('armadilhas: 3 to 6 in profile new, 1 or more in profile reference', () => {
  const f = newProfileFicha();
  f.armadilhas = Array.from({ length: 7 }, (_, i) => ({ lead: `Lead ${i}.`, texto: 'Texto.' }));
  assert.deepEqual(validateFicha(f, 'reference'), []);
  const errors = validateFicha(f, 'new');
  assert.equal(errors.length, 1, errors.join(' | '));
  assert.match(errors[0], /7/);
  assert.match(errors[0], /3 a 6/);
  f.armadilhas = f.armadilhas.slice(0, 2);
  assert.match(validateFicha(f, 'new').join(' | '), /3 a 6/);
  f.armadilhas = [];
  assert.ok(validateFicha(f, 'reference').length > 0);
});

test('an unknown profile throws', () => {
  assert.throws(() => validateFicha(load(1), 'other'), TypeError);
});

// ---------------------------------------------------------------- schema messages

test('schema errors are in Portuguese and name the field', () => {
  const f = load(1);
  delete f.correccao;
  delete f.objectivo.competencia_protegida;
  f.meta.titulo = 5;
  f.meta.subtitulo = '';
  f.meta.extra = 'x';
  f.armadilhas[2] = { lead: 'Só o lead.' };
  f.meta_eunomia.estado = 'publicada';
  f.referencias[0].origem = 'wikipedia';
  const errors = validateFicha(f, 'reference');
  assert.ok(errors.includes('Falta a secção correccao.'), errors.join(' | '));
  assert.ok(
    errors.includes('Falta o campo competencia_protegida em objectivo.'),
    errors.join(' | '),
  );
  assert.ok(errors.includes('O campo meta.titulo tem de ser texto.'), errors.join(' | '));
  assert.ok(errors.includes('O campo meta.subtitulo não pode estar vazio.'), errors.join(' | '));
  assert.ok(errors.includes('Campo não previsto: meta.extra.'), errors.join(' | '));
  assert.ok(errors.includes('Falta o campo texto em armadilhas[3].'), errors.join(' | '));
  assert.ok(
    errors.some((e) => e.startsWith('O campo meta_eunomia.estado tem de ser um de:')),
    errors.join(' | '),
  );
  assert.ok(
    errors.some((e) => e.startsWith('O campo referencias[1].origem tem de ser um de:')),
    errors.join(' | '),
  );
  for (const e of errors) assert.ok(!/must |should |is not|property/.test(e), e);
});

test('a non-object ficha gives one error', () => {
  assert.deepEqual(validateFicha(null, 'reference'), ['A ficha tem de ser um objecto JSON.']);
  assert.deepEqual(validateFicha([], 'new'), ['A ficha tem de ser um objecto JSON.']);
});

test('regime_ia: condicoes are required when the regime is condicionado', () => {
  const f = newProfileFicha();
  f.regime_ia = { papel: 'ferramenta', regime: 'condicionado' };
  assert.ok(
    validateFicha(f, 'new').includes('Falta o campo condicoes em regime_ia.'),
    validateFicha(f, 'new').join(' | '),
  );
  f.regime_ia.condicoes = 'Os estudantes registam o prompt usado.';
  assert.deepEqual(validateFicha(f, 'new'), []);
  f.regime_ia.themis = { clausula: 'Cláusula.', avisos: ['Aviso um.'] };
  assert.deepEqual(validateFicha(f, 'new'), []);
});

// ---------------------------------------------------------------- section rules

test('duration rule: blocks inside the range are valid', () => {
  const f = load(1);
  f.meta.duracao = { min: 30, max: 45, texto: '30 a 45 minutos' };
  f.formato.blocos = [
    { minutos: 5, texto: 'A.' },
    { minutos: 15, texto: 'B.' },
    { minutos: 10, texto: 'C.' },
    { minutos: 15, texto: 'D.' },
  ];
  assert.deepEqual(validateFicha(f, 'reference'), []);
});

test('duration rule: blocks outside the range give one message', () => {
  const f = load(1);
  f.meta.duracao = { min: 30, max: 45, texto: '30 a 45 minutos' };
  f.formato.blocos = [
    { minutos: 5, texto: 'A.' },
    { minutos: 15, texto: 'B.' },
    { minutos: 15, texto: 'C.' },
    { minutos: 15, texto: 'D.' },
  ];
  assert.deepEqual(validateFicha(f, 'reference'), [
    'Os blocos somam 50 min, fora da duração indicada (30 a 45 min).',
  ]);
});

test('duration rule: a block range gives a range of totals', () => {
  const f = load(1);
  f.formato.blocos[3] = { minutos: 10, minutos_max: 20, texto: 'Discussão.' };
  assert.deepEqual(validateFicha(f, 'reference'), [
    'Os blocos somam 40 a 50 min, fora da duração indicada (30 a 45 min).',
  ]);
});

test('duration rule: a fixed duration names one number', () => {
  const f = load(5);
  f.formato.blocos[0].minutos = 20;
  assert.deepEqual(validateFicha(f, 'reference'), [
    'Os blocos somam 45 min, fora da duração indicada (40 min).',
  ]);
});

test('duration rule: min above max and a block range that is not a range', () => {
  const f = load(1);
  f.meta.duracao = { min: 50, max: 30, texto: 'x' };
  f.formato.blocos[0].minutos_max = 5;
  const errors = validateFicha(f, 'reference');
  assert.ok(errors.includes('A duração mínima (50) é superior à máxima (30).'), errors.join(' | '));
  assert.ok(
    errors.includes('O bloco 1 tem minutos_max (5) que não é superior a minutos (5).'),
    errors.join(' | '),
  );
});

test('profile new: blocks need min and max in the duration', () => {
  const f = newProfileFicha();
  f.meta.duracao = { texto: '30 a 45 minutos' };
  const errors = validateFicha(f, 'new');
  assert.ok(errors.includes('Falta o campo min em meta.duracao.'), errors.join(' | '));
  assert.ok(errors.includes('Falta o campo max em meta.duracao.'), errors.join(' | '));
  // The reference profile does not ask for them (the six fixtures stay valid).
  assert.deepEqual(validateFicha(f, 'reference'), []);
  // Without blocks, a free duration is fine in profile new.
  const g = clone(f);
  delete g.formato.blocos;
  g.formato.texto = 'Serviço disponível ao longo do semestre.';
  assert.deepEqual(validateFicha(g, 'new'), []);
  // With min and max it is valid.
  f.meta.duracao = { min: 30, max: 45, texto: '30 a 45 minutos' };
  assert.deepEqual(validateFicha(f, 'new'), []);
});

test('formato needs blocks or text', () => {
  const f = load(1);
  f.formato = {};
  assert.deepEqual(validateFicha(f, 'reference'), [
    'A secção formato precisa de blocos com minutos ou de um texto.',
  ]);
});

test('extras: the position needs one valid anchor', () => {
  const f = load(1);
  f.extras = [
    { titulo: 'A', texto: 'x', position: { before: 'plano_b' } },
    { titulo: 'B', texto: 'x', position: {} },
    { titulo: 'C', texto: 'x', position: { before: 'objectivo', after: 'meta' } },
    { titulo: 'D', texto: 'x', position: { after: 'nada' } },
    { titulo: 'E', texto: 'x', position: { after: 'armadilhas' } },
    { titulo: 'F', texto: 'x', position: { before: 'objectivo' } },
  ];
  const errors = validateFicha(f, 'reference');
  assert.equal(errors.length, 4, errors.join(' | '));
  assert.match(errors[0], /extras\[1\]/);
  assert.match(errors[0], /before/);
  assert.match(errors[1], /extras\[2\]/);
  assert.match(errors[2], /extras\[3\]/);
  assert.match(errors[3], /extras\[4\]/);
  assert.match(errors[3], /after/);
});

test('plano_b: required when the activity uses AI, optional otherwise', () => {
  const f = load(1);
  delete f.plano_b;
  assert.ok(validateFicha(f, 'reference').includes('Falta a secção plano_b.'));
  delete f.prompt_base;
  assert.deepEqual(validateFicha(f, 'reference'), []);
  const g = newProfileFicha();
  delete g.prompt_base;
  delete g.plano_b;
  g.regime_ia = { papel: 'ferramenta', regime: 'permitido' };
  assert.ok(validateFicha(g, 'new').includes('Falta a secção plano_b.'));
  g.regime_ia = { papel: 'nenhum', regime: 'proibido' };
  assert.deepEqual(validateFicha(g, 'new'), []);
});

test('plano_b: a text or a reason is needed', () => {
  const f = load(1);
  f.plano_b = { texto: '' };
  assert.deepEqual(validateFicha(f, 'reference'), [
    'O plano B precisa de um texto ou de sem_plano_b_motivo.',
  ]);
  f.plano_b = { sem_plano_b_motivo: 'a actividade é o sistema' };
  assert.deepEqual(validateFicha(f, 'reference'), []);
});

// ---------------------------------------------------------------- validateSection

test('validateSection: armadilhas with 7 items in profile new gives a count error', () => {
  const sete = Array.from({ length: 7 }, (_, i) => ({ lead: `Lead ${i}.`, texto: 'Texto.' }));
  const errors = validateSection('armadilhas', sete, 'new');
  assert.equal(errors.length, 1, errors.join(' | '));
  assert.match(errors[0], /3 a 6/);
  assert.deepEqual(validateSection('armadilhas', sete, 'reference'), []);
  assert.deepEqual(validateSection('armadilhas', load(1).armadilhas, 'new'), []);
});

test('validateSection checks one section and ignores the missing ones', () => {
  assert.deepEqual(validateSection('objectivo', load(1).objectivo, 'new'), []);
  assert.deepEqual(validateSection('regime_ia', { papel: 'nenhum', regime: 'proibido' }, 'new'), []);
  assert.deepEqual(validateSection('declaracao', { texto: 'x' }, 'new'), []);
  assert.deepEqual(validateSection('extras', [], 'new'), []);
  assert.deepEqual(validateSection('objectivo', { texto: 'x' }, 'new'), [
    'Falta o campo competencia_protegida em objectivo.',
  ]);
  assert.deepEqual(validateSection('papeis', { estudante: 'x', docente: '' }, 'new'), [
    'O campo papeis.docente não pode estar vazio.',
  ]);
});

test('validateSection applies the duration rule when the meta is given', () => {
  const f = load(1);
  const formato = clone(f.formato);
  formato.blocos[1].minutos = 30;
  assert.deepEqual(validateSection('formato', formato, 'reference'), []);
  assert.deepEqual(validateSection('formato', formato, 'reference', f), [
    'Os blocos somam 55 a 60 min, fora da duração indicada (30 a 45 min).',
  ]);
});

test('validateSection applies the plano_b rule', () => {
  assert.deepEqual(validateSection('plano_b', { texto: '' }, 'reference'), [
    'O plano B precisa de um texto ou de sem_plano_b_motivo.',
  ]);
  assert.deepEqual(validateSection('plano_b', load(6).plano_b, 'reference'), []);
});

test('validateSection rejects an unknown section', () => {
  assert.deepEqual(validateSection('nada', {}, 'new'), ['Secção desconhecida: nada.']);
});

// ---------------------------------------------------------------- rendering

test('renderQmd has the section headings in order and the ficha-meta table', () => {
  const qmd = renderQmd(load(1));
  const found = headings(qmd);
  assert.deepEqual(found, [
    'Objectivo de aprendizagem',
    'Formato e duração em aula',
    'Prompt base',
    'Papéis',
    'Como se corrige ou discute',
    'Armadilhas conhecidas',
    'Plano B sem ligação à internet',
    'Referência',
  ]);
  assert.ok(qmd.includes('::: {.ficha-meta}\n| | |\n|---|---|\n'));
  assert.ok(qmd.includes('| **Competência** | Anamnese, comunicação clínica |'));
  assert.ok(qmd.includes('| **Duração** | 30 a 45 minutos, consoante a troca de papéis |'));
});

test('renderQmd front matter keeps the ficha as base64 JSON under eunomia', () => {
  for (let n = 1; n <= 7; n += 1) {
    const ficha = load(n);
    const qmd = renderQmd(ficha);
    const { front } = splitQmd(qmd);
    const lines = front.split('\n').filter((l) => l.startsWith('eunomia:'));
    assert.equal(lines.length, 1, `ficha ${n}`);
    const m = lines[0].match(/^eunomia: "([A-Za-z0-9+/]+={0,2})"$/);
    assert.ok(m, `ficha ${n}: one line, one quoted standard base64 string`);
    assert.equal(Buffer.from(m[1], 'base64').toString('utf8'), JSON.stringify(ficha));
    assert.deepEqual(readEunomiaFrontMatter(qmd), ficha);
  }
});

test('readEunomiaFrontMatter accepts CRLF line ends', () => {
  const ficha = load(2);
  const qmd = renderQmd(ficha).replace(/\n/g, '\r\n');
  assert.ok(qmd.includes('\r\n'));
  assert.deepEqual(readEunomiaFrontMatter(qmd), ficha);
});

test('readEunomiaFrontMatter names eunomia when the value does not decode', () => {
  const frontWith = (value) => `---\ntitle: "x"\neunomia: ${value}\n---\n\nTexto.\n`;
  const b64 = (t) => Buffer.from(t, 'utf8').toString('base64');
  const namesEunomia = (err) =>
    err instanceof Error && !(err instanceof SyntaxError) && /eunomia/.test(err.message);
  for (const value of [
    '"!!! não é base64"',
    `"${b64('isto não é JSON')}"`,
    `"${b64('[1, 2]')}"`,
    `"${b64('"texto"')}"`,
    '""',
  ]) {
    assert.throws(() => readEunomiaFrontMatter(frontWith(value)), namesEunomia, value);
  }
});

test('readEunomiaFrontMatter reads a library file and rejects a file without the key', () => {
  const ficha = load(3);
  ficha.correccao.texto = 'Acentuação, ç, õ, “aspas” e @ numa linha.';
  assert.deepEqual(readEunomiaFrontMatter(renderQmd(ficha)), ficha);
  assert.throws(
    () => readEunomiaFrontMatter('---\ntitle: "x"\n---\n\nTexto.\n'),
    /eunomia/,
  );
  assert.throws(() => readEunomiaFrontMatter('Sem front matter.'), /eunomia/);
});

test('an @ in an extra title and text renders as \\@, except in code', () => {
  const f = load(1);
  f.extras = [
    {
      titulo: 'Contacte @docente',
      texto: 'Escreva a ana@fmup.up.pt ou a @ana.\n\n```text\nx@y.pt\n```\n\nUse `@param`.',
      position: { after: 'armadilhas' },
    },
  ];
  const qmd = renderQmd(f);
  assert.ok(qmd.includes('## Contacte \\@docente\n\nEscreva a ana\\@fmup.up.pt ou a \\@ana.'));
  assert.ok(qmd.includes('```text\nx@y.pt\n```'));
  assert.ok(qmd.includes('Use `@param`.'));
  assert.equal(
    renderSection('extras', f.extras).split('\n')[0],
    '## Contacte \\@docente',
  );
  const { body } = splitQmd(qmd);
  const outsideCode = body.replace(/```[\s\S]*?```|`[^`]*`/g, '');
  assert.ok(!/(?<!\\)@/.test(outsideCode), 'no bare @ outside code');
});

test('extras render as sections, and renderSection agrees with validateSection', () => {
  const f = newProfileFicha();
  const extras = [
    { titulo: 'Antes', texto: 'Texto antes.', position: { before: 'objectivo' } },
    { titulo: 'Depois', texto: 'Texto depois.', position: { after: 'armadilhas' } },
  ];
  assert.equal(
    renderSection('extras', extras),
    '## Antes\n\nTexto antes.\n\n## Depois\n\nTexto depois.',
  );
  assert.equal(renderSection('extras', []), '');
  assert.deepEqual(validateSection('extras', extras, 'new'), []);
  // Every section id that validateSection accepts can be rendered.
  const samples = { ...f, extras };
  for (const id of [...SECTION_ORDER, 'extras']) {
    assert.deepEqual(validateSection(id, samples[id], 'new', f), [], id);
    assert.ok(renderSection(id, samples[id]).length > 0, id);
  }
  // And both refuse an unknown id.
  assert.deepEqual(validateSection('nada', {}, 'new'), ['Secção desconhecida: nada.']);
  assert.throws(() => renderSection('nada', {}), /nada/);
});

test('extras with an unknown anchor render at the end of the document', () => {
  const f = newProfileFicha();
  f.extras = [
    { titulo: 'Depois de nada', texto: 'T1.', position: { after: 'nada' } },
    { titulo: 'Sem âncora', texto: 'T2.', position: {} },
    { titulo: 'Antes errado', texto: 'T3.', position: { before: 'plano_b' } },
    { titulo: 'Sem posição', texto: 'T4.' },
    { titulo: 'Bem colocado', texto: 'T5.', position: { after: 'meta' } },
  ];
  assert.ok(validateFicha(f, 'new').length > 0);
  const found = headings(renderQmd(f));
  assert.deepEqual(found, [
    'Bem colocado',
    'Objectivo de aprendizagem',
    'Formato e duração em aula',
    'Prompt base',
    'Papéis',
    'Como se corrige ou discute',
    'Armadilhas conhecidas',
    'Plano B sem ligação à internet',
    'Regime de IA',
    'Referência',
    'Declaração de uso de IA',
    'Depois de nada',
    'Sem âncora',
    'Antes errado',
    'Sem posição',
  ]);
});

test('escapeAt limit: an @ inside an autolink is escaped too', () => {
  // Known limit, kept on purpose. The escape works line by line on plain text. It knows
  // code fences and inline code, but not autolinks or indented code blocks. So
  // <https://x.org/@user> becomes <https://x.org/\@user>, which Pandoc does not read as an
  // autolink. Write such a link as [text](https://x.org/@user): a backslash escape works
  // inside the destination of a Markdown link.
  assert.equal(
    renderSection('correccao', { texto: 'Ver <https://x.org/@user>.' }),
    'Ver <https://x.org/\\@user>.',
  );
  assert.equal(
    renderSection('correccao', { texto: 'Ver [a página](https://x.org/@user).' }),
    'Ver [a página](https://x.org/\\@user).',
  );
});

test('renderSection: armadilhas and formato blocks follow the ficha style', () => {
  assert.ok(
    renderSection('armadilhas', [{ lead: 'Saída de papel.', texto: 'Perante...' }]).startsWith(
      '- **Saída de papel.** Perante',
    ),
  );
  const formato = renderSection('formato', load(1).formato);
  assert.ok(formato.startsWith('- **5 min.** Enquadramento'));
  assert.ok(formato.includes('- **10 a 15 min.** Discussão em plenário.'));
});

test('renderSection: plano_b with a reason, regime_ia and declaracao', () => {
  assert.ok(renderSection('plano_b', load(6).plano_b).startsWith('Não há plano B: a actividade é o sistema.\n\nO que existe'));
  assert.equal(
    renderSection('plano_b', { sem_plano_b_motivo: 'não usa a internet.' }),
    'Não há plano B: não usa a internet.',
  );
  assert.equal(
    renderSection('regime_ia', { papel: 'nenhum', regime: 'proibido' }),
    'Esta actividade não usa IA.\n\nRegime para os estudantes durante a actividade, vermelho: proibido.',
  );
  const regime = renderSection('regime_ia', {
    papel: 'ferramenta',
    regime: 'condicionado',
    condicoes: 'Registar o prompt.',
    themis: { clausula: 'Cláusula X.', avisos: ['Aviso um.', 'Aviso dois.'] },
  });
  assert.ok(regime.includes('amarelo: permitido com condições'));
  assert.ok(regime.includes('Condições: Registar o prompt.'));
  assert.ok(regime.includes('Cláusula X.'));
  assert.ok(regime.includes('- Aviso um.\n- Aviso dois.'));
  assert.equal(renderSection('declaracao', { texto: ' Texto da declaração. ' }), 'Texto da declaração.');
});

test('new sections render after plano_b and before/after referencias', () => {
  const qmd = renderQmd(newProfileFicha());
  const found = headings(qmd);
  assert.deepEqual(found.slice(-4), [
    'Plano B sem ligação à internet',
    'Regime de IA',
    'Referência',
    'Declaração de uso de IA',
  ]);
});

test('extras go where their position says', () => {
  const f = load(1);
  f.extras = [
    { titulo: 'Antes', texto: 'Texto antes.', position: { before: 'objectivo' } },
    { titulo: 'Depois das armadilhas', texto: 'Texto depois.', position: { after: 'armadilhas' } },
    { titulo: 'Segundo depois', texto: 'Outro.', position: { after: 'armadilhas' } },
  ];
  assert.deepEqual(validateFicha(f, 'reference'), []);
  const qmd = renderQmd(f);
  const found = headings(qmd);
  assert.deepEqual(found, [
    'Antes',
    'Objectivo de aprendizagem',
    'Formato e duração em aula',
    'Prompt base',
    'Papéis',
    'Como se corrige ou discute',
    'Armadilhas conhecidas',
    'Depois das armadilhas',
    'Segundo depois',
    'Plano B sem ligação à internet',
    'Referência',
  ]);
  assert.ok(qmd.indexOf('## Antes') > qmd.indexOf('{.ficha-meta}'));
});

test('an @ in body text renders as \\@, except in code', () => {
  const f = load(1);
  f.correccao.texto = 'Escreva para ana@fmup.up.pt ou para @docente. Já escapado: \\@x.';
  f.objectivo.texto = 'Use `@param` no código e @ fora.';
  f.prompt_base.texto = 'Introdução.\n\n```text\nenvia para x@y.pt\n```\n\nDepois @fim.';
  f.meta.ferramenta = 'IAedu @ FMUP';
  const qmd = renderQmd(f);
  assert.ok(qmd.includes('ana\\@fmup.up.pt ou para \\@docente. Já escapado: \\@x.'));
  assert.ok(qmd.includes('Use `@param` no código e \\@ fora.'));
  assert.ok(qmd.includes('```text\nenvia para x@y.pt\n```'));
  assert.ok(qmd.includes('Depois \\@fim.'));
  assert.ok(qmd.includes('| **Ferramenta** | IAedu \\@ FMUP |'));
  const { front, body } = splitQmd(qmd);
  assert.ok(!front.includes('@'), 'no raw @ in the front matter');
  const outsideCode = body.replace(/```[\s\S]*?```|`[^`]*`/g, '');
  assert.ok(!/(?<!\\)@/.test(outsideCode), 'no bare @ outside code');
  assert.deepEqual(readEunomiaFrontMatter(qmd), f);
});

test('title and subtitle: an @ reaches Pandoc as \\@', () => {
  const f = load(1);
  f.meta.titulo = 'Contacte @docente';
  f.meta.subtitulo = 'Já escapado \\@x e a@b.pt';
  const qmd = renderQmd(f);
  const { front } = splitQmd(qmd);
  const yamlValue = (key) =>
    front
      .split('\n')
      .find((l) => l.startsWith(`${key}: `))
      .slice(key.length + 2);
  // A YAML double-quoted string uses the same escapes as JSON, so JSON.parse decodes it.
  assert.equal(JSON.parse(yamlValue('title')), 'Contacte \\@docente');
  assert.equal(JSON.parse(yamlValue('subtitle')), 'Já escapado \\@x e a\\@b.pt');
  assert.equal(yamlValue('title'), '"Contacte \\\\@docente"');
  // The ficha itself keeps the text as typed.
  assert.equal(readEunomiaFrontMatter(qmd).meta.titulo, 'Contacte @docente');
  assert.equal(readEunomiaFrontMatter(qmd).meta.subtitulo, 'Já escapado \\@x e a@b.pt');
});

test('a pipe in a meta cell is escaped', () => {
  const f = load(1);
  f.meta.areas = 'Clínica | Básicas';
  assert.ok(renderQmd(f).includes('| **Áreas** | Clínica \\| Básicas |'));
});

// ---------------------------------------------------------------- round trip

for (let n = 1; n <= 6; n += 1) {
  test(`ficha ${n} renders back to the text of training/fichas`, () => {
    const original = fs.readFileSync(
      repoPath('training', 'fichas', `${FICHAS_QMD[n - 1]}.qmd`),
      'utf8',
    );
    const rendered = splitQmd(renderQmd(load(n)));
    let expected = splitQmd(original);
    if (n === 6) {
      // The Opção avançada callout is an extra section: a heading, not a callout.
      expected = {
        front: expected.front,
        body: expected.body.replace(
          /::: \{\.callout-important appearance="simple"\}\n(## Opção avançada\n\n[\s\S]*?)\n:::\n/,
          '$1\n',
        ),
      };
    }
    assert.equal(rendered.body, expected.body);
    const frontLines = rendered.front.split('\n').filter((l) => !l.startsWith('eunomia: '));
    assert.deepEqual(frontLines, expected.front.split('\n'));
  });
}

// ---------------------------------------------------------------- slugify

test('the sources keep combining marks and line separators as escapes', () => {
  for (const file of ['ficha.js', 'paths.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8');
    assert.ok(!/[\u0300-\u036f\u2028\u2029]/.test(src), `${file} has a raw combining or separator character`);
  }
});

test('slugify lowercases, drops accents and uses hyphens', () => {
  assert.equal(
    slugify('Avaliação crítica de um relatório ATS'),
    'avaliacao-critica-de-um-relatorio-ats',
  );
  assert.equal(slugify('  Ficha 1.  Doente   virtual!  '), 'ficha-1-doente-virtual');
  assert.equal(slugify('Ação, coração e pãezinhos'), 'acao-coracao-e-paezinhos');
  assert.equal(slugify(''), '');
});

// ---------------------------------------------------------------- paths

test('repoPath resolves under the repository root', () => {
  assert.ok(fs.existsSync(repoPath('eunomia', 'ficha.schema.json')));
  assert.equal(repoPath('a', 'b'), path.join(repoRoot, 'a', 'b'));
});

test('EUNOMIA_REPO_ROOT overrides the repository root', () => {
  const out = execFileSync(
    process.execPath,
    ['-e', "process.stdout.write(require('./src/paths.js').repoPath('x', 'y'))"],
    { cwd: path.join(__dirname, '..'), env: { ...process.env, EUNOMIA_REPO_ROOT: '/tmp/raiz' } },
  ).toString();
  assert.equal(out, path.join('/tmp/raiz', 'x', 'y'));
});

test('section ids that are Object.prototype names are unknown sections', () => {
  for (const id of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
    assert.throws(() => renderSection(id, {}), /Secção desconhecida/, id);
    assert.deepEqual(validateSection(id, {}, 'new'), [`Secção desconhecida: ${id}.`], id);
  }
});
