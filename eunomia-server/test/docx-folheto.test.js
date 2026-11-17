'use strict';

// The exports of 0.2 (spec D5, D8): the ficha as a Word file and the student handout.

const test = require('node:test');
const assert = require('node:assert/strict');
const { unzipSync } = require('fflate');

const drafts = require('../src/drafts.js');
const { assembleFicha, REFERENCES } = require('../src/assemble.js');
const { SECTION_HEADINGS, SECTION_ORDER } = require('../src/ficha.js');
const { renderDocx } = require('../src/docx.js');
const { renderFolhetoMd, renderFolhetoHtml } = require('../src/folheto.js');
const { startApp, respostasCompletas, BASE } = require('./helpers.js');

const MODEL = 'gpt-4o-2024-11-20';
const WORD = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const SECTIONS = {
  objectivo: { texto: 'No fim da actividade, o estudante sustenta uma posição.', competencia_protegida: 'A competência protegida é a argumentação.' },
  formato: { blocos: [{ minutos: 20, texto: 'Grupos de **três** debatem.' }, { minutos: 25, texto: 'Plenário.' }] },
  prompt_base: { texto: '```text\nVais assumir o papel de um oponente.\n  Responde só com objecções.\n```' },
  papeis: { estudante: 'Toma posição e responde às objecções.', docente: 'Conduz o plenário com DOCENTE-SECRETO.' },
  correccao: { texto: '1. **O que mudou?** CORRECCAO-SECRETA.\n2. Quem decidiu?' },
  armadilhas: [
    { lead: 'Deriva para o consenso.', texto: 'Texto.' },
    { lead: 'Evidência inventada.', texto: 'Texto.' },
    { lead: 'Posição da ferramenta.', texto: 'Texto.' },
  ],
  plano_b: { texto: 'Imprimir as objecções.' },
};

function fullDraft({ accept = true, respostas = respostasCompletas() } = {}) {
  let d = drafts.createDraft({ id: 'a1b2c3d4', name: 'Ana Docente' }, 'criar');
  for (const [step, value] of Object.entries(respostas)) {
    const r = drafts.applyAnswer(d, step, value);
    assert.deepEqual(r.errors, [], step);
    d = r.draft;
  }
  d = drafts.approvePlan(d);
  for (const [id, dados] of Object.entries(SECTIONS)) {
    d.seccoes[id] = { dados: structuredClone(dados), estado: accept ? 'aceite' : 'gerada', avisos: [], modelo: MODEL, origem: 'modelo' };
  }
  d.referencias = [{ id: 'nicol-2006', texto: REFERENCES.find((r) => r.id === 'nicol-2006').texto, origem: 'curada' }];
  return d;
}

// A summative draft: the Themis clause is part of the regime.
function summativeRespostas(regime) {
  return {
    ...respostasCompletas(),
    evidencia: { descricao: 'Ensaio argumentativo individual.', avaliacao: 'sumativa' },
    regime,
    regime_themis: { assignment: ['essay'], policy: regime.regime === 'proibido' ? 'not_permitted' : 'with_disclosure' },
  };
}

const ficha = (d) => assembleFicha(d);
const parts = (buffer) => unzipSync(new Uint8Array(buffer));
const text = (file) => Buffer.from(file).toString('utf8');
const documentXml = async (f) => text(parts(await renderDocx(f))['word/document.xml']);

async function appWith(t, draft) {
  const app = await startApp(t);
  const ana = await app.person('Ana Docente');
  draft.autor = { id: ana.id, nome: 'Ana Docente' };
  app.store.write(`rascunhos/${ana.id}/${draft.id}.json`, draft);
  return { app, ana };
}

// Binary routes: call() reads text, so the body is read as bytes here.
async function download(app, ana, id, formato) {
  const res = await fetch(`${app.url}${BASE}/rascunhos/${id}/exportar?formato=${formato}`, { headers: { cookie: `eunomia=${ana.cookie}` } });
  return { res, bytes: Buffer.from(await res.arrayBuffer()) };
}

// ---------------------------------------------------------------- docx

