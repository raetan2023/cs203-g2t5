/**
 * A small, dependency-free PDF writer for the purchase recommendation report (A4, built in the browser).
 * It lays out typed blocks — summary card, key figures, tables, lists — with the standard Helvetica fonts.
 */
export type Tone = 'go' | 'wait' | 'watch' | 'split' | 'neutral';
export type Cell = string | { text: string; sub?: string; bold?: boolean; mono?: boolean; tone?: Tone };
export type TableColumn = { label: string; width: number; align?: 'left' | 'right' };

export type ReportBlock =
  | { kind: 'summary'; label: string; action: string; tone: Tone; badge?: string; tagline?: string; text: string }
  | { kind: 'metrics'; items: { label: string; value: string; note?: string; tone?: Tone }[] }
  | { kind: 'notice'; title: string; text: string }
  | { kind: 'section'; heading: string }
  /** Without columns, rows are label/value pairs. */
  | { kind: 'table'; columns?: TableColumn[]; rows: Cell[][]; note?: string }
  | { kind: 'list'; items: string[]; numbered?: boolean }
  | { kind: 'paragraph'; text: string };

export interface ReportDocument {
  title: string;
  subtitle?: string;
  /** Label/value pairs shown at the top right of the first page. */
  meta: [string, string][];
  /** Short identifier repeated in every page footer. */
  footer: string;
  disclaimer?: string;
  author?: string;
  createdAt?: Date;
  blocks: ReportBlock[];
}

type Font = 'regular' | 'bold' | 'mono';
type Rgb = string;

const PAGE_W = 595, PAGE_H = 842, M = 48, W = PAGE_W - 2 * M;
const CONTENT_BOTTOM = PAGE_H - 70;

const NAVY: Rgb = '0.086 0.161 0.239', INK: Rgb = '0.106 0.137 0.180', MUTED: Rgb = '0.392 0.443 0.502';
const RULE: Rgb = '0.859 0.882 0.906', SHADE: Rgb = '0.957 0.965 0.973', HEAD: Rgb = '0.925 0.937 0.949';
const TEAL: Rgb = '0.059 0.463 0.431', WHITE: Rgb = '1 1 1', PALE: Rgb = '0.725 0.784 0.839';
const AMBER: Rgb = '0.706 0.325 0.035', AMBER_TINT: Rgb = '0.996 0.957 0.890';
const TONES: Record<Tone, { ink: Rgb; tint: Rgb }> = {
  go: { ink: '0.082 0.502 0.239', tint: '0.925 0.973 0.937' },
  wait: { ink: AMBER, tint: AMBER_TINT },
  watch: { ink: '0.114 0.306 0.847', tint: '0.937 0.953 0.996' },
  split: { ink: TEAL, tint: '0.918 0.969 0.961' },
  neutral: { ink: INK, tint: SHADE },
};

// Adobe font metrics for codes 32-126 (1/1000 em).
const REGULAR = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667,
  944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500,
  278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const BOLD = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667,
  944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556,
  333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584];
// WinAnsi codes above 126 that the report uses: [regular, bold].
const EXTRA: Record<number, [number, number]> = {
  0x85: [1000, 1000], 0x91: [222, 278], 0x92: [222, 278], 0x93: [333, 500], 0x94: [333, 500], 0x95: [350, 350],
  0x96: [556, 556], 0x97: [1000, 1000], 0xb0: [400, 400], 0xb7: [278, 278], 0xd7: [584, 584],
};
const WIN_ANSI: Record<string, string> = {
  '–': '\x96', '—': '\x97', '‘': '\x91', '’': '\x92', "'": '\x92', '“': '\x93', '”': '\x94', '•': '\x95', '·': '\xb7',
  '×': '\xd7', '…': '\x85', ' ': ' ', '≈': '~', '→': '->', '≤': '<=', '≥': '>=', '−': '-',
};

/** Text in the fonts' WinAnsi encoding: one character per byte; anything it can't show is dropped. */
function encode(text: string) {
  return [...text.replace(/\s+/g, ' ')].map(char => {
    if (WIN_ANSI[char]) return WIN_ANSI[char];
    const code = char.charCodeAt(0);
    return (code >= 0x20 && code < 0x7f) || (code >= 0xa1 && code <= 0xff) ? char : '';
  }).join('');
}

