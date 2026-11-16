// Content tests of the help copy (ajuda-pt.js): the glossary matches the interview values, every
// link goes to a page of the site, the FAQ has the required questions. Run: npm test --prefix eunomia/test
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const REPO = path.join(ROOT, '..');
const INTERVIEW = JSON.parse(fs.readFileSync(path.join(ROOT, 'interview.json'), 'utf8'));

function load(file, name) {
  const w = {};
  new Function('window', fs.readFileSync(path.join(ROOT, file), 'utf8'))(w);
  return w[name];
}

const A = load('ajuda-pt.js', 'EUNOMIA_AJUDA');
const S = load('i18n-pt.js', 'EUNOMIA_PT');
const term = (id) => A.glossario.termos.find((t) => t.id === id);
const field = (stepId, campoId) => INTERVIEW.passos.find((p) => p.id === stepId).campos.find((c) => c.id === campoId);

test('the help has its sections, the four stages and the seven glossary terms', () => {
  for (const key of ['pagina', 'titulo']) assert.ok(typeof A[key] === 'string' && A[key] !== '', key);
  for (const key of ['oQueE', 'antes']) {
    assert.ok(A[key].titulo, key);
    assert.ok(Array.isArray(A[key].paragrafos) && A[key].paragrafos.length > 0, key);
  }
  assert.deepEqual(A.etapas.lista.map((e) => e.id), ['entrevista', 'plano', 'seccoes', 'exportar']);
  for (const e of A.etapas.lista) {
    for (const key of ['titulo', 'docente', 'modelo']) assert.ok(typeof e[key] === 'string' && e[key] !== '', `${e.id}.${key}`);
  }
  assert.deepEqual(A.glossario.termos.map((t) => t.id), [
    'regime',
    'papel',
    'padrao',
    'competencia_protegida',
    'clausula_themis',
    'estados_seccao',
    'chave',
  ]);
  for (const t of A.glossario.termos) assert.ok(t.termo && t.texto && t.ligacao && t.ligacao.rotulo, t.id);
});

test('"Antes de começar" names the access code, about 45 minutes and the data rules', () => {
  const text = A.antes.paragrafos.join(' ');
  assert.match(text, /código de acesso/);
  assert.match(text, /45 minutos/);
  assert.match(text, /dados de doentes/);
});

test('the regime and papel glossary entries have every value of interview.json, with the same labels', () => {
  const values = (campo) => campo.opcoes.map((o) => ({ id: o.id, rotulo: o.rotulo }));
  assert.deepEqual(term('regime').valores, values(field('regime', 'regime')));
  assert.deepEqual(term('papel').valores, values(field('papel_ia', 'papel')));
});

test('the estados_seccao entry has the four section states', () => {
  const v = term('estados_seccao').valores;
  assert.deepEqual(v.map((x) => x.id), ['vazia', 'gerada', 'aceite', 'a-actualizar']);
  assert.deepEqual(v.map((x) => x.rotulo), v.map((x) => S.seccao.estadoCurto[x.id]));
});

test('every glossary entry links to a page of the site that exists', () => {
  for (const t of A.glossario.termos) {
    const m = /^https:\/\/tiagojacinto\.eu\/fmup-ia\/([^#]*?)(?:\.html)?(?:#.*)?$/.exec(t.ligacao.url);
    assert.ok(m, `${t.id}: ligação fora do site: ${t.ligacao.url}`);
    const rel = m[1];
    const exists =
      fs.existsSync(path.join(REPO, `${rel}.qmd`)) ||
      fs.existsSync(path.join(REPO, rel, 'index.html')) ||
      fs.existsSync(path.join(REPO, rel, 'index.qmd'));
    assert.ok(exists, `${t.id}: a página ${rel} não existe no repositório`);
  }
});

test('the FAQ has the nine required questions; apagar says 30 dias; the contact is the work address', () => {
  const ids = A.perguntas.lista.map((q) => q.id);
  for (const id of ['rede', 'limite', 'modelo_ve', 'quem_ve', 'word_moodle', 'ajuste_parcial', 'aviso', 'apagar', 'submeter']) {
    assert.ok(ids.includes(id), id);
  }
  for (const q of A.perguntas.lista) assert.ok(q.pergunta && q.resposta, q.id);
  const answer = (id) => A.perguntas.lista.find((q) => q.id === id).resposta;
  assert.match(answer('apagar'), /30 dias/);
  // The FAQ uses the words of the interface.
  assert.ok(answer('ajuste_parcial').includes(S.passo.ajusteParcial.replace(/:$/, '')));
  assert.match(answer('quem_ve'), /Tiago/);
  assert.match(answer('quem_ve'), /Foi útil\?/);
  assert.deepEqual(
    { nome: A.contacto.nome, unidade: A.contacto.unidade, email: A.contacto.email },
    { nome: 'Tiago Jacinto', unidade: 'MEDCIDS', email: 'tiagojacinto@med.up.pt' },
  );
  assert.ok(A.contacto.titulo);
});

test('the help has no emoji and uses the Quadro spelling', () => {
  const src = fs.readFileSync(path.join(ROOT, 'ajuda-pt.js'), 'utf8');
  assert.doesNotMatch(src, /[☀-➿\u{1F000}-\u{1FAFF}️]/u);
  assert.doesNotMatch(src, /\batividade|\bobjetivo|\balunos?\b|\bpacientes?\b|\bdireto\b|\bcorreção/i);
});
