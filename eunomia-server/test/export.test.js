'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const drafts = require('../src/drafts.js');
const { assembleFicha, buildMeta, declaracaoTexto, REFERENCES } = require('../src/assemble.js');
const { renderMd, renderHtml, markdownToHtml } = require('../src/export.js');
const { renderQmd, validateFicha, readEunomiaFrontMatter } = require('../src/ficha.js');
const { repoPath } = require('../src/paths.js');
const { startApp, respostasCompletas } = require('./helpers.js');

const MODEL = 'gpt-4o-2024-11-20';
const SECTIONS = {
  objectivo: { texto: 'No fim da actividade, o estudante sustenta uma posição.', competencia_protegida: 'A competência protegida é a argumentação.' },
  formato: { blocos: [{ minutos: 20, texto: 'Grupos.' }, { minutos: 25, texto: 'Plenário.' }] },
  prompt_base: { texto: '```text\nVais assumir o papel de um oponente.\n```' },
  papeis: { estudante: 'Toma posição.', docente: 'Conduz o plenário.' },
  correccao: { texto: '1. **O que mudou?** Cada grupo responde.' },
  armadilhas: [
    { lead: 'Deriva para o consenso.', texto: 'Texto.' },
    { lead: 'Evidência inventada.', texto: 'Texto.' },
    { lead: 'Posição da ferramenta.', texto: 'Texto.' },
  ],
  plano_b: { texto: 'Imprimir as objecções.' },
};

function fullDraft({ accept = true } = {}) {
  let d = drafts.createDraft({ id: 'a1b2c3d4', name: 'Ana Docente' }, 'criar');
  for (const [step, value] of Object.entries(respostasCompletas())) d = drafts.applyAnswer(d, step, value).draft;
  d = drafts.approvePlan(d);
  for (const [id, dados] of Object.entries(SECTIONS)) {
    d.seccoes[id] = { dados, estado: accept ? 'aceite' : 'gerada', avisos: [], modelo: MODEL, origem: 'modelo' };
  }
  d.referencias = [{ id: 'nicol-2006', texto: REFERENCES.find((r) => r.id === 'nicol-2006').texto, origem: 'curada' }];
  return d;
}

// ---------------------------------------------------------------- references.json

test('references.json has every reference id of the six fichas, with the first paragraph of its text', () => {
  for (let n = 1; n <= 6; n++) {
    const ficha = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'referencia', `ficha-${n}.json`), 'utf8'));
    for (const r of ficha.referencias) {
      const entry = REFERENCES.find((x) => x.id === r.id);
      assert.ok(entry, r.id);
      if (r.id !== 'hicke-2025') assert.equal(entry.texto, r.texto.split('\n\n')[0], r.id);
    }
  }
  assert.equal(new Set(REFERENCES.map((r) => r.id)).size, REFERENCES.length);
});