/** A PDF literal string; bytes outside printable ASCII are octal-escaped so the file stays ASCII. */
function literal(encoded: string) {
  return `(${[...encoded].map(char => {
    const code = char.charCodeAt(0);
    if (char === '\\' || char === '(' || char === ')') return `\\${char}`;
    return code > 126 ? `\\${code.toString(8).padStart(3, '0')}` : char;
  }).join('')})`;
}

function measure(encoded: string, font: Font, size: number, spacing = 0) {
  let units = 0;
  for (const char of encoded) {
    const code = char.charCodeAt(0);
    units += font === 'mono' ? 600 : code >= 32 && code <= 126 ? (font === 'bold' ? BOLD : REGULAR)[code - 32]
      : EXTRA[code]?.[font === 'bold' ? 1 : 0] ?? 556;
  }
  return units * size / 1000 + spacing * encoded.length;
}

/**
 * Wraps on spaces, and after a dash inside a range ("568,320–632,522" may break after the dash),
 * so a number is never split. Only a piece longer than a whole line (an ID, say) is split by character.
 */
function wrap(text: string, font: Font, size: number, width: number) {
  const lines: string[] = [];
  let line = '';
  const fits = (candidate: string) => measure(candidate, font, size) <= width;
  for (const word of encode(text).trim().split(' ').filter(Boolean)) {
    word.split(/(?<=[\x96\x97])/).forEach((piece, n) => {
      const joined = !line ? piece : n === 0 ? `${line} ${piece}` : line + piece;
      if (fits(joined)) { line = joined; return; }
      if (line) lines.push(line);
      line = '';
      for (const char of piece) {
        if (line && !fits(line + char)) { lines.push(line); line = ''; }
        line += char;
      }
    });
  }
  return line ? [...lines, line] : lines;
}

const FONT_REF: Record<Font, string> = { regular: 'F1', bold: 'F2', mono: 'F3' };
const cellOf = (cell: Cell) => typeof cell === 'string' ? { text: cell } : cell;

class Layout {
  pages: string[] = [];
  ops = '';
  /** Distance from the top of the page to the next free line. */
  y = 0;
  private section = 0;

  constructor(private doc: ReportDocument) {
    this.firstPageHeader();
  }

  text(encoded: string, x: number, baseline: number, font: Font, size: number, color: Rgb, spacing = 0) {
    this.ops += `BT /${FONT_REF[font]} ${size} Tf ${spacing} Tc ${color} rg ${fmt(x)} ${fmt(PAGE_H - baseline)} Td ${literal(encoded)} Tj ET\n`;
  }

  rightText(encoded: string, right: number, baseline: number, font: Font, size: number, color: Rgb, spacing = 0) {
    this.text(encoded, right - measure(encoded, font, size, spacing), baseline, font, size, color, spacing);
  }

  rect(x: number, top: number, width: number, height: number, fill: Rgb) {
    this.ops += `${fill} rg ${fmt(x)} ${fmt(PAGE_H - top - height)} ${fmt(width)} ${fmt(height)} re f\n`;
  }

  roundRect(x: number, top: number, width: number, height: number, radius: number, fill?: Rgb, stroke?: Rgb) {
    const b = PAGE_H - top - height, t = PAGE_H - top, r = Math.min(radius, width / 2, height / 2), k = r * 0.5523;
    const path = [`${fmt(x + r)} ${fmt(b)} m`, `${fmt(x + width - r)} ${fmt(b)} l`,
      `${fmt(x + width - r + k)} ${fmt(b)} ${fmt(x + width)} ${fmt(b + r - k)} ${fmt(x + width)} ${fmt(b + r)} c`,
      `${fmt(x + width)} ${fmt(t - r)} l`, `${fmt(x + width)} ${fmt(t - r + k)} ${fmt(x + width - r + k)} ${fmt(t)} ${fmt(x + width - r)} ${fmt(t)} c`,
      `${fmt(x + r)} ${fmt(t)} l`, `${fmt(x + r - k)} ${fmt(t)} ${fmt(x)} ${fmt(t - r + k)} ${fmt(x)} ${fmt(t - r)} c`,
      `${fmt(x)} ${fmt(b + r)} l`, `${fmt(x)} ${fmt(b + r - k)} ${fmt(x + r - k)} ${fmt(b)} ${fmt(x + r)} ${fmt(b)} c`, 'h'].join(' ');
    this.ops += `${fill ? `${fill} rg ` : ''}${stroke ? `${stroke} RG 0.75 w ` : ''}${path} ${fill && stroke ? 'B' : fill ? 'f' : 'S'}\n`;
  }