test('renderDocx has the title, the subtitle, the section headings in ficha order and the meta table', async () => {
  const f = ficha(fullDraft());
  f.extras = [{ titulo: 'Anexo do docente', texto: 'Texto do anexo.', position: { after: 'formato' } }];
  const files = parts(await renderDocx(f));
  for (const name of ['[Content_Types].xml', 'word/document.xml', 'word/styles.xml']) assert.ok(files[name], name);
  const xml = text(files['word/document.xml']);

  let at = xml.indexOf(f.meta.titulo);
  assert.ok(at > -1, 'título');
  assert.ok(xml.indexOf(f.meta.subtitulo, at) > at, 'subtítulo depois do título');
  assert.match(xml, /<w:pStyle w:val="Title"\/>/);

  assert.ok(xml.includes('<w:tbl>'), 'tabela');
  assert.ok(xml.includes('Competência'));
  assert.ok(xml.includes(f.meta.areas));
  // The table comes before the first section heading.
  assert.ok(xml.indexOf('<w:tbl>') < xml.indexOf(SECTION_HEADINGS.objectivo));

  const ids = SECTION_ORDER.filter((id) => id !== 'meta' && f[id] !== undefined);
  assert.equal(ids.length, 10);
  at = xml.indexOf('<w:tbl>');
  for (const id of ids) {
    const next = xml.indexOf(SECTION_HEADINGS[id], at);
    assert.ok(next > at, `${id} depois da secção anterior`);
    at = next;
  }
  // The extra comes after formato and before prompt_base.
  const extra = xml.indexOf('Anexo do docente');
  assert.ok(extra > xml.indexOf(SECTION_HEADINGS.formato) && extra < xml.indexOf(SECTION_HEADINGS.prompt_base));

  // ## is heading 1, ### is heading 2.
  assert.equal(xml.match(/<w:pStyle w:val="Heading1"\/>/g).length, 11);
  assert.equal(xml.match(/<w:pStyle w:val="Heading2"\/>/g).length, 2);
  assert.ok(xml.indexOf('Papel do estudante') > xml.indexOf(SECTION_HEADINGS.papeis));
});