test('every reference from references.bib matches its BibTeX entry: key, year, DOI, PMID and title', () => {
  const bib = fs.readFileSync(repoPath('quadro', 'references.bib'), 'utf8');
  const fromBib = REFERENCES.filter((r) => r.fonte === 'quadro/references.bib');
  assert.ok(fromBib.length >= 8);
  for (const r of fromBib) {
    const m = new RegExp(`@\\w+\\{${r.id},([\\s\\S]*?)\\n\\}`).exec(bib);
    assert.ok(m, `chave ${r.id} não existe em references.bib`);
    const entry = m[1];
    const field = (name) => {
      const f = new RegExp(`\\b${name}\\s*=\\s*\\{(.*)\\},?\\s*$`, 'm').exec(entry);
      return f ? f[1] : null;
    };
    assert.ok(r.texto.includes(field('year')), `${r.id}: ano`);
    if (field('doi')) {
      assert.equal(r.doi, field('doi'), `${r.id}: doi`);
      assert.ok(r.texto.includes(r.doi), `${r.id}: doi no texto`);
    } else assert.equal(r.doi, undefined, r.id);
    if (r.pmid) assert.ok(entry.includes(`PMID: ${r.pmid}`), `${r.id}: pmid`);
    if (field('url')) assert.ok(r.texto.includes(field('url')), `${r.id}: url`);
    // Words with a LaTeX accent command are skipped: the test does not decode TeX.
    const title = field('title').replace(/[{}]/g, '');
    const words = title.split(/\s+/).filter((w) => /^[\p{L}']{5,}$/u.test(w)).slice(0, 4);
    for (const w of words) assert.ok(r.texto.includes(w), `${r.id}: palavra do título ${w}`);
  }
});

test('every reference with a DOI or PMID carries it in the text', () => {
  for (const r of REFERENCES) {
    assert.ok(r.texto.trim() !== '', r.id);
    if (r.doi) assert.ok(r.texto.includes(r.doi), r.id);
    if (r.pmid) assert.ok(r.texto.includes(r.pmid), r.id);
  }
});

// ---------------------------------------------------------------- assembly

test('assembleFicha builds a ficha that passes the new profile', () => {
  const ficha = assembleFicha(fullDraft());
  assert.deepEqual(validateFicha(ficha, 'new'), []);
  assert.equal(ficha.meta.titulo, 'Debate sobre o fim de vida');
  assert.deepEqual(ficha.meta.duracao, { min: 40, max: 50, texto: '40 a 50 minutos' });
  assert.equal(ficha.meta.formato, 'Pares ou grupos de três, seguidos de plenário');
  assert.equal(ficha.meta.areas, 'Bioética');
  assert.equal(ficha.meta.ferramenta, 'IAedu');
  assert.equal(ficha.regime_ia.papel, 'contraparte');
  assert.equal(ficha.meta_eunomia.autor, 'Ana Docente');
  assert.equal(ficha.meta_eunomia.modelo, MODEL);
  assert.equal(
    ficha.declaracao.texto,
    `Ficha preparada com apoio de IA generativa (IAedu, ${MODEL}) através da Eunomia (FMUP · IA) e revista por Ana Docente.`,
  );
});

test('the ficha meta Áreas shows the text of area_outra for outra, and the label for the new areas', () => {
  const build = (area, extra = {}) => {
    const respostas = respostasCompletas();
    respostas.contexto = { ...respostas.contexto, area, ...extra };
    let d = drafts.createDraft({ id: 'a1b2c3d4', name: 'Ana Docente' }, 'criar');
    for (const [step, value] of Object.entries(respostas)) {
      const r = drafts.applyAnswer(d, step, value);
      assert.deepEqual(r.errors, [], step);
      d = r.draft;
    }
    return d;
  };
  const outra = buildMeta(build('outra', { area_outra: 'Farmacologia' }));
  assert.equal(outra.areas, 'Farmacologia');
  assert.notEqual(outra.areas, 'Outra');
  assert.equal(buildMeta(build('cirurgia')).areas, 'Cirurgia e especialidades cirúrgicas');
  assert.equal(buildMeta(build('ciencias_basicas')).areas, 'Ciências básicas (anatomia, fisiologia, bioquímica, histologia)');
  const row = renderMd(assembleFicha(build('outra', { area_outra: 'Farmacologia' })));
  assert.match(row, /\| \*\*Áreas\*\* \| Farmacologia \|/);
});

test('the meta of an activity without AI names no tool, and its ficha has no prompt or plano B', () => {
  const respostas = respostasCompletas();
  respostas.papel_ia = { papel: 'nenhum' };
  respostas.regime = { regime: 'proibido' };
  respostas.padrao = { padrao: 'debate_posicoes', formato_grupo: 'Duas equipas de doze' };
  let d = drafts.createDraft({ id: 'a1b2c3d4', name: 'Ana' }, 'criar');
  for (const [step, value] of Object.entries(respostas)) d = drafts.applyAnswer(d, step, value).draft;
  d = drafts.approvePlan(d);
  const meta = buildMeta(d);
  assert.equal(meta.ferramenta, 'Nenhuma');
  assert.equal(meta.formato, 'Duas equipas de doze');
  const ficha = assembleFicha(d);
  assert.equal(ficha.prompt_base, undefined);
  assert.equal(ficha.plano_b, undefined);
  assert.equal(declaracaoTexto(d), 'Ficha preparada através da Eunomia (FMUP · IA), sem texto gerado por IA, e revista por Ana.');
});

// ---------------------------------------------------------------- formats

test('renderMd is the title, the subtitle and the qmd body without the front matter', () => {
  const ficha = assembleFicha(fullDraft());
  const qmd = renderQmd(ficha);
  const md = renderMd(ficha);
  assert.ok(!md.startsWith('---'));
  const head = `# ${ficha.meta.titulo}\n\n${ficha.meta.subtitulo}\n\n`;
  assert.ok(md.startsWith(head));
  assert.ok(qmd.endsWith(md.slice(head.length)));
  assert.doesNotMatch(md, /eunomia:/);
});

test('renderHtml is a standalone page with inline CSS, no script and escaped text', () => {
  const d = fullDraft();
  d.seccoes.papeis.dados = { estudante: 'Texto com <script>alert(1)</script> e [ligação](javascript:alert(1)).', docente: 'Ver <https://exemplo.pt>.' };
  const html = renderHtml(assembleFicha(d));
  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /<style>/);
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /href="javascript/i);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /<h1>Debate sobre o fim de vida<\/h1>/);
  assert.match(html, /<h2>Objectivo de aprendizagem<\/h2>/);
  assert.match(html, /<a href="https:\/\/exemplo\.pt">https:\/\/exemplo\.pt<\/a>/);
  assert.match(html, /<li><strong>20 min\.<\/strong> Grupos\.<\/li>/);
  assert.match(html, /<pre><code>Vais assumir/);
  assert.match(html, /<table>/);
});

test('markdownToHtml covers the constructs of the reference fichas', () => {
  for (let n = 1; n <= 6; n++) {
    const ficha = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'referencia', `ficha-${n}.json`), 'utf8'));
    const html = renderHtml(ficha);
    assert.doesNotMatch(html, /<script/i, `ficha ${n}`);
    assert.doesNotMatch(html, /(^|\n)(##|:::|\|---)/, `ficha ${n}: Markdown por converter`);
    assert.doesNotMatch(html, /\\@/, `ficha ${n}`);
  }
  assert.equal(markdownToHtml('a \\@ b *c* _d_ `e<f>`'), '<p>a @ b <em>c</em> <em>d</em> <code>e&lt;f&gt;</code></p>');
});

