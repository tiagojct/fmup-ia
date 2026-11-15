'use strict';

// Ficha: schema validation (messages in Portuguese), section rules, .qmd rendering.
// The schema is eunomia/ficha.schema.json. The rules that need two fields are here.

const fs = require('node:fs');
const Ajv2020 = require('ajv/dist/2020');
const { repoPath } = require('./paths.js');

const SECTION_ORDER = [
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
];

const SECTION_HEADINGS = {
  objectivo: 'Objectivo de aprendizagem',
  formato: 'Formato e duração em aula',
  prompt_base: 'Prompt base',
  papeis: 'Papéis',
  correccao: 'Como se corrige ou discute',
  armadilhas: 'Armadilhas conhecidas',
  plano_b: 'Plano B sem ligação à internet',
  regime_ia: 'Regime de IA',
  referencias: 'Referência',
  declaracao: 'Declaração de uso de IA',
};

const CHECKED = [...SECTION_ORDER, 'extras'];
const PROFILES = ['new', 'reference'];

const schema = JSON.parse(fs.readFileSync(repoPath('eunomia', 'ficha.schema.json'), 'utf8'));
const validateSchema = new Ajv2020({ allErrors: true, strict: true, verbose: true }).compile(schema);

const isObject = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const isInt = Number.isInteger;
const text = (s) => (s === undefined || s === null ? '' : String(s).trim());
const blank = (s) => text(s) === '';

// ------------------------------------------------------------ schema messages

const TIPOS = {
  string: 'texto',
  integer: 'um número inteiro',
  number: 'um número',
  array: 'uma lista',
  object: 'um objecto',
  boolean: 'verdadeiro ou falso',
};

function label(instancePath) {
  return instancePath
    .split('/')
    .slice(1)
    .reduce((acc, seg) => {
      if (/^\d+$/.test(seg)) return `${acc}[${Number(seg) + 1}]`;
      return acc ? `${acc}.${seg}` : seg;
    }, '');
}

function schemaMessage(e) {
  const where = label(e.instancePath);
  const p = e.params;
  switch (e.keyword) {
    case 'required':
      return where === ''
        ? `Falta a secção ${p.missingProperty}.`
        : `Falta o campo ${p.missingProperty} em ${where}.`;
    case 'additionalProperties':
      return `Campo não previsto: ${where ? `${where}.` : ''}${p.additionalProperty}.`;
    case 'dependentRequired':
      return `Em ${where}, ${p.property} exige também ${p.missingProperty}.`;
    case 'type':
      return `O campo ${where} tem de ser ${TIPOS[p.type] || p.type}.`;
    case 'minLength':
      return `O campo ${where} não pode estar vazio.`;
    case 'minimum':
      return `O campo ${where} tem de ser ${p.limit} ou mais.`;
    case 'enum':
      return `O campo ${where} tem de ser um de: ${p.allowedValues.join(', ')}.`;
    case 'minItems':
    case 'maxItems': {
      const { minItems: min = 0, maxItems: max } = e.parentSchema;
      if (min === 1 && max === undefined) return `A lista ${where} não pode estar vazia.`;
      if (max === undefined) return `A lista ${where} tem ${e.data.length} itens, e o mínimo é ${min}.`;
      return `A lista ${where} tem ${e.data.length} itens, fora do intervalo exigido (${min} a ${max}).`;
    }
    default:
      return `${where || 'A ficha'}: ${e.message}.`;
  }
}

// skip(e) drops the errors for sections that validateSection does not check.
function schemaErrors(doc, skip = () => false) {
  if (validateSchema(doc)) return [];
  return validateSchema.errors.filter((e) => e.keyword !== 'if' && !skip(e)).map(schemaMessage);
}

// ------------------------------------------------------------ section rules

const range = (lo, hi, unit = '') => `${lo === hi ? lo : `${lo} a ${hi}`}${unit}`;

function metaRules(meta) {
  const d = isObject(meta) && isObject(meta.duracao) ? meta.duracao : {};
  return isInt(d.min) && isInt(d.max) && d.min > d.max
    ? [`A duração mínima (${d.min}) é superior à máxima (${d.max}).`]
    : [];
}

function formatoRules(formato, meta) {
  if (!isObject(formato)) return [];
  const errors = [];
  const blocos = Array.isArray(formato.blocos) ? formato.blocos.filter(isObject) : [];
  if (formato.blocos === undefined && formato.texto === undefined) {
    errors.push('A secção formato precisa de blocos com minutos ou de um texto.');
  }
  blocos.forEach((b, i) => {
    if (isInt(b.minutos) && isInt(b.minutos_max) && b.minutos_max <= b.minutos) {
      errors.push(`O bloco ${i + 1} tem minutos_max (${b.minutos_max}) que não é superior a minutos (${b.minutos}).`);
    }
  });
  const d = isObject(meta) && isObject(meta.duracao) ? meta.duracao : {};
  if (blocos.length && blocos.every((b) => isInt(b.minutos)) && isInt(d.min) && isInt(d.max) && d.min <= d.max) {
    const lo = blocos.reduce((s, b) => s + b.minutos, 0);
    const hi = blocos.reduce((s, b) => s + Math.max(b.minutos, isInt(b.minutos_max) ? b.minutos_max : 0), 0);
    if (lo < d.min || hi > d.max) {
      errors.push(`Os blocos somam ${range(lo, hi)} min, fora da duração indicada (${range(d.min, d.max)} min).`);
    }
  }
  return errors;
}