test('renderDocx strips control characters, removes Markdown escapes and keeps special characters', async () => {
  const f = ficha(fullDraft());
  f.papeis.estudante = 'a\u0007b contacto\\@med.up.pt & <x> | c';
  f.meta.formato = 'Pares | grupos';
  f.meta.titulo = 'Debate\u0001 sobre o fim de vida';
  f.meta.subtitulo = 'Sub\u0008título';
  f.correccao.texto = 'Fim\ufffe do\uD800 texto\uffff.';
  const xml = await documentXml(f);
  assert.ok(xml.includes('ab contacto@med.up.pt &amp; &lt;x&gt; | c'), xml.slice(xml.indexOf('contacto') - 40, xml.indexOf('contacto') + 80));
  assert.ok(xml.includes('Pares | grupos'));
  assert.ok(xml.includes('Debate sobre o fim de vida'));
  assert.ok(xml.includes('Subtítulo'));
  assert.ok(xml.includes('Fim do texto.'));
  assert.doesNotMatch(xml, /\\@/);
  assert.doesNotMatch(xml, /\\\|/);
  // No character that XML 1.0 forbids, and no lone surrogate.
  assert.doesNotMatch(xml, /[\u0000-\u0008\u000B\u000C\u000E-\u001F\ufffe\uffff]/);
  assert.doesNotMatch(xml, /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
  assert.doesNotMatch(xml, /<x>/);
});

test('bold Markdown becomes a bold run; italic, code, links, lists and code blocks have their own form', async () => {
  const f = ficha(fullDraft());
  f.referencias = [];
  f.correccao.texto = [
    'Texto com **negrito**, *itálico*, `código` e [a Quadro](https://fmup.example/quadro).',
    '',
    'Ligação [relativa](../x), [perigosa](javascript:alert(1)) e <https://exemplo.pt>.',
    '',
    '- primeiro',
    '- segundo',
    '',
    '1. um',
    '2. dois',
    '',
    '1. outra lista',
    '',
    '::: {.callout-note}',
    'Dentro de um bloco.',
    ':::',
  ].join('\n');
  const files = parts(await renderDocx(f));
  const xml = text(files['word/document.xml']);
  assert.ok(xml.includes('<w:b/>'));
  assert.ok(xml.includes('<w:i/>'));
  assert.match(xml, /<w:rFonts [^>]*w:ascii="Courier New"/);
  // Real links only for http(s) and mailto.
  const rels = text(files['word/_rels/document.xml.rels']);
  assert.match(rels, /Target="https:\/\/fmup\.example\/quadro"[^>]*TargetMode="External"/);
  assert.match(rels, /Target="https:\/\/exemplo\.pt"/);
  assert.doesNotMatch(rels, /javascript/);
  assert.doesNotMatch(rels, /\.\.\/x/);
  assert.equal(xml.match(/<w:hyperlink /g).length, 2);
  assert.ok(xml.includes('relativa') && xml.includes('perigosa'));
  // Bullets and numbers; the second numbered list starts again.
  assert.ok(files['word/numbering.xml']);
  assert.ok(xml.includes('primeiro') && xml.includes('segundo'));
  assert.ok(xml.includes('Dentro de um bloco.'));
  assert.doesNotMatch(xml, /:::/);
  const numbered = [...xml.matchAll(/<w:p>(?:(?!<\/w:p>).)*?<w:numId w:val="(\d+)"\/>(?:(?!<\/w:p>).)*?(?:um|dois|outra lista)<\/w:t>/gs)].map((m) => m[1]);
  assert.equal(numbered.length, 3);
  assert.equal(numbered[0], numbered[1]);
  assert.notEqual(numbered[1], numbered[2]);
});

test('a fenced code block is monospace lines without the fence, and the blocks of formato are a list', async () => {
  const xml = await documentXml(ficha(fullDraft()));
  assert.ok(xml.includes('Vais assumir o papel de um oponente.'));
  assert.ok(xml.includes('  Responde só com objecções.'));
  assert.doesNotMatch(xml, /```/);
  assert.match(xml, /<w:rFonts [^>]*w:ascii="Courier New"/);
  assert.ok(xml.includes('20 min.') && xml.includes('Grupos de '));
  assert.match(xml, /<w:numPr>/);
});

test('renderDocx is a Promise of a Buffer that starts with PK, and a ficha without references has no Referência heading', async () => {
  const f = ficha(fullDraft());
  f.referencias = [];
  const buffer = await renderDocx(f);
  assert.ok(Buffer.isBuffer(buffer));
  assert.equal(buffer.subarray(0, 2).toString('latin1'), 'PK');
  assert.ok(!text(parts(buffer)['word/document.xml']).includes(SECTION_HEADINGS.referencias));
});

test('renderDocx works for the six reference fichas', async () => {
  const fs = require('node:fs');
  const path = require('node:path');
  for (let n = 1; n <= 6; n++) {
    const f = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'referencia', `ficha-${n}.json`), 'utf8'));
    const xml = await documentXml(f);
    assert.ok(xml.includes('<w:tbl>'), `ficha ${n}`);
    assert.doesNotMatch(xml, /\\@|:::|\|---/, `ficha ${n}`);
    assert.doesNotMatch(xml, /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/, `ficha ${n}`);
  }
});

test('GET exportar?formato=docx is 200 with the Word type, filename slug.docx, X-Eunomia-Avisos, and a body that starts with PK; an incomplete draft is 409 incompleto', async (t) => {
  const d = fullDraft();
  const { app, ana } = await appWith(t, d);
  const { res, bytes } = await download(app, ana, d.id, 'docx');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), WORD);
  assert.equal(res.headers.get('content-disposition'), 'attachment; filename="debate-sobre-o-fim-de-vida.docx"');
  assert.equal(res.headers.get('x-eunomia-avisos'), '0');
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('content-security-policy'), null);
  assert.equal(Number(res.headers.get('content-length')), bytes.length);
  assert.equal(bytes.subarray(0, 2).toString('latin1'), 'PK');
  const xml = text(parts(bytes)['word/document.xml']);
  assert.ok(xml.includes('Debate sobre o fim de vida'));

  const open = fullDraft({ accept: false });
  const other = await appWith(t, open);
  const r = await other.app.call('GET', `/rascunhos/${open.id}/exportar?formato=docx`, { cookie: other.ana.cookie });
  assert.equal(r.status, 409);
  assert.equal(r.json.motivo, 'incompleto');
});

// ---------------------------------------------------------------- the handout

test('the handout has the student content only', async () => {
  const f = ficha(fullDraft());
  const md = renderFolhetoMd(f);
  const html = renderFolhetoHtml(f);

  assert.ok(md.startsWith(`# ${f.meta.titulo}\n\n${f.meta.subtitulo}\n\n## Objectivo\n\n`));
  const order = ['## Objectivo', '## O que vai fazer', '## Uso de IA nesta actividade', '## Declaração de uso de IA'].map((h) => md.indexOf(h));
  assert.ok(order.every((i, n) => i > -1 && (n === 0 || i > order[n - 1])), String(order));

  for (const out of [md, html]) {
    assert.ok(out.includes(SECTIONS.objectivo.texto));
    assert.ok(out.includes('Plenário.'));
    assert.ok(out.includes('Toma posição e responde às objecções.'));
    assert.ok(out.includes('Pode usar ferramentas de IA nesta actividade.'));
    assert.ok(out.includes(f.declaracao.texto));
    // Never what is for the teacher.
    for (const secret of [
      'DOCENTE-SECRETO',
      'CORRECCAO-SECRETA',
      'Vais assumir o papel de um oponente',
      'Deriva para o consenso',
      'Imprimir as objecções',
      'competência protegida',
      'Competência',
      'Nicol',
      'Papel do docente',
      'Papel do estudante',
    ]) {
      assert.ok(!out.includes(secret), secret);
    }
  }
  assert.match(html, /<h1>Debate sobre o fim de vida<\/h1>/);
  assert.match(html, /<h2>O que vai fazer<\/h2>/);
  assert.match(html, /<li><strong>20 min\.<\/strong> Grupos de <strong>três<\/strong> debatem\.<\/li>/);
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /<table/);
});

test('the handout says what the regime allows, with the conditions of a conditional regime', () => {
  const sentence = {
    permitido: 'Pode usar ferramentas de IA nesta actividade.',
    condicionado: 'Pode usar ferramentas de IA nesta actividade, nas condições indicadas.',
    proibido: 'Não pode usar ferramentas de IA nesta actividade.',
  };
  for (const regime of ['permitido', 'condicionado', 'proibido']) {
    const respostas = { ...respostasCompletas(), regime: regime === 'condicionado' ? { regime, condicoes: 'Declare cada uso no fim do texto.' } : { regime } };
    const md = renderFolhetoMd(ficha(fullDraft({ respostas })));
    const lines = md.split('\n');
    assert.ok(lines.includes(sentence[regime]), regime);
    // Exactly one of the three sentences is in the handout.
    assert.equal(Object.values(sentence).filter((x) => lines.includes(x)).length, 1, regime);
    assert.equal(lines.includes('Condições: Declare cada uso no fim do texto.'), regime === 'condicionado', regime);
    assert.ok(!md.includes('Cláusula'), regime);
  }
});

test('the handout shows the Themis clause for a summative activity with regime condicionado, and not for proibido', () => {
  const cond = ficha(fullDraft({ respostas: summativeRespostas({ regime: 'condicionado', condicoes: 'Declare o uso.' }) }));
  assert.ok(cond.regime_ia.themis.clausula.length > 50);
  for (const out of [renderFolhetoMd(cond), renderFolhetoHtml(cond)]) {
    assert.ok(out.includes(cond.regime_ia.themis.clausula), 'cláusula');
    assert.ok(out.includes('Declare o uso.'));
    // The warnings of the policy are for the teacher.
    assert.ok(!out.includes(cond.regime_ia.themis.avisos[0] || '\u0000nada'));
  }
  const clauseAt = renderFolhetoMd(cond).indexOf(cond.regime_ia.themis.clausula);
  assert.ok(clauseAt > renderFolhetoMd(cond).indexOf('## Uso de IA nesta actividade'));
  assert.ok(clauseAt < renderFolhetoMd(cond).indexOf('## Declaração de uso de IA'));

  const banned = ficha(fullDraft({ respostas: summativeRespostas({ regime: 'proibido' }) }));
  assert.ok(banned.regime_ia.themis, 'a ficha tem cláusula para a proibição');
  for (const out of [renderFolhetoMd(banned), renderFolhetoHtml(banned)]) {
    assert.ok(!out.includes(banned.regime_ia.themis.clausula));
    assert.ok(out.includes('Não pode usar ferramentas de IA nesta actividade.'));
  }

  // A formative activity has no clause at all.
  const formative = ficha(fullDraft());
  assert.equal(formative.regime_ia.themis, undefined);
});

test('the handout escapes Markdown the way the md export does, and the HTML escapes tags', () => {
  const f = ficha(fullDraft());
  f.papeis.estudante = 'Escreva para ana@med.up.pt <b>já</b>.';
  const md = renderFolhetoMd(f);
  assert.ok(md.includes('Escreva para ana\\@med.up.pt <b>já</b>.'));
  const html = renderFolhetoHtml(f);
  assert.ok(html.includes('Escreva para ana@med.up.pt &lt;b&gt;já&lt;/b&gt;.'));
  assert.doesNotMatch(html, /<b>/);
});

// ---------------------------------------------------------------- the routes

test('formato=folheto is HTML with the CSP header; formato=folheto-md is Markdown; formato=xyz is 400 and names the six formats', async (t) => {
  const d = fullDraft();
  const { app, ana } = await appWith(t, d);
  const get = (formato) => app.call('GET', `/rascunhos/${d.id}/exportar?formato=${formato}`, { cookie: ana.cookie });

  const html = await get('folheto');
  assert.equal(html.status, 200);
  assert.equal(html.headers.get('content-type'), 'text/html; charset=utf-8');
  assert.match(html.headers.get('content-security-policy'), /default-src 'none'/);
  assert.equal(html.headers.get('content-disposition'), 'attachment; filename="debate-sobre-o-fim-de-vida-folheto.html"');
  assert.equal(html.headers.get('x-eunomia-avisos'), '0');
  assert.match(html.text, /^<!doctype html>/i);
  assert.match(html.text, /<h1>Debate sobre o fim de vida<\/h1>/);
  assert.doesNotMatch(html.text, /DOCENTE-SECRETO/);

  const md = await get('folheto-md');
  assert.equal(md.status, 200);
  assert.equal(md.headers.get('content-type'), 'text/markdown; charset=utf-8');
  assert.equal(md.headers.get('content-security-policy'), null);
  assert.equal(md.headers.get('content-disposition'), 'attachment; filename="debate-sobre-o-fim-de-vida-folheto.md"');
  assert.equal(md.headers.get('x-eunomia-avisos'), '0');
  assert.ok(md.text.startsWith('# Debate sobre o fim de vida\n\n'));

  for (const formato of ['xyz', 'pdf', 'constructor', '__proto__', 'toString']) {
    const bad = await get(formato);
    assert.equal(bad.status, 400, formato);
    assert.equal(bad.json.erro, 'Formato desconhecido. Use qmd, md, html, docx, folheto ou folheto-md.');
  }

  // The old formats are unchanged.
  const qmd = await get('qmd');
  assert.equal(qmd.headers.get('content-disposition'), 'attachment; filename="debate-sobre-o-fim-de-vida.qmd"');
  assert.equal((await get('html')).headers.get('content-disposition'), 'attachment; filename="debate-sobre-o-fim-de-vida.html"');
  assert.equal((await get('md')).headers.get('content-disposition'), 'attachment; filename="debate-sobre-o-fim-de-vida.md"');
});

test('every format has the same gate: an incomplete draft is 409 incompleto and a plan not approved is 409 plano', async (t) => {
  const open = fullDraft({ accept: false });
  const { app, ana } = await appWith(t, open);
  const noPlan = fullDraft();
  noPlan.plano_aprovado = false;
  noPlan.autor = { id: ana.id, nome: 'Ana Docente' };
  app.store.write(`rascunhos/${ana.id}/${noPlan.id}.json`, noPlan);
  for (const formato of ['qmd', 'md', 'html', 'docx', 'folheto', 'folheto-md']) {
    const a = await app.call('GET', `/rascunhos/${open.id}/exportar?formato=${formato}`, { cookie: ana.cookie });
    assert.equal(a.status, 409, formato);
    assert.equal(a.json.motivo, 'incompleto', formato);
    const b = await app.call('GET', `/rascunhos/${noPlan.id}/exportar?formato=${formato}`, { cookie: ana.cookie });
    assert.equal(b.status, 409, formato);
    assert.equal(b.json.motivo, 'plano', formato);
  }
});

test('a submitted draft can still be exported by its author and by an admin', async (t) => {
  const d = fullDraft();
  d.estado = 'submetida';
  const { app, ana } = await appWith(t, d);
  const admin = await app.person('Tiago', 'admin');
  for (const person of [ana, admin]) {
    const { res, bytes } = await download(app, person, d.id, 'docx');
    assert.equal(res.status, 200);
    assert.equal(bytes.subarray(0, 2).toString('latin1'), 'PK');
  }
});
