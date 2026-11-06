import { expect, it } from 'vitest';
import { buildReportPdf, type ReportBlock, type ReportDocument } from './reportPdf';

const objectOffsets = (pdf: string) => [...pdf.matchAll(/^(\d{10}) 00000 n $/gm)].map(match => Number(match[1]));
const doc = (blocks: ReportBlock[]): ReportDocument => ({ title: 'Purchase Recommendation', meta: [['Reference', 'BB-1234ABCD']], footer: 'Bunker Buddy', blocks });

it('builds a valid PDF whose cross-reference table points at every object', () => {
  const pdf = buildReportPdf(doc([{ kind: 'section', heading: 'Plan' }, { kind: 'table', rows: [['Quantity', '888 MT']] }]));
  expect(pdf.startsWith('%PDF-1.4')).toBe(true);
  expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
  objectOffsets(pdf).forEach((offset, index) => expect(pdf.slice(offset).startsWith(`${index + 1} 0 obj`)).toBe(true));
  const start = Number(/startxref\n(\d+)/.exec(pdf)![1]);
  expect(pdf.slice(start).startsWith('xref')).toBe(true);
  expect(pdf).toMatch(/\/Info \d+ 0 R/);
  expect(pdf).toContain('/Title (Purchase Recommendation)');
});

it('keeps the file ASCII: brackets escaped, typographic characters octal-encoded, the rest dropped', () => {
  const pdf = buildReportPdf(doc([{ kind: 'paragraph', text: 'Range (low) – high · today’s ✓' }]));
  expect(pdf).toContain('(Range \\(low\\) \\226 high \\267 today\\222s) Tj');
  expect(/[^\x00-\x7f]/.test(pdf)).toBe(false);
});

it('renders every block kind', () => {
  const pdf = buildReportPdf(doc([
    { kind: 'notice', title: 'Demo data', text: 'Illustration only.' },
    { kind: 'summary', label: 'Recommended action', action: 'Wait', tone: 'wait', badge: 'Normal urgency', tagline: 'Buy on Fri 13 Nov.', text: 'Prices are expected to fall.' },
    { kind: 'metrics', items: [{ label: 'Quantity', value: '888 MT' }, { label: 'Cost today', value: 'USD 612,720', tone: 'go' }] },
    { kind: 'table', columns: [{ label: 'Option', width: 0.5 }, { label: 'Total', width: 0.5, align: 'right' }], rows: [['Buy today', { text: '612,720', sub: 'Central' }]] },
    { kind: 'list', numbered: true, items: ['First reason'] },
  ]));
  for (const text of ['DEMO DATA', 'Wait', 'NORMAL URGENCY', '888 MT', 'OPTION', 'Buy today', 'First reason']) {
    expect(pdf).toContain(`(${text}) Tj`);
  }
});

it('wraps long lines within the page and flows onto more pages with numbered footers', () => {
  const items = Array.from({ length: 80 }, (_, n) => `Reason ${n} ${'word '.repeat(40)}`);
  const pdf = buildReportPdf(doc([{ kind: 'section', heading: 'Rationale' }, { kind: 'list', items }]));
  const pages = Number(/\/Count (\d+)/.exec(pdf)![1]);
  expect(pages).toBeGreaterThan(1);
  expect(pdf).toContain(`(Page ${pages} of ${pages}) Tj`);
  const longest = Math.max(...[...pdf.matchAll(/\((.*)\) Tj/g)].map(match => match[1].length));
  expect(longest).toBeLessThanOrEqual(110);
});

it('breaks a range after its dash, never inside a number', () => {
  const pdf = buildReportPdf(doc([{ kind: 'table', columns: [{ label: 'Total', width: 0.14, align: 'right' }, { label: 'Notes', width: 0.86 }],
    rows: [['5,683,200–6,325,220', 'x']] }]));
  expect(pdf).toContain('(5,683,200\\226) Tj');
  expect(pdf).toContain('(6,325,220) Tj');
});