function extrasRules(extras) {
  if (!Array.isArray(extras)) return [];
  const errors = [];
  extras.forEach((x, i) => {
    const pos = isObject(x) && isObject(x.position) ? x.position : null;
    if (!pos) return;
    const where = `extras[${i + 1}].position`;
    const hasBefore = pos.before !== undefined;
    const hasAfter = pos.after !== undefined;
    if (hasBefore === hasAfter) {
      errors.push(`O campo ${where} tem de ter before ou after, e só um.`);
    } else if (hasBefore && pos.before !== 'objectivo') {
      errors.push(`O campo ${where}.before só admite objectivo.`);
    } else if (hasAfter && !SECTION_ORDER.includes(pos.after)) {
      errors.push(`O campo ${where}.after tem de ser um de: ${SECTION_ORDER.join(', ')}.`);
    }
  });
  return errors;
}

function planoBRules(pb) {
  return isObject(pb) && blank(pb.texto) && blank(pb.sem_plano_b_motivo)
    ? ['O plano B precisa de um texto ou de sem_plano_b_motivo.']
    : [];
}

function sectionRules(id, data, ficha) {
  switch (id) {
    case 'meta':
      return metaRules(data);
    case 'formato':
      return formatoRules(data, ficha && ficha.meta);
    case 'extras':
      return extrasRules(data);
    case 'plano_b':
      return planoBRules(data);
    default:
      return [];
  }
}

// The plano B is required when the activity needs the internet: it has a prompt or AI has a role.
function needsPlanoB(f) {
  return f.prompt_base !== undefined || (isObject(f.regime_ia) && !['nenhum', undefined].includes(f.regime_ia.papel));
}

function checkProfile(profile) {
  if (!PROFILES.includes(profile)) throw new TypeError(`Perfil desconhecido: ${profile}.`);
}

// ------------------------------------------------------------ validation

function validateFicha(ficha, profile) {
  checkProfile(profile);
  if (!isObject(ficha)) return ['A ficha tem de ser um objecto JSON.'];
  const errors = schemaErrors({ ...ficha, $profile: profile });
  for (const id of CHECKED) {
    if (ficha[id] !== undefined) errors.push(...sectionRules(id, ficha[id], ficha));
  }
  if (needsPlanoB(ficha) && ficha.plano_b === undefined) errors.push('Falta a secção plano_b.');
  return [...new Set(errors)];
}

// ficha (optional) gives the meta for the duration rule of the formato section.
function validateSection(sectionId, data, profile, ficha) {
  if (!CHECKED.includes(sectionId)) return [`Secção desconhecida: ${sectionId}.`];
  checkProfile(profile);
  if (data === undefined) return [`Falta a secção ${sectionId}.`];
  const errors = schemaErrors(
    { $profile: profile, [sectionId]: data },
    (e) => e.instancePath === '' && e.keyword === 'required',
  );
  errors.push(...sectionRules(sectionId, data, ficha));
  return [...new Set(errors)];
}

// ------------------------------------------------------------ rendering

const PAPEL_TEXTO = {
  nenhum: 'Esta actividade não usa IA.',
  contraparte: 'Papel da IA nesta actividade: contraparte. A IA assume um papel na actividade.',
  ferramenta: 'Papel da IA nesta actividade: ferramenta. Os estudantes usam a IA para produzir.',
  objecto_de_critica: 'Papel da IA nesta actividade: objecto de crítica. Os estudantes avaliam o que a IA produz.',
};

const REGIME_TEXTO = {
  permitido: 'verde: permitido',
  condicionado: 'amarelo: permitido com condições',
  proibido: 'vermelho: proibido',
};

const joinBlocks = (...blocks) => blocks.filter((b) => b !== '').join('\n\n');
const bullets = (items) => items.map((i) => `- ${text(i)}`).join('\n');
const cell = (s) => text(s).replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');

function bloco(b) {
  const minutos = isInt(b.minutos_max) ? `${b.minutos} a ${b.minutos_max}` : `${b.minutos}`;
  return `- **${minutos} min.** ${text(b.texto)}`;
}

function planoB(d) {
  const motivo = text(d.sem_plano_b_motivo);
  return joinBlocks(motivo ? `Não há plano B: ${/[.!?]$/.test(motivo) ? motivo : `${motivo}.`}` : '', text(d.texto));
}

function regimeIa(d) {
  const themis = d.themis
    ? joinBlocks(
        `Cláusula para o enunciado: ${text(d.themis.clausula)}`,
        (d.themis.avisos || []).length ? joinBlocks('Avisos da política:', bullets(d.themis.avisos)) : '',
      )
    : '';
  return joinBlocks(
    PAPEL_TEXTO[d.papel] || '',
    `Regime para os estudantes durante a actividade, ${REGIME_TEXTO[d.regime] || d.regime}.`,
    d.condicoes ? `Condições: ${text(d.condicoes)}` : '',
    themis,
  );
}

