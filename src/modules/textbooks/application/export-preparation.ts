import type { BookRepository } from '../ports/book.repository.js';
import { scoringReadiness } from '../domain/grading.js';
import { fail } from '../../../shared/errors.js';
/** Read-only validation: answer processing owns scoring, never a download command. */
export class ExportPreparation {
  constructor(private books: BookRepository) {}
  async prepare(id: string) {
    const readiness = scoringReadiness((await this.books.read(id)).document);
    if (readiness.missing)
      fail(422, `还有 ${readiness.missing} 道题的答案评分信息未完成，请先处理对应题目的答案后导出`);
    return { ...readiness, ready: true, jobId: null };
  }
}
