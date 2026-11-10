/** The receiving v1.1 renderer strips HTML before parsing TeX. Emit angle
 * comparisons as TeX commands so valid mathematics cannot look like tags. */
export function exportText(text: string): string {
  const math = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|(?<!\\)\$[^$\n]+?\$)/g;
  let cursor = 0;
  let result = '';
  const prose = (value: string) => value.replace(/</g, '$\\lt$').replace(/>/g, '$\\gt$');
  for (const match of text.matchAll(math)) {
    result += prose(text.slice(cursor, match.index));
    result += match[0].replace(/</g, '\\lt ').replace(/>/g, '\\gt ');
    cursor = match.index + match[0].length;
  }
  return result + prose(text.slice(cursor));
}

export const exportTextBlock = (text: string) => ({ text: exportText(text), media: [] });

/** v1.1 consumers persist/display text + media only. Put the complete solution
 * in text rather than relying on an unsupported explanation extension. */
export function exportAnswer(answer: { text: string; explanation?: string }) {
  const explanation = answer.explanation?.trim();
  const text =
    explanation && explanation !== answer.text.trim()
      ? `${answer.text}\n\n解析：\n${explanation}`
      : answer.text;
  return exportTextBlock(text);
}