  hline(x: number, top: number, width: number, color: Rgb, weight = 0.75) {
    this.rect(x, top, width, weight, color);
  }

  logo(x: number, top: number, size: number, fill: Rgb, ink: Rgb) {
    this.roundRect(x, top, size, size, size * 0.22, fill);
    const mark = encode('BB'), fontSize = size * 0.42;
    this.text(mark, x + (size - measure(mark, 'bold', fontSize)) / 2, top + size * 0.65, 'bold', fontSize, ink);
  }

  private firstPageHeader() {
    const { title, subtitle, meta } = this.doc;
    const band = 132;
    this.rect(0, 0, PAGE_W, band, NAVY);
    this.rect(0, band, PAGE_W, 3, TEAL);
    this.logo(M, 30, 24, TEAL, WHITE);
    this.text(encode('BUNKER BUDDY'), M + 34, 41, 'bold', 9.5, WHITE, 1.2);
    this.text(encode('MGO procurement planning'), M + 34, 53, 'regular', 8, PALE);
    let size = 22;
    while (size > 16 && measure(encode(title), 'bold', size) > 300) size -= 1;
    this.text(wrap(title, 'bold', size, 300)[0] ?? '', M, 94, 'bold', size, WHITE);
    if (subtitle) this.text(wrap(subtitle, 'regular', 9.5, 300)[0] ?? '', M, 114, 'regular', 9.5, PALE);
    // Meta pairs, right-aligned in two columns: label and value.
    meta.slice(0, 5).forEach(([label, value], n) => {
      const baseline = 38 + n * 17;
      this.rightText(encode(label.toUpperCase()), PAGE_W - M - 132, baseline, 'bold', 7, PALE, 0.6);
      this.rightText(encode(value), PAGE_W - M, baseline, n === 1 ? 'mono' : 'bold', 9, WHITE);
    });
    this.y = band + 30;
  }

  private continuationHeader() {
    this.logo(M, 30, 16, TEAL, WHITE);
    this.text(encode('BUNKER BUDDY'), M + 23, 42, 'bold', 8, NAVY, 1);
    this.rightText(encode(this.doc.title), PAGE_W - M, 42, 'regular', 8, MUTED);
    this.hline(M, 54, W, RULE);
    this.y = 76;
  }

  newPage() {
    this.pages.push(this.ops);
    this.ops = '';
    this.continuationHeader();
  }

  /** Starts a new page unless `height` still fits on this one. */
  ensure(height: number) {
    if (this.y + height > CONTENT_BOTTOM) this.newPage();
  }

  finish() {
    this.pages.push(this.ops);
    const total = this.pages.length;
    return this.pages.map((page, n) => {
      this.ops = page;
      this.hline(M, PAGE_H - 60, W, RULE);
      if (this.doc.disclaimer) this.text(wrap(this.doc.disclaimer, 'regular', 7, W)[0] ?? '', M, PAGE_H - 47, 'regular', 7, MUTED);
      this.text(encode(this.doc.footer), M, PAGE_H - 32, 'bold', 7.5, NAVY);
      this.rightText(encode(`Page ${n + 1} of ${total}`), PAGE_W - M, PAGE_H - 32, 'regular', 7.5, MUTED);
      return this.ops;
    });
  }

  block(block: ReportBlock, next?: ReportBlock) {
    switch (block.kind) {
      case 'section': return this.sectionHeading(block.heading, next);
      case 'summary': return this.summary(block);
      case 'metrics': return this.metrics(block.items);
      case 'notice': return this.notice(block.title, block.text);
      case 'table': return block.columns ? this.table(block.columns, block.rows, block.note) : this.pairs(block.rows);
      case 'list': return this.list(block.items, block.numbered);
      case 'paragraph': return this.paragraph(block.text);
    }
  }

