import { z } from 'zod';
import type { Content, Issue } from '../../textbooks/domain/content.js';
import type { Skills, SkillContext } from '../../../ai/ports/skills.js';
const SourceText = z.strictObject({
  blocks: z
    .array(z.strictObject({ page: z.number().int().positive(), text: z.string().min(1) }))
    .min(1),
});
const AuditResult = z.strictObject({
  checks: z
    .array(
      z.strictObject({
        page: z.number().int().positive(),
        sourceText: z.string().min(1),
        extractedText: z.string(),
        verdict: z.enum(['matched', 'omitted', 'changed', 'uncertain']),
      }),
    )
    .min(1),
});
export async function auditTranscription(
  skills: Skills,
  content: Content,
  pages: number[],
  context: SkillContext,
) {
  // Read the source without showing the candidate text, reducing confirmation bias.
  const reference = await skills.run(
    'source-verify',
    { mode: 'source_transcribe', sources: content.sources },
    SourceText,
    pages,
    context,
  );
  if (pages.some((page) => !reference.blocks.some((block) => block.page === page)))
    throw new Error('Source transcription omitted a requested page');
  if (reference.blocks.some((b) => !pages.includes(b.page)))
    throw new Error('Transcription source refers to an unrelated page');
  const result = await skills.run(
    'source-verify',
    { mode: 'transcription_audit', content, reference: reference.blocks },
    AuditResult,
    [],
    context,
  );
  if (result.checks.some((c) => !pages.includes(c.page)))
    throw new Error('Transcription audit evidence refers to an unrelated page');
  const text = [content.text, content.caption ?? '', ...(content.table?.flat() ?? [])];
  for (const q of content.question ? [content.question, ...content.question.children] : [])
    text.push(
      q.prompt,
      ...q.options.map((o) => o.text),
      q.answer?.text ?? '',
      q.answer?.explanation ?? '',
    );
  const normalize = (value: string) => value.replace(/\s+/g, '');
  const issues: Issue[] = reference.blocks
    .filter((block) => !result.checks.some((check) => check.page === block.page))
    .map((block) => ({
      code: 'AUDIT_COVERAGE_INCOMPLETE',
      message: '核对未覆盖该来源页，需人工检查',
      page: block.page,
      contentId: content.id,
      severity: 'warning',
    }));
  for (const check of result.checks) {
    const quotedSource = reference.blocks.some(
      (b) => b.page === check.page && normalize(b.text).includes(normalize(check.sourceText)),
    );
    const quotedExtract =
      check.extractedText.trim() &&
      text.some((value) => normalize(value).includes(normalize(check.extractedText)));
    if (
      !quotedSource ||
      (check.extractedText.trim() && !quotedExtract) ||
      (check.verdict === 'matched' && !quotedExtract)
    ) {
      issues.push({
        code: 'AUDIT_EVIDENCE_UNSUPPORTED',
        message: '核对引用无法在独立原文转录或提取结果中定位，需人工核对；未将其判为原文遗漏',
        page: check.page,
        contentId: content.id,
        severity: 'warning',
      });
    } else if (check.verdict !== 'matched') {
      issues.push({
        code:
          check.verdict === 'uncertain'
            ? 'SOURCE_TRANSCRIPTION_UNCERTAIN'
            : 'SOURCE_TRANSCRIPTION_OMISSION',
        message: `${check.verdict}: 原图转录「${check.sourceText}」；提取「${check.extractedText || '未找到对应内容'}」`,
        page: check.page,
        contentId: content.id,
        severity: check.verdict === 'uncertain' ? 'warning' : 'error',
      });
    }
  }
  return issues;
}
