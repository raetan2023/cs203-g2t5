import { expect, it } from 'vitest';
import { buildReportPdf } from './reportPdf';

const objectOffsets = (pdf: string) => [...pdf.matchAll(/^(\d{10}) 00000 n $/gm)].map(match => Number(match[1]));

it('builds a valid PDF whose cross-reference table points at every object', () => {
  const pdf = buildReportPdf('Recommendation report (mock)', [{ heading: 'Plan', lines: ['Quantity: 888 MT'] }]);
  expect(pdf.startsWith('%PDF-1.4')).toBe(true);
  expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
  objectOffsets(pdf).forEach((offset, index) => expect(pdf.slice(offset).startsWith(`${index + 1} 0 obj`)).toBe(true));
  const start = Number(/startxref\n(\d+)/.exec(pdf)![1]);
  expect(pdf.slice(start).startsWith('xref')).toBe(true);
});

it('keeps text safe for the PDF: brackets escaped, non-ASCII replaced', () => {
  const pdf = buildReportPdf('Title', [{ heading: 'Notes', lines: ['Range (low) – high · today’s'] }]);
  expect(pdf).toContain("Range \\(low\\) - high - today's");
  expect(/[^\x00-\x7f]/.test(pdf)).toBe(false);
});

it('wraps long lines and flows onto more pages', () => {
  const lines = Array.from({ length: 120 }, (_, n) => `Reason ${n} ${'word '.repeat(30)}`);
  const pdf = buildReportPdf('Title', [{ heading: 'Reasons', lines }]);
  expect(Number(/\/Count (\d+)/.exec(pdf)![1])).toBeGreaterThan(1);
  const longest = Math.max(...[...pdf.matchAll(/\((.*)\) Tj/g)].map(match => match[1].length));
  expect(longest).toBeLessThanOrEqual(90);
});
