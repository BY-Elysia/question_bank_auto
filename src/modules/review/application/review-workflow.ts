import { fillAnswers } from './answer-workflow.js';
import { randomUUID } from 'node:crypto';
import type { Skills, SkillContext } from '../../../ai/ports/skills.js';
import { RepairResult, VerifyResult } from '../../../ai/workflows/textbook-extraction/contracts.js';
import type { BookRepository } from '../../textbooks/ports/book.repository.js';
import type { Content, Leaf } from '../../textbooks/domain/content.js';
import { contentProblems } from '../../textbooks/domain/validation.js';
import { addEvent } from '../../jobs/application/job-events.js';
export function missingAnswer(question: Leaf) {
  return !question.answer?.text.trim() && question.type !== 'group';
}
export class ReviewWorkflow {
  constructor(
    private store: BookRepository,
    private skills: Skills,
  ) {}
  async execute(context: SkillContext) {
    const book = await this.store.read(context.bookId);
    const job = book.jobs.find((j) => j.id === context.jobId)!;
    const kind = job.kind === 'parse' ? (job.request.generateAnswers ? 'answers' : null) : job.kind;
    if (!kind) return;
    if (
      kind === 'answers' &&
      (book.document.processedPages.length !== book.pages.length ||
        book.document.issues.some((i) => i.severity === 'error'))
    ) {
      await this.store.update(book.id, (current) =>
        current.jobs
          .find((j) => j.id === job.id)!
          .issues.push({
            code: 'ANSWER_GENERATION_BLOCKED',
            message:
              'Resolve incomplete parsing and source issues before generating missing answers',
            page: null,
            contentId: null,
            severity: 'error',
          }),
      );
      return;
    }
    const selectedSections = new Set<string>(job.request.sectionId ? [job.request.sectionId] : []);
    let count = -1;
    while (count !== selectedSections.size) {
      count = selectedSections.size;
      for (const section of book.document.sections)
        if (section.parentId && selectedSections.has(section.parentId))
          selectedSections.add(section.id);
    }
    const contents = book.document.contents.filter(
      (c) =>
        (!job.request.contentIds || job.request.contentIds.includes(c.id)) &&
        (!job.request.sectionId || (c.sectionId && selectedSections.has(c.sectionId))) &&
        c.sources.some((s) => s.page >= job.startPage && s.page <= job.endPage),
    );
    for (const content of contents) {
      if (job.processedIds.includes(content.id)) continue;
      context.signal.throwIfAborted();
      const evidence = [
        ...content.sources,
        ...(content.question
          ? [content.question, ...content.question.children].flatMap((q) => q.answer?.sources ?? [])
          : []),
      ];
      const pages = [...new Set(evidence.map((s) => s.page))];
      let after: Content | null = null;
      let issues: typeof book.document.issues = [];
      if (kind === 'verify') {
        issues = (await this.skills.run('source-verify', { content }, VerifyResult, pages, context))
          .issues;
      } else if (kind === 'repair') {
        const result = await this.skills.run(
          'content-repair',
          { content, instruction: job.request.instruction },
          RepairResult,
          pages,
          context,
        );
        issues = result.issues;
        if (result.content) {
          after = { ...content, ...result.content };
          // Repair preserves identity/sources; it may not launder an AI answer as a source answer.
          if (after.question) {
            const beforeLeaves = content.question
              ? [content.question, ...content.question.children]
              : [];
            for (const [i, leaf] of [after.question, ...after.question.children].entries()) {
              if (
                leaf.answer &&
                JSON.stringify(leaf.answer) !== JSON.stringify(beforeLeaves[i]?.answer)
              )
                leaf.answer = {
                  ...leaf.answer,
                  origin: 'ai_generated',
                  review: 'pending',
                  sources: [],
                };
            }
          }
        }
      } else if (kind === 'answers' && content.question) {
        const question = content.question;
        const targets: (number | null)[] =
          question.type === 'group'
            ? question.children.flatMap((c, i) => (missingAnswer(c) ? [i] : []))
            : missingAnswer(question)
              ? [null]
              : [];
        if (targets.length) {
          const result = await fillAnswers(
            this.skills,
            content,
            targets,
            book.document.contents.filter((c) => c.kind === 'answer'),
            context,
          );
          issues = result.issues;
          after = result.after;
        }
      }
      if (after && contentProblems(after).length)
        throw new Error(`Repair produced invalid content: ${contentProblems(after).join('; ')}`);
      if (issues.some((i) => i.page !== null && !book.pages.some((p) => p.number === i.page)))
        throw new Error('Review issue refers to an unrelated page');
      context.signal.throwIfAborted();
      await this.store.update(book.id, (current) => {
        if (current.revision !== job.baseRevision)
          throw new Error('Document changed during review; start a new task');
        const saved = current.jobs.find((j) => j.id === job.id)!;
        if (after && JSON.stringify(after) !== JSON.stringify(content))
          current.proposals.push({
            id: randomUUID(),
            jobId: job.id,
            contentId: content.id,
            baseRevision: current.revision,
            before: content,
            after,
            reason: job.request.instruction ?? kind,
            status: 'pending',
          });
        // Review findings are task results and do not change document content revision.
        saved.issues.push(...issues.map((i) => ({ ...i, contentId: content.id })));
        saved.processedIds.push(content.id);
        addEvent(saved, `${kind}: ${content.id}`);
      });
    }
  }
}
