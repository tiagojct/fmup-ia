'use strict';

// Downloads of a ficha: .md (the .qmd body without the front matter) and a printable HTML page with
// inline CSS and no scripts. The HTML comes from a small Markdown converter that covers what the
// fichas use: headings, paragraphs, lists, tables, code blocks, fenced divs (::: {.class}), bold,
// italic, code, links and autolinks. All text is escaped first; links accept http(s), mailto,
// anchors and relative paths only.

const { renderQmd } = require('./ficha.js');

function renderMd(ficha) {
  return renderQmd(ficha).replace(/^---\n[\s\S]*?\n---\n\n?/, '');
}

const escapeHtml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// C0 control characters other than tab, newline and carriage return. They have no place in a ficha,
// and U+0000 is the placeholder marker of inline() below.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;
const stripControl = (s) => String(s).replace(CONTROL, '');

const SAFE_URL = /^(?:https?:\/\/|mailto:|#|\/|\.{1,2}\/|[^:/?#]+(?:[/?#]|$))/i;

// Bold, italic and backslash escapes, on text that is already escaped.
function emphasis(s) {
  return s
    .replace(/\*\*(?=\S)(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^\p{L}\p{N}_])__(?=\S)(.+?)__(?![\p{L}\p{N}])/gu, '$1<strong>$2</strong>')
    .replace(/(^|[^*\\])\*(?=\S)([^*]+?)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/(^|[^\p{L}\p{N}_\\])_(?=\S)([^_]+?)_(?![\p{L}\p{N}])/gu, '$1<em>$2</em>')
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
  let s = String(text).replace(/(`+)(.+?)\1/g, (_, __, code) => hold(`<code>${escapeHtml(code)}</code>`));
  s = s.replace(/<((?:https?:\/\/|mailto:)[^\s<>]+)>/gi, (_, url) => hold(`<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`));
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) =>
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

function markdownToHtml(md) {
  const lines = stripControl(md).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let para = [];
  const flush = () => {
    if (para.length) out.push(`<p>${inline(para.join('\n'))}</p>`);
    para = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const fence = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fence) {
      flush();
      const code = [];
      for (i += 1; i < lines.length && !new RegExp(`^\\s*${fence[1][0]}{${fence[1].length},}\\s*$`).test(lines[i]); i++) code.push(lines[i]);
      out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }

    const div = /^:{3,}\s*(.*)$/.exec(line);
    if (div) {
      flush();
      const cls = /\.([A-Za-z][\w-]*)/.exec(div[1]);
      out.push(div[1].trim() === '' ? '</div>' : `<div class="${cls ? cls[1] : 'bloco'}">`);
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      const n = heading[1].length;
      out.push(`<h${n}>${inline(heading[2])}</h${n}>`);
      continue;
    }

    if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1])) {
      flush();
      const head = splitRow(line);
      const rows = [];
      for (i += 2; i < lines.length && /^\s*\|/.test(lines[i]); i++) rows.push(splitRow(lines[i]));
      i -= 1;
      const hasHead = head.some((c) => c !== '');
      const thead = hasHead ? `<thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead>` : '';
      const tbody = rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('');
      out.push(`<table>${thead}<tbody>${tbody}</tbody></table>`);
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
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.map((it) => `<li>${inline(it.join('\n'))}</li>`).join('')}</${tag}>`);
      continue;
    }

    if (line.trim() === '') flush();
    else para.push(line);
  }
  flush();
  return out.join('\n');
}

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

function renderHtml(ficha) {
  const title = escapeHtml(stripControl(ficha.meta.titulo));
  return [
    '<!doctype html>',
    '<html lang="pt-PT">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${title}</title>`,
    `<style>${CSS}</style>`,
    '</head>',
    '<body>',
    '<main>',
    `<h1>${title}</h1>`,
    `<p class="subtitulo">${escapeHtml(stripControl(ficha.meta.subtitulo))}</p>`,
    markdownToHtml(renderMd(ficha)),
    '</main>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

module.exports = { renderMd, renderHtml, markdownToHtml, escapeHtml, CONTROL };
