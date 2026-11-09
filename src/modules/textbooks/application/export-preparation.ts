import type { BookRepository } from '../ports/book.repository.js';
import type { JobsService } from '../../jobs/application/jobs.service.js';
import { scoringReadiness } from '../domain/grading.js';
import { KeyedLock } from '../../../shared/concurrency/keyed-lock.js';
import { fail } from '../../../shared/errors.js';
/** Export preflight is an explicit command; downloads remain read-only. */
export class ExportPreparation {
  private lock = new KeyedLock();
  constructor(
    private books: BookRepository,
    private jobs: JobsService,
  ) {}
  prepare(id: string) {
    return this.lock.run(id, async () => {
      const book = await this.books.read(id),
        readiness = scoringReadiness(book.document);
      if (!readiness.missing) return { ...readiness, ready: true, jobId: null };
      if (book.workflowLock) fail(409, '请等待教材提取完成');
      const active = book.jobs.find((j) => ['queued', 'running'].includes(j.status));
      if (active) {
        if (active.kind !== 'rubrics') fail(409, '请等待当前教材任务结束');
        return { ...readiness, ready: false, jobId: active.id };
      }
      const previous = [...book.jobs]
        .reverse()
        .find(
          (j) =>
            j.kind === 'rubrics' &&
            !j.request.contentIds &&
            j.baseRevision === book.revision &&
            ['failed', 'interrupted', 'cancelled'].includes(j.status),
        );
      const job = previous
        ? await this.jobs.resume(id, previous.id)
        : await this.jobs.start(id, { kind: 'rubrics', cache: 'prefix' });
      return { ...readiness, ready: false, jobId: job.id };
    });
  }
}
