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

// ---------------------------------------------------------------- 0.3: plain labels, tips, help for colleagues

const STEP = (id) => INTERVIEW.passos.find((p) => p.id === id);

test('the step titles and the protected-skill label say what is asked, with the Quadro term in parentheses (spec 4)', () => {
  assert.equal(STEP('papel_ia').titulo, 'O que a IA faz nesta actividade (papel da IA)');
  assert.equal(STEP('regime').titulo, 'O que os estudantes podem fazer com IA (regime de IA)');
  assert.equal(STEP('regime_themis').titulo, 'A regra de IA no enunciado da avaliação (cláusula)');
  assert.equal(STEP('padrao').titulo, 'A forma da actividade (padrão)');
  assert.equal(field('objectivo', 'competencia_protegida').rotulo, 'O que o estudante tem de fazer sem ajuda (competência protegida)');
  // The papel and regime options keep their labels; a help line in common words explains each field.
  for (const [s, c] of [['papel_ia', 'papel'], ['regime', 'regime']]) {
    const h = field(s, c).ajuda;
    assert.ok(typeof h === 'string' && h !== '', `${s}.${c}: ajuda`);
    assert.equal(h.split(/[.!?](\s|$)/).filter((x) => x && x.trim()).length, 1, `${s}.${c}: one sentence`);
  }
});

test('the tips are advice: "Dicas", 2 to 4 per step, no compreender, none starts with Não or an infinitive (spec 7)', () => {
  assert.equal(S.passo.errosComuns, 'Dicas');
  for (const step of INTERVIEW.passos) {
    assert.ok(step.erros_comuns.length >= 2 && step.erros_comuns.length <= 4, step.id);
    for (const item of step.erros_comuns) {
      assert.doesNotMatch(item, /compreender/i, `${step.id}: ${item}`);
      assert.doesNotMatch(item, /^Não /, `${step.id}: ${item}`);
      assert.doesNotMatch(item, /^Usar compreender/, `${step.id}: ${item}`);
      // The old items started with an infinitive (Pôr, Contar, Escolher...): the error, not the advice.
      const first = item.split(/[\s,:]/)[0];
      assert.doesNotMatch(first, /^\p{L}+(ar|er|ir|ôr)$/u, `${step.id}: ${item}`);
    }
  }
});

test('the objective help keeps one example and no verb rule; the verb rule is one friendly sentence (spec 7)', () => {
  const h = field('objectivo', 'texto').ajuda;
  assert.doesNotMatch(h, /compreender|saber|conhecer/i);
  assert.equal((h.match(/por exemplo/gi) || []).length, 1, h);
  assert.equal(S.passo.verboFalta, 'Sem um verbo que se observe.');
  assert.doesNotMatch(S.passo.verboOk('identificar'), /observável/);
});

test('the help says the status of the tool, that no AI is a valid result, the Themis route and what IAedu is (spec 2, 4, 9)', () => {
  const oQueE = A.oQueE.paragrafos.join(' ');
  assert.ok(oQueE.includes(S.app.estado), 'status sentence');
  assert.match(oQueE, /sem IA[^.]*resultado válido|resultado válido[^.]*sem IA/i);
  const antes = A.antes.paragrafos.join(' ');
  assert.ok(antes.includes('o serviço de IA da FCT/FCCN para o ensino superior; não precisa de conta: a Eunomia usa a chave da FMUP'), 'IAedu explained');
  // The Themis line: first mention explained, with the link.
  assert.match(A.antes.themis.texto, /Themis, a outra ferramenta do FMUP · IA, que escreve a regra de IA para o enunciado de um trabalho/);
  assert.match(A.antes.themis.texto, /5 minutos/);
  assert.equal(A.antes.themis.url, '../themis/');
  assert.ok(A.antes.themis.link);
  // The interview stage mentions the adapt start and the tips.
  const entrevista = A.etapas.lista.find((e) => e.id === 'entrevista').docente;
  assert.ok(entrevista.includes(S.inicio.adaptar), 'adapt start');
  assert.doesNotMatch(entrevista, /erros comuns/i);
  assert.match(entrevista, /dicas/i);
});

