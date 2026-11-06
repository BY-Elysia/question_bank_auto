import type { Content, Issue } from './content.js';
/** Conservative transcription defects, independent of subject, question IDs or model provider. */
export function transcriptionProblems(content: Content): string[] {
  const problems: string[] = [];
  if (content.kind === 'heading' && !content.text.trim()) problems.push('Heading text is empty');
  const fields: [string, string][] = [
    ['text', content.text],
    ['caption', content.caption ?? ''],
  ];
  for (const [i, q] of (content.question
    ? [content.question, ...content.question.children]
    : []
  ).entries()) {
    fields.push(
      [`question.${i}.prompt`, q.prompt],
      [`question.${i}.answer`, q.answer?.text ?? ''],
      [`question.${i}.explanation`, q.answer?.explanation ?? ''],
    );
    q.options.forEach((o, n) => fields.push([`question.${i}.option.${n}`, o.text]));
  }
  content.table?.forEach((row, i) =>
    row.forEach((cell, j) => fields.push([`table.${i}.${j}`, cell])),
  );
  for (const [field, value] of fields) {
    if (/\uFFFD|[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value))
      problems.push(`${field}: corrupt/control characters`);
    // Mathematical alphabet characters are valid on their own; invisible separators embedded in them are not reliable transcription.
    if (/[\u200b\u200c\u200d\ufeff]/u.test(value) && /[\u{1d400}-\u{1d7ff}]/u.test(value))
      problems.push(
        `${field}: invisible separators inside mathematical symbols; retranscribe as LaTeX from the image`,
      );
    if (/\\(?:frac|sqrt|begin|lim)\b/u.test(value)) {
      let depth = 0;
      for (const match of value.matchAll(/(?<!\\)[{}]/g)) {
        depth += match[0] === '{' ? 1 : -1;
        if (depth < 0) break;
      }
      if (depth !== 0) problems.push(`${field}: unbalanced LaTeX braces`);
    }
  }
  return problems;
}

export function transcriptionIssues(contents: Content[]): Issue[] {
  return contents.flatMap((content) => {
    const issues: Issue[] = transcriptionProblems(content).map((message) => ({
      code: 'TRANSCRIPTION_QUALITY_ERROR',
      severity: 'error',
      page: content.sources[0]?.page ?? null,
      contentId: content.id,
      message,
    }));
    if (JSON.stringify(content).includes('【待校对】'))
      issues.push({
        code: 'SOURCE_TRANSCRIPTION_UNCERTAIN',
        severity: 'warning',
        page: content.sources[0]?.page ?? null,
        contentId: content.id,
        message: 'Source contains explicitly uncertain transcription; inspect original image',
      });
    return issues;
  });
}