const RENDER = {
  meta: (d) =>
    [
      '::: {.ficha-meta}',
      '| | |',
      '|---|---|',
      `| **Competência** | ${cell(d.competencia)} |`,
      `| **Formato** | ${cell(d.formato)} |`,
      `| **Duração** | ${cell(d.duracao && d.duracao.texto)} |`,
      `| **Ano sugerido** | ${cell(d.ano)} |`,
      `| **Áreas** | ${cell(d.areas)} |`,
      `| **Ferramenta** | ${cell(d.ferramenta)} |`,
      ':::',
    ].join('\n'),
  objectivo: (d) => joinBlocks(text(d.texto), text(d.competencia_protegida)),
  formato: (d) => joinBlocks(text(d.introducao), (d.blocos || []).map(bloco).join('\n'), text(d.texto)),
  prompt_base: (d) =>
    joinBlocks(text(d.texto), d.variantes ? `### Variantes por área\n\n${text(d.variantes)}` : ''),
  papeis: (d) =>
    `### Papel do estudante\n\n${text(d.estudante)}\n\n### Papel do docente\n\n${text(d.docente)}`,
  correccao: (d) => text(d.texto),
  armadilhas: (list) => list.map((a) => `- **${text(a.lead)}** ${text(a.texto)}`).join('\n'),
  plano_b: planoB,
  regime_ia: regimeIa,
  referencias: (list) => list.map((r) => text(r.texto)).join('\n\n'),
  declaracao: (d) => text(d.texto),
};

// A bare @ is a citation key for Quarto. Escape it outside code fences and inline code.
function escapeAt(md) {
  let fence = null;
  const plain = (s) => s.replace(/(?<!\\)@/g, '\\@');
  return md
    .split('\n')
    .map((line) => {
      const m = line.match(/^\s*(`{3,}|~{3,})/);
      if (fence) {
        if (m && m[1][0] === fence[0] && m[1].length >= fence.length && /^\s*[`~]+\s*$/.test(line)) fence = null;
        return line;
      }
      if (m) {
        fence = m[1];
        return line;
      }
      let out = '';
      let last = 0;
      for (const span of line.matchAll(/(`+)(.+?)(?<!`)\1(?!`)/g)) {
        out += plain(line.slice(last, span.index)) + span[0];
        last = span.index + span[0].length;
      }
      return out + plain(line.slice(last));
    })
    .join('\n');
}

function renderSection(sectionId, data) {
  if (!RENDER[sectionId]) throw new Error(`Secção desconhecida: ${sectionId}.`);
  return escapeAt(RENDER[sectionId](data));
}

// Quoted string for title and subtitle: no raw @ (check-content.py), no line separators.
const frontJson = (value) =>
  JSON.stringify(value).replace(/[@\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);

const extraSlot = (pos) => (pos && pos.before === 'objectivo' ? 'meta' : pos && pos.after);

function renderQmd(ficha) {
  const front = [
    '---',
    `title: ${frontJson(ficha.meta.titulo)}`,
    `subtitle: ${frontJson(ficha.meta.subtitulo)}`,
    'toc: true',
    'toc-depth: 2',
    `eunomia: "${Buffer.from(JSON.stringify(ficha), 'utf8').toString('base64')}"`,
    '---',
  ].join('\n');
  const extrasAt = (id) =>
    (ficha.extras || [])
      .filter((x) => extraSlot(x.position) === id)
      .map((x) => escapeAt(`## ${text(x.titulo)}\n\n${text(x.texto)}`));
  const blocks = [];
  for (const id of SECTION_ORDER) {
    if (ficha[id] !== undefined) {
      const body = renderSection(id, ficha[id]);
      blocks.push(id === 'meta' ? body : `## ${SECTION_HEADINGS[id]}\n\n${body}`);
    }
    blocks.push(...extrasAt(id));
  }
  return `${front}\n\n${blocks.join('\n\n')}\n`;
}

// The ficha travels in the front matter as base64 of its UTF-8 JSON, so that Pandoc
// does not parse the ficha text as Markdown (a callout at the end of a string breaks it).
function readEunomiaFrontMatter(qmdText) {
  const front = String(qmdText).match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  const line = front && front[1].split('\n').find((l) => l.startsWith('eunomia:'));
  const value = line && line.slice('eunomia:'.length).trim().replace(/^"(.*)"$/, '$1');
  if (!value) throw new Error('O ficheiro não tem a chave eunomia no cabeçalho.');
  return JSON.parse(Buffer.from(value, 'base64').toString('utf8'));
}

function slugify(title) {
  return String(title)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

module.exports = {
  SECTION_ORDER,
  SECTION_HEADINGS,
  validateFicha,
  validateSection,
  renderQmd,
  renderSection,
  readEunomiaFrontMatter,
  slugify,
};
