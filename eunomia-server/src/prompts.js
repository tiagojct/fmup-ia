'use strict';

// The model tasks (design, 6.4). Each prompt is short, in Portuguese, asks for JSON only, shows the
// JSON shape and carries the spelling and terminology rules. IAedu ignores instructions sent in
// user_context, so everything goes in the message. Each request carries all it needs: no step
// relies on the thread history.

const { planSummary } = require('./drafts.js');
const { findPattern } = require('./patterns.js');

const RULES = [
  'Regras de escrita:',
  '- Português europeu, com a ortografia do Quadro FMUP · IA, anterior ao Acordo de 1990: actividade, objectivo, correcção, directamente, acção, exacto.',
  '- Diga estudantes, nunca alunos; doentes, nunca pacientes. Não use "você" nem "tela".',
  '- Sem emojis. Negrito só onde o formato o pede.',
  '- Não cite autores, estudos, DOI nem PMID, e não invente números nem estatísticas. As referências são escolhidas pelo docente.',
  '- Todos os casos e dados são fictícios.',
  '- Responda só com JSON, sem texto antes ou depois.',
].join('\n');

const MAX_MATERIALS = 20000;

// What the model writes for each section: the JSON shape and the instructions.
const SECTIONS = {
  objectivo: {
    nome: 'Objectivo de aprendizagem',
    forma: '{"texto": "No fim da actividade, o estudante ...", "competencia_protegida": "A competência protegida é ..."}',
    instrucoes: [
      'texto: o objectivo do docente, na forma "No fim da actividade, o estudante" seguida de um verbo observável. Mantenha o verbo e o conteúdo do docente; corrija só a forma.',
      'competencia_protegida: duas ou três frases que começam por "A competência protegida é" e dizem o que o estudante tem de fazer sem ajuda.',
    ],
  },
  formato: {
    nome: 'Formato e duração em aula',
    forma: '{"introducao": "...", "blocos": [{"minutos": 5, "texto": "..."}], "texto": "..."}',
    instrucoes: [
      'blocos: as fases da actividade, por ordem, com minutos inteiros. Cada texto diz o que acontece nessa fase e quem faz o quê.',
      'introducao e texto são opcionais: uma frase antes ou depois dos blocos, só se for precisa. Omita a chave quando não a usar.',
    ],
  },
  prompt_base: {
    nome: 'Prompt base',
    forma: '{"texto": "...", "variantes": "..."}',
    instrucoes: [
      'texto: uma frase para o docente sobre como usar o prompt, depois o prompt que o docente cola numa conversa nova da IAedu, dentro de um bloco ```text. O prompt fala com o modelo na segunda pessoa, tem regras numeradas e o guião de que a actividade precisa.',
      'variantes: opcional, adaptações do mesmo mecanismo a outras áreas. Omita a chave quando não a usar.',
    ],
  },
  papeis: {
    nome: 'Papéis',
    forma: '{"estudante": "...", "docente": "..."}',
    instrucoes: ['estudante e docente: o que cada um faz antes, durante e depois da actividade, em frases curtas.'],
  },
  correccao: {
    nome: 'Como se corrige ou discute',
    forma: '{"texto": "..."}',
    instrucoes: [
      'texto: como o docente corrige ou conduz a discussão final, ligada à evidência do plano. Pode usar uma lista numerada com uma pergunta em negrito no início de cada item: 1. **Pergunta?** texto.',
    ],
  },
  armadilhas: {
    nome: 'Armadilhas conhecidas',
    forma: '[{"lead": "Frase curta.", "texto": "..."}]',
    instrucoes: [
      'Uma lista com entre 3 e 6 armadilhas. lead é uma frase curta terminada em ponto; texto diz o que acontece e como o docente o previne ou trata.',
    ],
  },
  plano_b: {
    nome: 'Plano B sem ligação à internet',
    forma: '{"texto": "..."}',
    instrucoes: [
      'texto: como fazer a actividade sem internet, com material gerado e verificado antes da aula, e o que se perde. Se não houver plano B possível, devolva {"sem_plano_b_motivo": "..."}.',
    ],
  },
};

function block(title, text) {
  return `${title}:\n${String(text).trim()}`;
}

function materialsBlock(materiais) {
  const text = typeof materiais === 'string' ? materiais.trim() : '';
  if (text === '') return '';
  const cut = text.length > MAX_MATERIALS ? `${text.slice(0, MAX_MATERIALS)}\n[...]` : text;
  return block('Materiais do docente (use o vocabulário e os casos; não copie dados pessoais)', cut);
}

// The approved plan as text: one line per decision, and the known pitfalls of the pattern.
function planText(draft) {
  const lines = planSummary(draft).map((l) => `${l.rotulo}: ${l.valor}`);
  const p = draft.respostas && draft.respostas.padrao ? findPattern(draft.respostas.padrao.padrao) : null;
  if (p && p.armadilhas.length) lines.push(`Armadilhas conhecidas do padrão: ${p.armadilhas.join(' ')}`);
  return lines.join('\n');
}