  private sectionHeading(heading: string, next?: ReportBlock) {
    // Keep the heading with the start of what follows it.
    this.ensure(34 + (next?.kind === 'table' && next.columns ? this.measureTable(next.columns, next.rows, next.note).keep : 90));
    this.section += 1;
    const number = encode(String(this.section).padStart(2, '0'));
    this.text(number, M, this.y + 12, 'bold', 10, TEAL, 0.5);
    this.text(encode(heading.toUpperCase()), M + 24, this.y + 12, 'bold', 10, NAVY, 0.9);
    this.hline(M, this.y + 20, W, RULE);
    this.hline(M, this.y + 20, 18, TEAL, 1.5);
    this.y += 32;
  }

  private summary(block: Extract<ReportBlock, { kind: 'summary' }>) {
    const tone = TONES[block.tone], pad = 18, inner = W - pad * 2 - 4;
    const tagline = block.tagline ? wrap(block.tagline, 'bold', 11, inner) : [];
    const lines = wrap(block.text, 'regular', 10, inner);
    const height = pad + 10 + 30 + tagline.length * 15 + (tagline.length ? 4 : 0) + lines.length * 14.5 + pad - 4;
    this.ensure(height);
    const top = this.y;
    this.roundRect(M, top, W, height, 6, tone.tint);
    this.rect(M, top + 6, 4, height - 12, tone.ink);
    const x = M + pad + 4;
    this.text(encode(block.label.toUpperCase()), x, top + pad + 7, 'bold', 7.5, MUTED, 1);
    this.text(encode(block.action), x, top + pad + 36, 'bold', 26, tone.ink);
    if (block.badge) {
      const badge = encode(block.badge.toUpperCase()), width = measure(badge, 'bold', 7.5, 0.8) + 20;
      this.roundRect(M + W - pad - width, top + pad - 2, width, 18, 9, WHITE, tone.ink);
      this.text(badge, M + W - pad - width + 10, top + pad + 10, 'bold', 7.5, tone.ink, 0.8);
    }
    let y = top + pad + 40;
    for (const line of tagline) { y += 15; this.text(line, x, y, 'bold', 11, INK); }
    if (tagline.length) y += 4;
    for (const line of lines) { y += 14.5; this.text(line, x, y, 'regular', 10, INK); }
    this.y = top + height + 14;
  }

  private metrics(items: Extract<ReportBlock, { kind: 'metrics' }>['items']) {
    const gap = 10, width = (W - gap * (items.length - 1)) / items.length, pad = 11;
    const fitted = items.map(item => {
      const value = encode(item.value);
      let size = 15;
      while (size > 9 && measure(value, 'bold', size) > width - pad * 2) size -= 0.5;
      return { ...item, value: wrap(item.value, 'bold', size, width - pad * 2), size,
        label: wrap(item.label.toUpperCase(), 'bold', 6.8, width - pad * 2).slice(0, 2),
        note: item.note ? wrap(item.note, 'regular', 7.8, width - pad * 2).slice(0, 3) : [] };
    });
    const labelLines = Math.max(...fitted.map(f => f.label.length));
    const valueHeight = Math.max(...fitted.map(f => f.value.length * (f.size + 3)));
    const noteLines = Math.max(...fitted.map(f => f.note.length));
    const height = pad + labelLines * 9 + 8 + valueHeight + noteLines * 10.5 + pad;
    this.ensure(height);
    const valueTop = this.y + pad + labelLines * 9 + 8;
    fitted.forEach((item, n) => {
      const x = M + n * (width + gap), tone = item.tone ? TONES[item.tone] : undefined;
      this.roundRect(x, this.y, width, height, 5, tone ? tone.tint : WHITE, tone ? undefined : RULE);
      if (tone) this.rect(x, this.y, width, 3, tone.ink);
      item.label.forEach((line, i) => this.text(line, x + pad, this.y + pad + 6 + i * 9, 'bold', 6.8, tone ? tone.ink : MUTED, 0.7));
      item.value.forEach((line, i) => this.text(line, x + pad, valueTop + item.size + i * (item.size + 3), 'bold', item.size, INK));
      item.note.forEach((line, i) => this.text(line, x + pad, valueTop + valueHeight + 10 + i * 10.5, 'regular', 7.8, MUTED));
    });
    this.y += height + 18;
  }

  private notice(title: string, text: string) {
    const lines = wrap(text, 'regular', 9, W - 40);
    const height = 16 + 12 + lines.length * 13 + 10;
    this.ensure(height);
    this.roundRect(M, this.y, W, height, 5, AMBER_TINT);
    this.rect(M, this.y + 5, 3.5, height - 10, AMBER);
    this.text(encode(title.toUpperCase()), M + 18, this.y + 20, 'bold', 7.5, AMBER, 0.9);
    lines.forEach((line, n) => this.text(line, M + 18, this.y + 34 + n * 13, 'regular', 9, INK));
    this.y += height + 16;
  }

