import type { Skills, SkillContext } from '../../../ai/ports/skills.js';
import type { BookRepository } from '../../textbooks/ports/book.repository.js';
import type { Job } from '../../jobs/domain/job.js';
import {
  Scoring,
  currentGrading,
  gradingBasis,
  scoringTargets,
} from '../../textbooks/domain/grading.js';
import { rubricOutput, RubricResult } from './rubric-output.js';
import { addEvent } from '../../jobs/application/job-events.js';
const committed = 'Scoring criteria committed';
/** Durable per-leaf stage; bounded workers, atomic publication and explicit restart recovery. */
export class RubricWorkflow {
  constructor(
    private store: BookRepository,
    private skills: Skills,
    private concurrency = 3,
  ) {}
  isCommitted(job: Job) {
    return job.events.some((e) => e.message === committed);
  }
  async execute(context: SkillContext) {
    const book = await this.store.read(context.bookId),
      job = book.jobs.find((j) => j.id === context.jobId)!;
    if (this.isCommitted(job)) return;
    if (book.revision !== job.baseRevision) throw new Error('教材已修改，请重新生成评分细则');
    const stage = structuredClone(job.stage ?? book.document);
    const all = scoringTargets(stage);
    const targets = all.filter(
      (t) =>
        (!job.request.contentIds || job.request.contentIds.includes(t.contentId)) &&
        !currentGrading(t.leaf, t.sharedPrompt),
    );
    let index = 0;
    const abort = new AbortController();
    const signal = AbortSignal.any([context.signal, abort.signal]);
    const worker = async () => {
      while (index < targets.length) {
        const target = targets[index++]!;
        signal.throwIfAborted();
        const defaultScore = target.leaf.grading?.defaultScore ?? 10;
        const result = await this.skills.run(
          'rubric-generate',
          {
            sharedPrompt: target.sharedPrompt,
            target: {
              type: target.leaf.type,
              prompt: target.leaf.prompt,
              options: target.leaf.options,
              answer: target.leaf.answer,
            },
            defaultScore,
          },
          RubricResult,
          [],
          { ...context, signal },
          rubricOutput(defaultScore),
        );
        signal.throwIfAborted();
        if ('issue' in result)
          throw new Error(
            `评分依据需要核对（${target.contentId}，子题 ${target.childIndex ?? '无'}）：${result.issue}`,
          );
        const grading = {
          ...Scoring.parse(result),
          basis: gradingBasis(target.leaf, target.sharedPrompt),
        };
        await this.store.update(book.id, (current) => {
          signal.throwIfAborted();
          if (current.revision !== job.baseRevision) throw new Error('教材已修改，评分细则未发布');
          target.leaf.grading = grading;
          const saved = current.jobs.find((j) => j.id === job.id)!;
          saved.stage = structuredClone(stage);
          addEvent(saved, `Rubric checkpoint: ${target.contentId}:${target.childIndex ?? 'root'}`);
        });
      }
    };
    let failure: unknown;
    await Promise.all(
      Array.from({ length: Math.min(this.concurrency, targets.length) }, () =>
        worker().catch((e) => {
          if (!failure) failure = e;
          abort.abort(e);
        }),
      ),
    );
    if (failure) throw failure;
    context.signal.throwIfAborted();
    await this.store.update(
      book.id,
      (current) => {
        context.signal.throwIfAborted();
        if (current.revision !== job.baseRevision) throw new Error('教材已修改，评分细则未发布');
        const saved = current.jobs.find((j) => j.id === job.id)!;
        current.document = stage;
        saved.stage = null;
        saved.processedIds = [...new Set(all.map((t) => t.contentId))];
        addEvent(saved, committed);
      },
      JSON.stringify(stage) !== JSON.stringify(book.document),
    );
  }
}
