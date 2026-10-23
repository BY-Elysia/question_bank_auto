import { z } from 'zod';
import { Issue, Id, type Content } from '../../textbooks/domain/content.js';
import type { Skills, SkillContext } from '../../../ai/runtime/skill-runner.js';
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
  // Any unresolved lookup concern requires review instead of silently generating over a source answer.
  if (remaining.size && !issues.length) {
    const result = await skills.run(
      'answer-generate',
      { content, targets: [...remaining] },
      AnswerResult,
      pages,
      context,
    );
    issues.push(...result.issues);
    for (const answer of result.answers) {
      if (!remaining.has(answer.childIndex))
        throw new Error('Answer result tried to overwrite a non-target answer');
      const target =
        answer.childIndex === null ? after.question! : after.question!.children[answer.childIndex]!;
      target.answer = {
        text: answer.text,
        explanation: answer.explanation,
        origin: 'ai_generated',
        review: 'pending',
        sources: [],
      };
      remaining.delete(answer.childIndex);
    }
  }
  if (remaining.size && !issues.length)
    throw new Error('Missing generated answers without an issue');
  return { after: JSON.stringify(after) === JSON.stringify(content) ? null : after, issues };
}