test('the help has one entry on what Tiago sees, with the exact text, and no claim that he can open a draft before it is submitted (spec 8)', () => {
  const q = (id) => A.perguntas.lista.find((x) => x.id === id);
  assert.equal(q('quem_ve').pergunta, 'O que vê o Tiago Jacinto?');
  assert.ok(q('quem_ve').resposta.includes(S.app.oQueVe), 'what-Tiago-sees text, verbatim');
  // One entry only: no second question about who sees the drafts.
  const about = A.perguntas.lista.filter((x) => /quem vê|o que vê o Tiago/i.test(x.pergunta));
  assert.deepEqual(about.map((x) => x.id), ['quem_ve']);
  // Nothing in the help or the interface says that Tiago (or the person in charge) opens or reads a
  // draft for support: the server shows him a draft only after it is submitted.
  const all = [];
  const walk = (v) => {
    if (typeof v === 'string') all.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(A);
  walk(S);
  for (const s of all) {
    assert.doesNotMatch(s, /dar apoio/i, s);
    assert.doesNotMatch(s, /pode(m)? (abrir|ler|ver|consultar) (um|o|os|qualquer|o seu|os seus) rascunhos?/i, s);
  }
});

test('the help has the FAQ entry on starting from an activity the teacher already runs (spec 6)', () => {
  const q = A.perguntas.lista.find((x) => x.id === 'adaptar');
  assert.ok(q, 'adaptar');
  assert.equal(q.pergunta, 'Posso partir de uma actividade que já faço?');
  assert.ok(q.resposta.includes(S.inicio.adaptar), 'the button name');
  assert.match(q.resposta, /propõe/);
  assert.match(q.resposta, /cada passo/);
  assert.match(q.resposta, /IAedu/);
  assert.match(q.resposta, /materiais/);
  assert.match(q.resposta, /20 000 caracteres/);
});

test('the glossary adds the common-words title next to the Quadro term (spec 4)', () => {
  const where = {
    papel: STEP('papel_ia').titulo,
    regime: STEP('regime').titulo,
    padrao: STEP('padrao').titulo,
    competencia_protegida: field('objectivo', 'competencia_protegida').rotulo,
    clausula_themis: STEP('regime_themis').titulo,
  };
  for (const [id, title] of Object.entries(where)) {
    const t = term(id);
    assert.ok(t.comum, `${id}: comum`);
    assert.ok(title.startsWith(t.comum + ' ('), `${id}: ${t.comum} / ${title}`);
  }
  assert.equal(A.glossario.rotuloComum('X'), 'Na entrevista: «X».');
});

test('the login notice and the adapt page explain IAedu at its first mention (spec 4)', () => {
  for (const [name, s] of [['S.entrar.avisoIaedu', S.entrar.avisoIaedu], ['S.adaptar.aviso', S.adaptar.aviso]]) {
    assert.match(s, /para o ensino superior/, name);
    assert.match(s, /não precisa de conta/i, name);
    assert.match(s, /a Eunomia usa a chave da FMUP/, name);
  }
});

// ---------------------------------------------------------------- final review (final-fixes.md)

const IAEDU = 'IAedu, o serviço de IA da FCT/FCCN para o ensino superior';
const EXEMPLOS = JSON.parse(fs.readFileSync(path.join(ROOT, 'exemplos.json'), 'utf8'));

test('final review M2: IAedu is explained at its first mention on the home page, the settings page and the papel_ia tool help', () => {
  // Home: the model line comes before the link "Definições do modelo (chave IAedu)".
  assert.ok(S.inicio.modoPartilhado.includes(IAEDU), S.inicio.modoPartilhado);
  assert.ok(S.inicio.modoProprio.includes(IAEDU), S.inicio.modoProprio);
  // Settings: the intro comes before the mode line and the fields.
  assert.ok(S.definicoes.intro.includes(IAEDU), S.definicoes.intro);
  assert.ok(S.definicoes.intro.indexOf(IAEDU) <= S.definicoes.intro.indexOf('IAedu'), 'the first IAedu of the intro is the explained one');
  assert.equal(field('papel_ia', 'ferramenta').ajuda, 'Por omissão, a IAedu, o serviço de IA da FCT/FCCN para o ensino superior. Indique outra só se a Universidade do Porto a tiver aprovado.');
});

test('final review M6: one term on the objective step: "verbo que se observa", never "observável"', () => {
  assert.doesNotMatch(S.passo.sugerirAjuda, /observáve/);
  assert.match(S.passo.sugerirAjuda, /verbo que se observa/);
  const step = INTERVIEW.passos.find((p) => p.id === 'objectivo');
  assert.doesNotMatch(step.porque, /observáve/);
  for (const e of EXEMPLOS.exemplos) {
    const p = (e.porque || {}).objectivo || '';
    assert.doesNotMatch(p, /(verbos?|acç(ão|ões)) observáve/, `exemplo ${e.n}`);
  }
});

test('final review M7: the polished copy of the objectivo and papel_ia tips, the stage text and the IAedu notices', () => {
  const tips = (id) => INTERVIEW.passos.find((p) => p.id === id).erros_comuns;
  assert.equal(tips('objectivo')[0], 'Escreva o objectivo do ponto de vista do estudante: o que ele faz no fim da actividade.');
  assert.ok(tips('objectivo')[1].startsWith('Em «O que o estudante tem de fazer sem ajuda», ponha só a parte que ele faz sozinho.'));
  assert.ok(tips('objectivo')[2].startsWith('Defina um só objectivo por actividade.'));
  assert.ok(tips('papel_ia').some((t) => t.startsWith('No campo Ferramenta, ')));
  assert.ok(!tips('papel_ia').some((t) => t.startsWith('Na ferramenta')));
  // Shorter sentences: the regime_themis porque and the interview stage of the help.
  const longest = (s) => Math.max(...s.split(/[.!?](?:\s|$)/).map((x) => x.trim().split(/\s+/).length));
  assert.ok(longest(INTERVIEW.passos.find((p) => p.id === 'regime_themis').porque) <= 25);
  assert.ok(longest(A.etapas.lista.find((e) => e.id === 'entrevista').docente) <= 30);
  // The IAedu notices: no semicolon before "não precisa de conta".
  for (const s of [S.entrar.avisoIaedu, S.adaptar.aviso]) {
    assert.ok(s.includes(`${IAEDU}. Não precisa de conta: a Eunomia usa a chave da FMUP.`), s);
    assert.doesNotMatch(s, /superior; não precisa/);
  }
});