  /** Row layout plus the height to keep together: the whole table if short, else the header and first row. */
  private measureTable(columns: TableColumn[], rows: Cell[][], note?: string) {
    const pad = 8, size = 9, line = 12.5;
    const widths = columns.map(c => c.width * W);
    const laid = rows.map(row => row.map((raw, n) => {
      const cell = cellOf(raw), font: Font = cell.mono ? 'mono' : cell.bold ? 'bold' : 'regular';
      const cellSize = cell.mono ? 8 : size;
      return { ...cell, font, size: cellSize, lines: wrap(cell.text, font, cellSize, widths[n] - pad * 2),
        subLines: cell.sub ? wrap(cell.sub, 'regular', 7.5, widths[n] - pad * 2) : [] };
    }));
    const heights = laid.map(row => Math.max(...row.map(c => c.lines.length * line + c.subLines.length * 10)) + 12);
    const notes = note ? wrap(note, 'regular', 8, W) : [];
    const headerHeight = Math.max(...columns.map((c, n) => wrap(c.label.toUpperCase(), 'bold', 6.8, widths[n] - pad * 2).length)) * 9 + 14;
    const whole = headerHeight + heights.reduce((a, b) => a + b, 0) + (notes.length ? notes.length * 11 + 6 : 0);
    return { laid, heights, notes, keep: whole <= 280 ? whole : headerHeight + (heights[0] ?? 0) };
  }

  private table(columns: TableColumn[], rows: Cell[][], note?: string) {
    const pad = 8, line = 12.5;
    const widths = columns.map(c => c.width * W);
    const xs = widths.map((_, n) => M + widths.slice(0, n).reduce((a, b) => a + b, 0));
    const header = () => {
      const labels = columns.map((c, n) => wrap(c.label.toUpperCase(), 'bold', 6.8, widths[n] - pad * 2));
      const height = Math.max(...labels.map(l => l.length)) * 9 + 14;
      this.rect(M, this.y, W, height, HEAD);
      labels.forEach((lines, n) => lines.forEach((text, i) => columns[n].align === 'right'
        ? this.rightText(text, xs[n] + widths[n] - pad, this.y + 16 + i * 9, 'bold', 6.8, MUTED, 0.6)
        : this.text(text, xs[n] + pad, this.y + 16 + i * 9, 'bold', 6.8, MUTED, 0.6)));
      this.y += height;
      return height;
    };
    const { laid, heights, notes, keep } = this.measureTable(columns, rows, note);
    this.ensure(keep);
    header();
    laid.forEach((row, r) => {
      if (this.y + heights[r] > CONTENT_BOTTOM) { this.newPage(); header(); }
      if (r % 2 === 1) this.rect(M, this.y, W, heights[r], SHADE);
      row.forEach((cell, n) => {
        const color = cell.tone ? TONES[cell.tone].ink : INK;
        let y = this.y + 6;
        for (const text of cell.lines) {
          y += line - 2.5;
          if (columns[n].align === 'right') this.rightText(text, xs[n] + widths[n] - pad, y, cell.font, cell.size, color);
          else this.text(text, xs[n] + pad, y, cell.font, cell.size, color);
          y += 2.5;
        }
        for (const text of cell.subLines) {
          y += 10;
          const subColor = cell.tone ? TONES[cell.tone].ink : MUTED;
          if (columns[n].align === 'right') this.rightText(text, xs[n] + widths[n] - pad, y - 1, 'regular', 7.5, subColor);
          else this.text(text, xs[n] + pad, y - 1, 'regular', 7.5, subColor);
        }
      });
      this.y += heights[r];
      this.hline(M, this.y - 0.5, W, RULE, 0.5);
    });
    notes.forEach((text, i) => this.text(text, M, this.y + 15 + i * 11, 'regular', 8, MUTED));
    this.y += 16 + (notes.length ? notes.length * 11 + 6 : 0);
  }

