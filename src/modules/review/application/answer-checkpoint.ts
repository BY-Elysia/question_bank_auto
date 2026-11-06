import type { BookRepository } from '../../textbooks/ports/book.repository.js';
import type { Content } from '../../textbooks/domain/content.js';
import { contentProblems } from '../../textbooks/domain/validation.js';
import { randomUUID } from 'node:crypto';
import { addEvent } from '../../jobs/application/job-events.js';
export async function checkpointAnswer(
  store: BookRepository,
  bookId: string,
  jobId: string,
  revision: number,
  before: Content,
  after: Content,
) {
  if (contentProblems(after).length) throw new Error('Invalid answer checkpoint');
  await store.update(bookId, (book) => {
    if (
      book.revision !== revision ||
      JSON.stringify(book.document.contents.find((c) => c.id === before.id)) !==
        JSON.stringify(before)
    )
      throw new Error('Document changed during answer generation');
    const proposal = book.proposals.find(
      (p) =>
        p.status === 'pending' &&
        p.reason === 'answers' &&
        p.contentId === before.id &&
        JSON.stringify(p.before) === JSON.stringify(before),
    );
    if (proposal) proposal.after = structuredClone(after);
    else
      book.proposals.push({
        id: randomUUID(),
        jobId,
        contentId: before.id,
        baseRevision: revision,
        before: structuredClone(before),
        after: structuredClone(after),
        reason: 'answers',
        status: 'pending',
      });
    addEvent(
      book.jobs.find((j) => j.id === jobId)!,
      `Answer checkpoint: ${before.id}`,
    );
  });
}