// ---------------------------------------------------------------- routes

async function appWith(t, draft) {
  const app = await startApp(t);
  const ana = await app.person('Ana Docente');
  draft.autor = { id: ana.id, nome: 'Ana Docente' };
  app.store.write(`rascunhos/${ana.id}/${draft.id}.json`, draft);
  return { app, ana };
}

test('exportar returns 409 with the sections still to accept', async (t) => {
  const d = fullDraft({ accept: false });
  d.seccoes.papeis.estado = 'aceite';
  const { app, ana } = await appWith(t, d);
  const r = await app.call('GET', `/rascunhos/${d.id}/exportar?formato=qmd`, { cookie: ana.cookie });
  assert.equal(r.status, 409);
  assert.match(r.json.erro, /Formato e duração em aula/);
  assert.doesNotMatch(r.json.erro, /Papéis/);
  assert.ok(r.json.seccoes.includes('formato'));
});

test('exportar qmd equals renderQmd of the assembled ficha, as an attachment', async (t) => {
  const d = fullDraft();
  const { app, ana } = await appWith(t, d);
  const r = await app.call('GET', `/rascunhos/${d.id}/exportar?formato=qmd`, { cookie: ana.cookie });
  assert.equal(r.status, 200);
  const stored = app.store.read(`rascunhos/${ana.id}/${d.id}.json`);
  // The Themis footer (summative only) has the minute of generation: compare without it.
  const sameMinute = (x) => x.replace(/Declaração gerada a .+? através/g, 'Declaração gerada a X através');
  assert.equal(sameMinute(r.text), sameMinute(renderQmd(assembleFicha(stored))));
  assert.equal(r.headers.get('content-disposition'), 'attachment; filename="debate-sobre-o-fim-de-vida.qmd"');
  assert.equal(r.headers.get('x-eunomia-avisos'), '0');
  assert.equal(readEunomiaFrontMatter(r.text).meta.titulo, 'Debate sobre o fim de vida');

  const md = await app.call('GET', `/rascunhos/${d.id}/exportar?formato=md`, { cookie: ana.cookie });
  assert.equal(md.headers.get('content-disposition'), 'attachment; filename="debate-sobre-o-fim-de-vida.md"');
  assert.ok(!md.text.startsWith('---'));

  const html = await app.call('GET', `/rascunhos/${d.id}/exportar?formato=html`, { cookie: ana.cookie });
  assert.equal(html.status, 200);
  assert.match(html.headers.get('content-type'), /^text\/html/);
  assert.match(html.headers.get('content-security-policy'), /default-src 'none'/);
  assert.doesNotMatch(html.text, /<script/i);

  assert.equal((await app.call('GET', `/rascunhos/${d.id}/exportar?formato=pdf`, { cookie: ana.cookie })).status, 400);
});