function durationRule(draft) {
  const c = (draft && draft.respostas && draft.respostas.contexto) || {};
  if (!Number.isInteger(c.duracao_min)) return '';
  const max = Number.isInteger(c.duracao_max) ? c.duracao_max : c.duracao_min;
  return max === c.duracao_min
    ? `A soma dos minutos dos blocos é ${max} minutos.`
    : `A soma dos minutos dos blocos fica entre ${c.duracao_min} e ${max} minutos.`;
}

function join(...parts) {
  return parts.filter((p) => p && String(p).trim() !== '').join('\n\n');
}

// ---------------------------------------------------------------- the tasks

function sharpenOutcome(respostas) {
  const r = respostas || {};
  const o = r.objectivo || {};
  const c = r.contexto || {};
  return join(
    'Tarefa: propor até duas versões mais precisas de um objectivo de aprendizagem escrito por um docente da FMUP.',
    block('Objectivo do docente', o.texto || ''),
    c.uc ? `Unidade curricular: ${c.uc}${c.programa ? ` (${c.programa})` : ''}.` : '',
    'Cada versão começa por um verbo observável no infinitivo (por exemplo conduzir, identificar, justificar, comparar) e diz o que o estudante faz no fim da actividade. Mantenha o conteúdo e o nível do docente. Não acrescente temas.',
    'Forma da resposta: {"sugestoes": ["...", "..."]}',
    RULES,
  );
}

function explainPatterns(respostas, patterns) {
  const r = respostas || {};
  const list = (patterns || []).map((p) => `- ${p.id}: ${p.nome}. ${p.mecanismo}`).join('\n');
  return join(
    'Tarefa: explicar a um docente porque cada padrão de actividade abaixo serve o seu objectivo. A escolha é do docente.',
    block('Objectivo', (r.objectivo && r.objectivo.texto) || ''),
    block('Evidência', (r.evidencia && r.evidencia.descricao) || ''),
    block('Padrões', list),
    'Para cada padrão, escreva duas frases: porque serve este objectivo e o que o docente tem de vigiar. Use os ids dados.',
    'Forma da resposta: {"explicacoes": [{"id": "...", "texto": "..."}]}',
    RULES,
  );
}

// sectionId: one of the model sections. plano: planText(draft). anterior: the current data of the
// section, for a new version with a comment. draft (optional) gives the duration rule of formato.
function writeSection(sectionId, plano, materiais, comentario, anterior, draft) {
  const s = SECTIONS[sectionId];
  if (!s) throw new Error(`A secção ${sectionId} é escrita pelo código, não pelo modelo.`);
  const rules = sectionId === 'formato' ? durationRule(draft) || durationFromPlan(plano) : '';
  return join(
    `Tarefa: escrever a secção "${s.nome}" de uma ficha de actividade da FMUP, a partir do plano aprovado pelo docente. Escreva só esta secção.`,
    block('Plano aprovado', plano),
    materialsBlock(materiais),
    anterior !== undefined ? block('Versão anterior desta secção', JSON.stringify(anterior)) : '',
    comentario ? block('Comentário do docente para esta versão', comentario) : '',
    [...s.instrucoes, rules].filter(Boolean).join('\n'),
    `Forma da resposta: ${s.forma}`,
    RULES,
  );
}

// The duration rule read back from the plan text, when no draft is given.
function durationFromPlan(plano) {
  const m = /Duração: (\d+)(?: a (\d+))? minutos/.exec(String(plano));
  if (!m) return '';
  return m[2]
    ? `A soma dos minutos dos blocos fica entre ${m[1]} e ${m[2]} minutos.`
    : `A soma dos minutos dos blocos é ${m[1]} minutos.`;
}

// Refine mode: an existing activity mapped to the ficha. The model never writes regime_ia,
// referencias or declaracao.
function mapExisting(texto) {
  return join(
    'Tarefa: ler uma actividade de ensino que um docente já usa e passá-la para as secções de uma ficha. Copie o que existe; deixe de fora as partes que não existem. Não invente nada.',
    block('Actividade', texto),
    'Secções possíveis (todas opcionais): meta {titulo, subtitulo, competencia, formato, duracao: {texto, min, max}, ano, areas, ferramenta}, objectivo {texto, competencia_protegida}, formato {introducao, blocos: [{minutos, texto}], texto}, prompt_base {texto}, papeis {estudante, docente}, correccao {texto}, armadilhas [{lead, texto}], plano_b {texto}.',
    'Forma da resposta: {"objectivo": {"texto": "..."}, "formato": {"blocos": [{"minutos": 10, "texto": "..."}]}}',
    RULES,
  );
}

function reviewAlignment(ficha) {
  const f = { ...(ficha || {}) };
  for (const k of ['regime_ia', 'referencias', 'declaracao', 'meta_eunomia', 'derived_from', 'runtime']) delete f[k];
  return join(
    'Tarefa: comentar o alinhamento entre o objectivo, a tarefa e a evidência desta ficha, em no máximo cinco pontos. Cada ponto diz o problema e a secção onde está. Não reescreva a ficha.',
    block('Ficha', JSON.stringify(f)),
    'Secções válidas: objectivo, formato, prompt_base, papeis, correccao, armadilhas, plano_b.',
    'Forma da resposta: {"pontos": [{"seccao": "formato", "texto": "..."}]}',
    RULES,
  );
}

module.exports = { RULES, SECTIONS, planText, sharpenOutcome, explainPatterns, writeSection, mapExisting, reviewAlignment };
