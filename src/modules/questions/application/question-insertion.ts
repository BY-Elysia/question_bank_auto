import { independentQuestions } from '../../textbooks/domain/question-categories.js';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { BookRepository } from '../../textbooks/ports/book.repository.js';
import type { TextbookAssets } from '../../textbooks/ports/assets.port.js';
import type { TextbooksService } from '../../textbooks/application/textbooks.service.js';
import type { JobsService } from '../../jobs/application/jobs.service.js';
import type { Job } from '../../jobs/domain/job.js';
import type { JobHandler } from '../../jobs/ports/job-handler.js';
import type { Skills } from '../../../ai/ports/skills.js';
import { Question, type Content } from '../../textbooks/domain/content.js';
import { questionProblems } from '../../textbooks/domain/validation.js';
import { numberComprehensiveExercises } from '../../textbooks/domain/exercise-numbering.js';
import { fail } from '../../../shared/errors.js';
const Output = z.strictObject({
  questions: z
    .array(Question.extend({ children: Question.shape.children.default([]) }))
    .min(1)
    .max(50),
});
export class QuestionInsertion implements JobHandler {
  constructor(
    private store: BookRepository,
    private books: TextbooksService,
    private assets: TextbookAssets,
    private skills: Skills,
  ) {}
  isCommitted(job: Job) {
    return job.processedIds.length > 0;
  }
  async upload(
    id: string,
    anchorId: string,
    position: 'before' | 'after',
    image: Buffer,
    expected: number,
    jobs: JobsService,
  ) {
    const book = await this.store.read(id);
    if (
      book.revision !== expected ||
      book.workflowLock ||
      book.jobs.some((j) => ['queued', 'running'].includes(j.status))
    )
      fail(409, 'Workspace is busy or has changed');
    if (!book.document.contents.some((c) => c.id === anchorId && c.question))
      fail(404, 'Anchor question not found');
    const source = await this.books.uploadImages([image], '补充题目');
    await this.store.update(source.id, (b) => {
      b.workspaceId = id;
      b.extractionContext = book.extractionContext;
    });
    try {
      return await jobs.start(
        id,
        {
          kind: 'insert',
          insertion: { sourceBookId: source.id, anchorId, position },
          cache: 'off',
        },
        `insert:${id}`,
      );
    } catch (e) {
      await this.books.remove(source.id, id);
      throw e;
    }
  }
  async execute(context: Parameters<JobHandler['execute']>[0]) {
    const book = await this.store.read(context.bookId),
      job = book.jobs.find((j) => j.id === context.jobId)!;
    const input = job.request.insertion;
    if (!input) throw new Error('Missing insertion request');
    // A committed job is idempotent when a process stops between commit and completion.
    if (job.processedIds.length) return;
    const source = await this.store.read(input.sourceBookId);
    if (source.workspaceId !== book.id) throw new Error('Invalid insertion source');
    const index = book.document.contents.findIndex((c) => c.id === input.anchorId && c.question);
    if (index < 0) throw new Error('Anchor question no longer exists');
    const result = await this.skills.run(
      'question-insert',
      { pages: [1], instruction: '提取这张补充图片中的独立题目' },
      Output,
      [1],
      { ...context, bookId: source.id },
    );
    const questions = independentQuestions(result.questions);
    for (const q of questions) {
      const problems = questionProblems(q);
      if (problems.length) throw new Error(problems.join('; '));
    }
    context.signal.throwIfAborted();
    const pages = await this.assets.copyPages(book.id, source.id, [1], book.pages.length);
    const number = pages[0]!.number;
    const added: Content[] = questions.map((q) => {
      for (const leaf of [q, ...q.children])
        if (leaf.answer)
          leaf.answer.sources = leaf.answer.sources.map((s) => ({ ...s, page: number }));
      const id = randomUUID();
      return {
        id,
        key: id,
        kind: 'question',
        sectionId: book.document.contents[index]!.sectionId,
        sources: [{ page: number, box: [0, 0, 1, 1] }],
        text: '',
        question: q,
        table: null,
        caption: null,
      };
    });
    await this.store.update(
      book.id,
      (current) => {
        if (current.revision !== job.baseRevision) fail(409, 'Document changed during insertion');
        const anchor = current.document.contents.findIndex((c) => c.id === input.anchorId);
        if (anchor < 0) fail(409, 'Anchor removed');
        current.pages.push(...pages.map((p) => ({ ...p, status: 'processed' as const })));
        current.document.processedPages.push(number);
        current.document.contents.splice(
          anchor + (input.position === 'after' ? 1 : 0),
          0,
          ...added,
        );
        numberComprehensiveExercises(current.document);
        current.jobs.find((j) => j.id === context.jobId)!.processedIds = added.map((c) => c.id);
      },
      true,
    );
  }
}