test('exportar works with teacher-edited sections and reports the schema problems as a count; verificacao-final lists them', async (t) => {
  const d = fullDraft();
  d.seccoes.formato = { dados: { blocos: [{ minutos: 90, texto: 'Tudo.' }] }, estado: 'aceite', avisos: [], modelo: null, origem: 'docente' };
  // A teacher reference with an id that is too long: the second schema problem. (An empty list of
  // references is valid since final fixes, item 20.)
  d.referencias = [{ id: 'x'.repeat(501), texto: 'Autor. Título. 2020.', origem: 'docente' }];
  const { app, ana } = await appWith(t, d);
  const r = await app.call('GET', `/rascunhos/${d.id}/exportar?formato=qmd`, { cookie: ana.cookie });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('x-eunomia-avisos'), '2');
  const v = await app.call('GET', `/rascunhos/${d.id}/verificacao-final`, { cookie: ana.cookie });
  assert.equal(v.status, 200);
  assert.equal(v.json.erros.length, 2);
  assert.ok(v.json.erros.some((e) => /fora da duração/.test(e)));
  assert.ok(v.json.erros.some((e) => /referencias/.test(e)));
  assert.deepEqual(v.json.seccoes_em_falta, []);
});

// ---------------------------------------------------------------- control characters (fix round 7-9, item 1)

test('a placeholder-like NUL sequence in a code span exports in under 1 s', () => {
  // Run in a child process: an endless loop would block this runner.
  const { spawnSync } = require('node:child_process');
  const script = `
    const drafts = require('./src/drafts.js');
    const { assembleFicha } = require('./src/assemble.js');
    const { renderHtml } = require('./src/export.js');
    const { respostasCompletas } = require('./test/helpers.js');
    let d = drafts.createDraft({ id: 'a1b2c3d4', name: 'Ana' }, 'criar');
    for (const [s, v] of Object.entries(respostasCompletas())) d = drafts.applyAnswer(d, s, v).draft;
    d = drafts.approvePlan(d);
    d.seccoes.papeis = { dados: { estudante: 'Texto com \`\\u00000\\u0000\` no meio.', docente: 'x' }, estado: 'aceite', avisos: [] };
    const ficha = assembleFicha(d);
    const t0 = Date.now();
    const html = renderHtml(ficha);
    const ms = Date.now() - t0;
    process.stdout.write((html.includes('\\u0000') ? 'nul ' : 'ok ') + ms);
  `;
  const r = spawnSync(process.execPath, ['-e', script], { cwd: path.join(__dirname, '..'), timeout: 5000, encoding: 'utf8' });
  assert.equal(r.signal, null, 'o processo foi terminado por tempo');
  const [state, ms] = r.stdout.split(' ');
  assert.equal(state, 'ok', r.stderr);
  assert.ok(Number(ms) < 1000, `${ms} ms`);
});

test('markdownToHtml drops C0 control characters except tab and newline', () => {
  assert.equal(markdownToHtml('a\u0000b\u0007c\td'), '<p>abc\td</p>');
});
