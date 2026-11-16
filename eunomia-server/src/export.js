'use strict';

// Downloads of a ficha: .md (the title, the subtitle and the .qmd body without the front matter) and a printable HTML page with
// inline CSS and no scripts. The HTML comes from a small Markdown converter that covers what the
// fichas use: headings, paragraphs, lists, tables, code blocks, fenced divs (::: {.class}), bold,
// italic, code, links and autolinks. All text is escaped first; links accept http(s), mailto,
// anchors and relative paths only.
//
// The converter has two steps: parseBlocks reads the Markdown into blocks, and markdownToHtml writes
// them as HTML. The Word export (docx.js) reads the same blocks and the same inline conversion, so
// that the two downloads cannot disagree on what a line of Markdown is. htmlPage wraps an HTML body
// in the printable page, for the ficha and for the student handout (folheto.js).

const { renderQmd } = require('./ficha.js');
const { CONTROL, stripControl } = require('./control.js');

// The .qmd body without the front matter.
const body = (ficha) => renderQmd(ficha).replace(/^---\n[\s\S]*?\n---\n\n?/, '');

// The .md file opens with the title and the subtitle, which the .qmd keeps in its front matter.
function renderMd(ficha) {
  return `# ${ficha.meta.titulo}\n\n${ficha.meta.subtitulo}\n\n${body(ficha)}`;
}

const escapeHtml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// U+0000 is the placeholder marker of inline() below: markdownToHtml strips the C0 control
// characters (control.js) first.
const SAFE_URL = /^(?:https?:\/\/|mailto:|#|\/|\.{1,2}\/|[^:/?#]+(?:[/?#]|$))/i;

// Bold, italic and backslash escapes, on text that is already escaped. Every repeated group here and
// in inline() has an upper bound (500 characters for emphasis and link labels, 1000 for code, 2000
// for a URL): an unbounded group on a long line without its closing marker is quadratic, and 300 KB
// of "[a" or " __x" took minutes. Link labels and URLs also stop at a bracket, so that each failed
// link costs no more than the text up to the next one.
function emphasis(s) {
  return s
    .replace(/\*\*(?=\S)(.{1,500}?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^\p{L}\p{N}_])__(?=\S)(.{1,500}?)__(?![\p{L}\p{N}])/gu, '$1<strong>$2</strong>')
    .replace(/(^|[^*\\])\*(?=\S)([^*]{1,500}?)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/(^|[^\p{L}\p{N}_\\])_(?=\S)([^_]{1,500}?)_(?![\p{L}\p{N}])/gu, '$1<em>$2</em>')
    .replace(/\\([\\`*_{}[\]()#+\-.!@|])/g, '$1');
}

// Inline Markdown on one block of text. Code spans and links are held aside first, so that nothing
// inside them (an underscore in a URL, a star in code) is converted.
function inline(text) {
  const held = [];
  const hold = (html) => {
    held.push(html);
    return `\u0000${held.length - 1}\u0000`;
  };
  let s = String(text).replace(/(`{1,10})(.{1,1000}?)\1/g, (_, __, code) => hold(`<code>${escapeHtml(code)}</code>`));
  s = s.replace(/<((?:https?:\/\/|mailto:)[^\s<>]{1,2000})>/gi, (_, url) => hold(`<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`));
  s = s.replace(/\[([^[\]\n]{1,500})\]\(([^()[\]\s]{1,2000})\)/g, (_, label, url) =>
    SAFE_URL.test(url) ? hold(`<a href="${escapeHtml(url)}">${emphasis(escapeHtml(label))}</a>`) : label,
  );
  s = emphasis(escapeHtml(s));
  // Held parts can hold other held parts (code inside a link label): a few passes, never more than
  // the number of held parts. The input has no U+0000 of its own (markdownToHtml strips it).
  for (let pass = 0; pass <= held.length && /\u0000\d+\u0000/.test(s); pass++) {
    s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => held[Number(i)] ?? '');
  }
  return s.replace(/\u0000/g, '');
}

const splitRow = (line) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/(?<!\\)\|$/, '')
    .split(/(?<!\\)\|/)
    .map((c) => c.trim());

const LIST_ITEM = /^(\s*)([-*+]|\d{1,3}[.)])\s+(.*)$/;

