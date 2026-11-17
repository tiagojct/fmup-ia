'use strict';

// The ficha as a Word file (spec D5), with the npm package docx (pure JavaScript, no pandoc).
//
// It gives the same sections, headings and meta table as the HTML export, because it reads the same
// Markdown: the body that renderQmd writes (SECTION_ORDER, the extras in their slots, the section
// headings, the rules of an empty reference list), read into blocks by export.js parseBlocks and
// into inline text by export.js inline(). Nothing else reads Markdown here, so the two downloads
// cannot disagree on a line.
//
//   # title                        the Title style, then the subtitle in its own style
//   ## and # heading               Heading 1;  ###: Heading 2;  #### to ######: Heading 3 to 5
//   paragraph, - list, 1. list     paragraphs; bullets; numbered lists (each list starts at 1)
//   | table |                      a Table with borders (a header row is bold, as are the labels of the meta table)
//   fenced code                    one monospace paragraph for each line, without the fence
//   **bold** *italic* `code`       runs; [label](https://...) and <https://...> are hyperlinks
//   backslash escapes (\@, \|)     removed
//   ::: fence lines                dropped
// A link that is not http(s) or mailto (a relative path, an anchor) is its label, as plain text.
//
// The text is made safe for XML before it is read: C0 control characters, U+FFFE, U+FFFF and lone
// surrogates are removed, and a tab is four spaces. docx escapes & < > " ' in the XML itself.

const {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} = require('docx');
const { stripControl } = require('./control.js');
const { parseBlocks, inline, markdownBody } = require('./export.js');

const FONT = 'Calibri';
const MONO = 'Courier New';
const TABLE_WIDTH = 9000; // twips; A4 with margins of 2.5 cm leaves 9072
const ORDERED = 'numeros';
const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5];
const REAL_LINK = /^(?:https?:\/\/|mailto:)/i;
const NOT_XML = /[\ufffe\uffff]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };

const clean = (s) => stripControl(s ?? '').replace(NOT_XML, '').replace(/\t/g, '    ');

// ---------------------------------------------------------------- inline text