  /** A two-column label/value table without a header. */
  private pairs(rows: Cell[][]) {
    const labelWidth = W * 0.32, pad = 8;
    this.ensure(28);
    this.hline(M, this.y, W, RULE, 0.5);
    rows.forEach(([label, value], r) => {
      const valueCell = cellOf(value ?? ''), font: Font = valueCell.mono ? 'mono' : valueCell.bold ? 'bold' : 'regular';
      const size = valueCell.mono ? 8.5 : 9.5;
      const labels = wrap(cellOf(label).text, 'regular', 9, labelWidth - pad * 2);
      const values = wrap(valueCell.text, font, size, W - labelWidth - pad * 2);
      const subs = valueCell.sub ? wrap(valueCell.sub, 'regular', 7.8, W - labelWidth - pad * 2) : [];
      const height = Math.max(labels.length * 13, values.length * 13 + subs.length * 10.5) + 11;
      if (this.y + height > CONTENT_BOTTOM) { this.newPage(); this.hline(M, this.y, W, RULE, 0.5); }
      if (r % 2 === 0) this.rect(M, this.y + 0.5, W, height - 1, SHADE);
      labels.forEach((text, i) => this.text(text, M + pad, this.y + 16 + i * 13, 'regular', 9, MUTED));
      values.forEach((text, i) => this.text(text, M + labelWidth + pad, this.y + 16 + i * 13, font, size,
        valueCell.tone ? TONES[valueCell.tone].ink : INK));
      subs.forEach((text, i) => this.text(text, M + labelWidth + pad, this.y + 16 + values.length * 13 + i * 10.5 - 1, 'regular', 7.8, MUTED));
      this.y += height;
      this.hline(M, this.y - 0.5, W, RULE, 0.5);
    });
    this.y += 14;
  }

  private list(items: string[], numbered = false) {
    const indent = numbered ? 26 : 16, size = 9.8, line = 14;
    items.forEach((item, n) => {
      const lines = wrap(item, 'regular', size, W - indent);
      if (!lines.length) return;
      this.ensure(Math.min(lines.length, 2) * line + 4);
      if (numbered) {
        this.roundRect(M, this.y + 1, 16, 16, 8, TONES.split.tint);
        const label = encode(String(n + 1));
        this.text(label, M + 8 - measure(label, 'bold', 8) / 2, this.y + 12, 'bold', 8, TEAL);
      } else this.rect(M + 3, this.y + 7, 4, 4, TEAL);
      lines.forEach(text => {
        if (this.y + line > CONTENT_BOTTOM) this.newPage();
        this.text(text, M + indent, this.y + 12, 'regular', size, INK);
        this.y += line;
      });
      this.y += 5;
    });
    this.y += 12;
  }

  private paragraph(text: string) {
    for (const line of wrap(text, 'regular', 8.5, W)) {
      this.ensure(13);
      this.text(line, M, this.y + 10, 'regular', 8.5, MUTED);
      this.y += 12.5;
    }
    this.y += 14;
  }
}

const fmt = (value: number) => Number(value.toFixed(2)).toString();

function pdfDate(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `D:${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

/** Returns the PDF file as a string of single-byte (ASCII) characters. */
export function buildReportPdf(doc: ReportDocument) {
  const layout = new Layout(doc);
  doc.blocks.forEach((block, n) => layout.block(block, doc.blocks[n + 1]));
  const contents = layout.finish();
  const firstPage = 6;
  const pageIds = contents.map((_, i) => firstPage + i * 2);
  const font = (name: string) => `<< /Type /Font /Subtype /Type1 /BaseFont /${name} /Encoding /WinAnsiEncoding >>`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${contents.length} >>`,
    font('Helvetica'),
    font('Helvetica-Bold'),
    font('Courier'),
    ...contents.flatMap((content, i) => [
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${pageIds[i] + 1} 0 R >>`,
      `<< /Length ${content.length} >>\nstream\n${content}endstream`,
    ]),
    `<< /Title ${literal(encode(doc.title))} /Author ${literal(encode(doc.author ?? 'Bunker Buddy'))} /Creator (Bunker Buddy) /Producer (Bunker Buddy)`
      + ` /CreationDate (${pdfDate(doc.createdAt ?? new Date())}) >>`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = objects.map((object, i) => {
    const offset = pdf.length;
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  return `${pdf}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${objects.length} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
}

export function downloadReportPdf(filename: string, doc: ReportDocument) {
  const url = URL.createObjectURL(new Blob([buildReportPdf(doc)], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