// The Markdown as blocks, in order:
//   { type: 'code', text }                          a fenced code block (the text without the fences)
//   { type: 'div', open: boolean, cls }             a ::: line (cls only when it opens)
//   { type: 'heading', level, text }                # to ######
//   { type: 'table', head: string[], hasHead, rows: string[][] }
//   { type: 'list', ordered, items: string[] }      an item has its continuation lines joined by \n
//   { type: 'para', text }                          the lines of a paragraph joined by \n
// The text of a heading, a cell, an item and a paragraph is Markdown: inline() reads it. C0 control
// characters are stripped first.
function parseBlocks(md) {
  const lines = stripControl(md).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let para = [];
  const flush = () => {
    if (para.length) out.push({ type: 'para', text: para.join('\n') });
    para = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const fence = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fence) {
      flush();
      const code = [];
      for (i += 1; i < lines.length && !new RegExp(`^\\s*${fence[1][0]}{${fence[1].length},}\\s*$`).test(lines[i]); i++) code.push(lines[i]);
      out.push({ type: 'code', text: code.join('\n') });
      continue;
    }

    const div = /^:{3,}\s*(.*)$/.exec(line);
    if (div) {
      flush();
      const cls = /\.([A-Za-z][\w-]*)/.exec(div[1]);
      out.push({ type: 'div', open: div[1].trim() !== '', cls: cls ? cls[1] : 'bloco' });
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      out.push({ type: 'heading', level: heading[1].length, text: heading[2] });
      continue;
    }

    if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1])) {
      flush();
      const head = splitRow(line);
      const rows = [];
      for (i += 2; i < lines.length && /^\s*\|/.test(lines[i]); i++) rows.push(splitRow(lines[i]));
      i -= 1;
      out.push({ type: 'table', head, hasHead: head.some((c) => c !== ''), rows });
      continue;
    }

    const item = LIST_ITEM.exec(line);
    if (item) {
      flush();
      const ordered = /\d/.test(item[2]);
      const items = [];
      while (i < lines.length) {
        const m = LIST_ITEM.exec(lines[i]);
        if (m && /\d/.test(m[2]) === ordered) {
          items.push([m[3]]);
          i += 1;
        } else if (items.length && /^\s{2,}\S/.test(lines[i])) {
          items[items.length - 1].push(lines[i].trim());
          i += 1;
        } else break;
      }
      i -= 1;
      out.push({ type: 'list', ordered, items: items.map((it) => it.join('\n')) });
      continue;
    }

    if (line.trim() === '') flush();
    else para.push(line);
  }
  flush();
  return out;
}

function blockToHtml(b) {
  switch (b.type) {
    case 'code':
      return `<pre><code>${escapeHtml(b.text)}</code></pre>`;
    case 'div':
      return b.open ? `<div class="${b.cls}">` : '</div>';
    case 'heading':
      return `<h${b.level}>${inline(b.text)}</h${b.level}>`;
    case 'table': {
      const thead = b.hasHead ? `<thead><tr>${b.head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead>` : '';
      const tbody = b.rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('');
      return `<table>${thead}<tbody>${tbody}</tbody></table>`;
    }
    case 'list': {
      const tag = b.ordered ? 'ol' : 'ul';
      return `<${tag}>${b.items.map((it) => `<li>${inline(it)}</li>`).join('')}</${tag}>`;
    }
    default:
      return `<p>${inline(b.text)}</p>`;
  }
}

const markdownToHtml = (md) => parseBlocks(md).map(blockToHtml).join('\n');

const CSS = `
:root { color-scheme: light; }
body { margin: 0; background: #fff; color: #1d1d1f; font: 16px/1.55 Georgia, "Times New Roman", serif; }
main { max-width: 46rem; margin: 0 auto; padding: 2rem 1rem 4rem; }
h1 { font-size: 1.9rem; line-height: 1.2; margin: 0 0 .25rem; }
.subtitulo { font-size: 1.15rem; color: #555; margin: 0 0 1.5rem; }
h2 { font-size: 1.35rem; margin: 2rem 0 .6rem; border-bottom: 1px solid #ccc; padding-bottom: .2rem; }
h3 { font-size: 1.1rem; margin: 1.4rem 0 .4rem; }
table { border-collapse: collapse; width: 100%; margin: 1rem 0; font-size: .95rem; }
th, td { border: 1px solid #ccc; padding: .35rem .5rem; text-align: left; vertical-align: top; }
pre { background: #f5f5f5; border: 1px solid #ddd; padding: .75rem; white-space: pre-wrap; overflow-wrap: anywhere; font-size: .85rem; }
code { font-family: Menlo, Consolas, monospace; font-size: .9em; }
.callout-note, .callout-tip, .callout-warning, .callout-important, .callout-caution { border-left: 4px solid #888; padding: .25rem 1rem; margin: 1rem 0; background: #fafafa; }
a { color: #1a4f8b; }
@media print { main { max-width: none; padding: 0; } a { color: inherit; } h2 { break-after: avoid; } pre, table, li { break-inside: avoid; } }
`;

// The printable page: inline CSS, no script. bodyMarkdown is the Markdown below the title and the
// subtitle, which the page prints itself.
function htmlPage(title, subtitle, bodyMarkdown) {
  const heading = escapeHtml(stripControl(title));
  return [
    '<!doctype html>',
    '<html lang="pt-PT">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${heading}</title>`,
    `<style>${CSS}</style>`,
    '</head>',
    '<body>',
    '<main>',
    `<h1>${heading}</h1>`,
    `<p class="subtitulo">${escapeHtml(stripControl(subtitle))}</p>`,
    markdownToHtml(bodyMarkdown),
    '</main>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

const renderHtml = (ficha) => htmlPage(ficha.meta.titulo, ficha.meta.subtitulo, body(ficha));

module.exports = { renderMd, renderHtml, htmlPage, markdownBody: body, parseBlocks, markdownToHtml, inline, escapeHtml, CONTROL };
