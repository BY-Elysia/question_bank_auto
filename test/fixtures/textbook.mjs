// Original two-page fixture: cross-page GROUP, visible answer, body text and formulas.
export function textbookFixture() {
  const pages = [
    [
      'Chapter 1: Arithmetic',
      'A rectangle has length 4 cm and width 3 cm.',
      'Area = length x width.',
      'Exercise 1. Use the rectangle above.',
      '(1) Calculate its area in square cm.',
      'Exercise 1 continues on the next page.',
    ],
    [
      'Chapter 1: Arithmetic (continued)',
      'Exercise 1 (continued)',
      '(2) Calculate its perimeter in cm.',
      'End of Exercise 1.',
      'Exercise 2. Calculate 2 + 3.',
      'Answer to Exercise 2: 5.',
    ],
  ];
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', ''],
    kids = [];
  for (const lines of pages) {
    const page = objects.length + 1,
      stream = page + 1;
    kids.push(`${page} 0 R`);
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${stream} 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >>`,
    );
    const content = lines
      .map(
        (line, i) =>
          `BT /F1 ${i === 0 ? 22 : 16} Tf 45 ${780 - i * 65} Td (${line.replace(/[\\()]/g, '\\$&')}) Tj ET`,
      )
      .join('\n');
    objects.push(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>`;
  let result = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(result));
    result += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(result);
  result += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) result += `${String(offset).padStart(10, '0')} 00000 n \n`;
  result += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(result);
}
