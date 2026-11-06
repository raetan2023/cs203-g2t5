/**
 * A deliberately small mock of the recommendation report: plain text on A4, built in the browser with no library.
 * The real report (server-generated, from the saved snapshot) is a follow-up.
 */
export type ReportSection = { heading: string; lines: string[] };

const PAGE_HEIGHT = 842, MARGIN = 56, LINE = 15, WRAP = 88;
const ascii = (text: string) => text.replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/·/g, '-').replace(/[^\x20-\x7e]/g, '');
const escaped = (text: string) => text.replace(/[\\()]/g, '\\$&');

function wrap(text: string) {
  const lines: string[] = [];
  let line = '';
  for (const word of ascii(text).split(/\s+/)) {
    if (line && line.length + word.length + 1 > WRAP) { lines.push(line); line = word; }
    else line = line ? `${line} ${word}` : word;
  }
  return line ? [...lines, line] : lines;
}

type Row = { text: string; bold?: boolean; size?: number; gap?: number };

function pages(title: string, sections: ReportSection[]) {
  const rows: Row[] = [{ text: ascii(title), bold: true, size: 18, gap: 10 }];
  for (const section of sections) {
    rows.push({ text: ascii(section.heading), bold: true, gap: 10 });
    for (const line of section.lines) rows.push(...wrap(line).map(text => ({ text })));
  }
  const result: string[] = [];
  let content = '', y = PAGE_HEIGHT - MARGIN;
  for (const row of rows) {
    y -= LINE + (row.gap ?? 0);
    if (y < MARGIN) { result.push(content); content = ''; y = PAGE_HEIGHT - MARGIN - LINE; }
    content += `BT /${row.bold ? 'F2' : 'F1'} ${row.size ?? 10} Tf ${MARGIN} ${y} Td (${escaped(row.text)}) Tj ET\n`;
  }
  return [...result, content];
}

/** Returns the PDF file as a string of single-byte characters. */
export function buildReportPdf(title: string, sections: ReportSection[]) {
  const contents = pages(title, sections);
  const pageIds = contents.map((_, i) => 5 + i * 2);
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${contents.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    ...contents.flatMap((content, i) => [
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageIds[i] + 1} 0 R >>`,
      `<< /Length ${content.length} >>\nstream\n${content}endstream`,
    ]),
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = objects.map((object, i) => {
    const offset = pdf.length;
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  return `${pdf}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
}

export function downloadReportPdf(filename: string, title: string, sections: ReportSection[]) {
  const url = URL.createObjectURL(new Blob([buildReportPdf(title, sections)], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