const decode = (s) => s.replace(/&(?:amp|lt|gt|quot|#39);/g, (e) => ENTITIES[e]);

function run(text, st) {
  return new TextRun({
    text,
    ...(st.bold ? { bold: true } : {}),
    ...(st.italics ? { italics: true } : {}),
    ...(st.code ? { font: MONO, size: 20 } : {}),
    ...(st.link ? { style: 'Hyperlink' } : {}),
  });
}

// The runs of one piece of Markdown text. inline() turns it into HTML with a few tags only (strong,
// em, code and a, on text that it has already escaped), and the tags are read here. Emphasis tags
// are counted, not nested, so that a crossing pair (the converter can make one) does no harm.
// base: { bold: true } for a header cell.
function runs(markdown, base = {}) {
  const state = { bold: base.bold ? 1 : 0, italics: 0, code: 0 };
  const frames = [{ children: [], url: null }];
  const top = () => frames[frames.length - 1];
  const closeLink = () => {
    const frame = frames.pop();
    top().children.push(...(frame.url ? [new ExternalHyperlink({ children: frame.children, link: frame.url })] : frame.children));
  };

  for (const m of inline(String(markdown).split('\n').map((l) => l.trim()).join(' ')).matchAll(/<(\/?)(strong|em|code|a)(?: href="([^"]*)")?>|([^<]+)/g)) {
    const [, close, tag, href, text] = m;
    if (text !== undefined) {
      top().children.push(run(decode(text), { bold: state.bold > 0, italics: state.italics > 0, code: state.code > 0, link: top().url !== null }));
    } else if (tag === 'a') {
      if (!close) {
        const url = decode(href || '');
        frames.push({ children: [], url: REAL_LINK.test(url) ? url : null });
      } else if (frames.length > 1) closeLink();
    } else {
      const key = { strong: 'bold', em: 'italics', code: 'code' }[tag];
      state[key] = Math.max(0, state[key] + (close ? -1 : 1));
    }
  }
  while (frames.length > 1) closeLink();
  return frames[0].children;
}

// ---------------------------------------------------------------- blocks

function tableOf(b) {
  const cols = Math.max(1, b.head.length, ...b.rows.map((r) => r.length));
  const widths = cols === 2 ? [2600, TABLE_WIDTH - 2600] : Array.from({ length: cols }, () => Math.floor(TABLE_WIDTH / cols));
  const line = { style: BorderStyle.SINGLE, size: 4, color: 'BBBBBB' };
  const row = (cells, header) =>
    new TableRow({
      tableHeader: header,
      children: Array.from({ length: cols }, (_, i) => {
        return new TableCell({
          width: { size: widths[i], type: WidthType.DXA },
          margins: { top: 60, bottom: 60, left: 100, right: 100 },
          ...(header ? { shading: { type: ShadingType.CLEAR, fill: 'EEEEEE', color: 'auto' } } : {}),
          children: [new Paragraph({ spacing: { after: 0 }, children: runs(cells[i] || '', { bold: header }) })],
        });
      }),
    });
  return new Table({
    width: { size: TABLE_WIDTH, type: WidthType.DXA },
    columnWidths: widths,
    borders: { top: line, bottom: line, left: line, right: line, insideHorizontal: line, insideVertical: line },
    rows: [...(b.hasHead ? [row(b.head, true)] : []), ...b.rows.map((r) => row(r, false))],
  });
}

const spacer = () => new Paragraph({ spacing: { after: 120 }, children: [] });

function blocksToDocx(blocks) {
  const out = [];
  let lists = 0; // each numbered list is an instance of ORDERED, so that it starts at 1
  for (const b of blocks) {
    switch (b.type) {
      case 'heading':
        out.push(new Paragraph({ heading: HEADINGS[Math.min(HEADINGS.length - 1, Math.max(0, b.level - 2))], children: runs(b.text) }));
        break;
      case 'para':
        out.push(new Paragraph({ spacing: { after: 120 }, children: runs(b.text) }));
        break;
      case 'list': {
        lists += 1;
        for (const item of b.items) {
          out.push(
            new Paragraph({
              spacing: { after: 60 },
              ...(b.ordered ? { numbering: { reference: ORDERED, level: 0, instance: lists } } : { bullet: { level: 0 } }),
              children: runs(item),
            }),
          );
        }
        out.push(spacer());
        break;
      }
      case 'table':
        out.push(tableOf(b), spacer());
        break;
      case 'code':
        for (const line of b.text.split('\n')) {
          out.push(
            new Paragraph({
              spacing: { after: 0 },
              shading: { type: ShadingType.CLEAR, fill: 'F2F2F2', color: 'auto' },
              children: [new TextRun({ text: line, font: MONO, size: 20 })],
            }),
          );
        }
        out.push(spacer());
        break;
      default:
        // A ::: fence line: the content stays, the fence goes.
        break;
    }
  }
  return out;
}

// ---------------------------------------------------------------- the document

// A Promise of the .docx file, a Buffer.
async function renderDocx(ficha) {
  const titulo = clean(ficha.meta.titulo);
  const subtitulo = clean(ficha.meta.subtitulo);
  const doc = new Document({
    creator: 'Eunomia',
    title: titulo,
    styles: {
      default: {
        document: { run: { font: FONT, size: 22, language: { value: 'pt-PT' } } },
        title: { run: { font: FONT, size: 44, bold: true, color: '1F3864' }, paragraph: { spacing: { after: 60 } } },
        heading1: { run: { font: FONT, size: 30, bold: true, color: '1F3864' }, paragraph: { spacing: { before: 360, after: 120 }, keepNext: true } },
        heading2: { run: { font: FONT, size: 26, bold: true, color: '1F3864' }, paragraph: { spacing: { before: 240, after: 80 }, keepNext: true } },
        heading3: { run: { font: FONT, size: 24, bold: true }, paragraph: { spacing: { before: 200, after: 60 }, keepNext: true } },
      },
      paragraphStyles: [
        {
          id: 'Subtitulo',
          name: 'Subtítulo da ficha',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { size: 28, color: '555555' },
          paragraph: { spacing: { after: 240 } },
        },
      ],
    },
    numbering: {
      config: [
        {
          reference: ORDERED,
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.',
              alignment: AlignmentType.START,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1417, bottom: 1417, left: 1417, right: 1417 } } },
        children: [
          new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(titulo)] }),
          new Paragraph({ style: 'Subtitulo', children: [new TextRun(subtitulo)] }),
          ...blocksToDocx(parseBlocks(clean(markdownBody(ficha)))),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}

module.exports = { renderDocx };
