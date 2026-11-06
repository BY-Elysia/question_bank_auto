import { answerOutput } from './answer-output.js';
import { transcriptionProblems } from '../../textbooks/domain/transcription-quality.js';
import { StructuredOutputError } from '../../../ai/ports/skills.js';
import { z } from 'zod';
import { Issue, Id, type Content } from '../../textbooks/domain/content.js';
import type { Skills, SkillContext } from '../../../ai/ports/skills.js';
import { AnswerResult } from '../../../ai/workflows/textbook-extraction/contracts.js';
const Lookup = z.strictObject({ sourceIds: z.array(Id), issues: z.array(Issue) });
const SourceAnswers = z.strictObject({
  answers: z.array(
    z.strictObject({
      childIndex: z.number().int().nonnegative().nullable(),
      text: z.string().min(1),
      explanation: z.string(),
      sourceIds: z.array(Id).min(1),
    }),
  ),
  issues: z.array(Issue),
});
export async function fillAnswers(
  skills: Skills,
  content: Content,
  targets: (number | null)[],
  answerBlocks: Content[],
  context: SkillContext,
  generate = true,
  checkpoint?: (after: Content) => Promise<void>,
) {
  const after = structuredClone(content),
    issues: z.infer<typeof Issue>[] = [];
  const remaining = new Set(targets),
    pages = [...new Set(content.sources.map((s) => s.page))];
  // Search all extracted answer blocks before treating an answer as missing.
  for (let offset = 0; offset < answerBlocks.length && remaining.size; offset += 30) {
    const candidates = answerBlocks.slice(offset, offset + 30);
    const lookup = await skills.run(
      'source-verify',
      { mode: 'answer_lookup', content, candidates },
      Lookup,
      [],
      context,
    );
    issues.push(...lookup.issues);
    if (lookup.sourceIds.some((id) => !candidates.some((c) => c.id === id)))
      throw new Error('Answer lookup returned an unknown source');
    const selected = candidates.filter((c) => lookup.sourceIds.includes(c.id));
    if (!selected.length) continue;
    const selectedPages = [
      ...new Set([...pages, ...selected.flatMap((c) => c.sources.map((s) => s.page))]),
    ];
    if (selectedPages.length > 12)
      throw new Error('Too many answer source pages; narrow the answer blocks before generating');
    const result = await skills.run(
      'source-verify',
      { mode: 'answer_extract', content, candidates: selected, targets: [...remaining] },
      SourceAnswers,
      selectedPages,
      context,
    );
    issues.push(...result.issues);
    for (const answer of result.answers) {
      if (
        !remaining.has(answer.childIndex) ||
        answer.sourceIds.some((id) => !selected.some((c) => c.id === id))
      )
        throw new Error('Invalid source answer target or reference');
      const target =
        answer.childIndex === null ? after.question! : after.question!.children[answer.childIndex]!;
      target.answer = {
        text: answer.text,
        explanation: answer.explanation,
        origin: 'source',
        review: 'pending',
        sources: selected.filter((c) => answer.sourceIds.includes(c.id)).flatMap((c) => c.sources),
      };
      remaining.delete(answer.childIndex);
    }
  }
  // The backend owns target identity. One call per leaf avoids large nested JSON,
  // and every accepted leaf is durably checkpointed before moving forward.
  if (checkpoint && remaining.size !== targets.length) await checkpoint(after);
  if (generate && remaining.size && !issues.length) {
    for (const childIndex of [...remaining]) {
      context.signal.throwIfAborted();
      const leaf = childIndex === null ? after.question! : after.question!.children[childIndex]!;
      let result;
      try {
        result = await skills.run(
          'answer-generate',
          {
            content: {
              id: content.id,
              question: { ...after.question!, answer: null, children: [] },
            },
            targets: [childIndex],
            target: { ...leaf, answer: null },
            sharedPrompt: childIndex === null ? '' : after.question!.prompt,
            instruction:
              'Compare this target against its source image before solving. A derivative/sign/condition mismatch must return ISSUE; never silently solve a corrected question.',
          },
          AnswerResult,
          pages,
          context,
          answerOutput(childIndex),
        );
      } catch (error) {
        if (context.signal.aborted) throw error;
        const status = (error as { status?: number }).status;
        if (
          !(error instanceof StructuredOutputError) &&
          (error as Error).name !== 'TimeoutError' &&
          !(status && (status === 429 || status >= 500))
        )
          throw error;
        const code =
          error instanceof StructuredOutputError
            ? 'ANSWER_FORMAT_FAILED'
            : (error as Error).name === 'TimeoutError'
              ? 'ANSWER_TIMEOUT'
              : 'ANSWER_PROVIDER_FAILED';
        issues.push({
          code,
          severity: 'warning',
          page: pages[0] ?? null,
          contentId: content.id,
          message: `答案补全未完成（${childIndex === null ? '整题' : `小问 ${childIndex + 1}`}）；已保留其他结果，可单独重试。`,
        });
        continue;
      }
      issues.push(...result.issues);
      if (result.answers.length > 1 || result.answers.some((a) => a.childIndex !== childIndex))
        throw new Error('Answer result tried to overwrite a non-target answer');
      const answer = result.answers[0];
      if (!answer) {
        if (!result.issues.length) throw new Error('Missing generated answers without an issue');
        continue;
      }
      const candidate = structuredClone(after);
      const target =
        childIndex === null ? candidate.question! : candidate.question!.children[childIndex]!;
      target.answer = {
        text: answer.text,
        explanation: answer.explanation,
        origin: 'ai_generated',
        review: 'pending',
        sources: [],
      };
      if (
        ['single_choice', 'multiple_choice'].includes(target.type) &&
        !target.options.some((o) => o.id === answer.text.trim()) &&
        target.type === 'single_choice'
      ) {
        issues.push({
          code: 'ANSWER_INVALID_OPTION',
          severity: 'warning',
          page: pages[0] ?? null,
          contentId: content.id,
          message: '生成答案不是有效选项，未写入候选。',
        });
        continue;
      }
      const defects = transcriptionProblems(candidate);
      if (defects.length) {
        issues.push({
          code: 'ANSWER_INVALID_MATH',
          severity: 'warning',
          page: pages[0] ?? null,
          contentId: content.id,
          message: '生成公式未通过校验，未写入候选。',
        });
        continue;
      }
      Object.assign(after, candidate);
      remaining.delete(childIndex);
      if (checkpoint) await checkpoint(after);
    }
  }
  return { after: JSON.stringify(after) === JSON.stringify(content) ? null : after, issues };
}
