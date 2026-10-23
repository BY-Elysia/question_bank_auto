import type { WorkspaceRepository } from '../../textbooks/ports/workspace.repository.js';
import { Document, type Content } from '../../textbooks/domain/content.js';
import type { Book } from '../../textbooks/domain/book.js';
import { validateDocument } from '../../textbooks/domain/validation.js';
import { fail } from '../../../shared/errors.js';
export class ReviewService {
  constructor(private store: WorkspaceRepository) {}
  private check(book: Book, expected: number) {
    if (book.revision !== expected) fail(409, 'Revision conflict');
    if (book.jobs.some((j) => ['queued', 'running'].includes(j.status)))
      fail(409, 'Wait for or cancel active task before editing');
  }
  private syncPages(book: Book) {
    for (const page of book.pages) {
      page.status = book.document.processedPages.includes(page.number)
        ? 'processed'
        : page.width
          ? 'ready'
          : 'uploaded';
      page.blank =
        page.status === 'processed' &&
        !book.document.contents.some((c) => c.sources.some((s) => s.page === page.number)) &&
        !book.document.issues.some((i) => i.page === page.number);
    }
  }
  private valid(document: Document, pages: number) {
    const issues = validateDocument(document, pages).filter((i) => i.code !== 'UNPROCESSED_PAGE');
    if (issues.length) fail(400, issues.map((i) => i.message).join('; '));
  }
  async replace(id: string, expected: number, document: Document) {
    return this.store.update(
      id,
      (book) => {
        this.check(book, expected);
        this.valid(document, book.pages.length);
        for (const content of document.contents) {
          const before = book.document.contents.find((c) => c.id === content.id);
          const old = before?.question ? [before.question, ...before.question.children] : [];
          const leaves = content.question ? [content.question, ...content.question.children] : [];
          for (const [index, leaf] of leaves.entries())
            if (leaf.answer && JSON.stringify(leaf.answer) !== JSON.stringify(old[index]?.answer))
              leaf.answer = { ...leaf.answer, origin: 'human', review: 'accepted', sources: [] };
        }
        book.document = document;
        this.syncPages(book);
      },
      true,
    );
  }
  async edit(id: string, expected: number, contentId: string, content: Content) {
    if (content.id !== contentId) fail(400, 'Content identity cannot change');
    const book = await this.store.read(id);
    const index = book.document.contents.findIndex((c) => c.id === contentId);
    if (index < 0) fail(404, 'Content not found');
    book.document.contents[index] = content;
    return this.replace(id, expected, book.document);
  }
  async decide(id: string, proposalId: string, expected: number, decision: 'accept' | 'reject') {
    return this.store.update(
      id,
      (book) => {
        this.check(book, expected);
        const proposal = book.proposals.find((p) => p.id === proposalId);
        if (!proposal) fail(404, 'Proposal not found');
        if (proposal.status !== 'pending') fail(409, 'Proposal already decided');
        if (decision === 'reject') {
          proposal.status = 'rejected';
          return;
        }
        const index = book.document.contents.findIndex((c) => c.id === proposal.contentId);
        if (JSON.stringify(book.document.contents[index]) !== JSON.stringify(proposal.before))
          fail(409, 'Proposal is stale for this content');
        const after = structuredClone(proposal.after);
        if (after.question)
          for (const leaf of [after.question, ...after.question.children])
            if (leaf.answer) leaf.answer.review = 'accepted';
        book.document.contents[index] = after;
        this.valid(book.document, book.pages.length);
        proposal.status = 'accepted';
      },
      decision === 'accept',
    );
  }
  async revisions(id: string) {
    const book = await this.store.read(id);
    return Array.from({ length: book.revision + 1 }, (_, revision) => ({ revision }));
  }
  async restore(id: string, expected: number, revision: number) {
    const book = await this.store.read(id);
    if (!Number.isInteger(revision) || revision < 0 || revision > book.revision)
      fail(404, 'Revision not found');
    const document = await this.store.readRevision(id, revision);
    return this.store.update(
      id,
      (current) => {
        this.check(current, expected);
        this.valid(document, current.pages.length);
        current.document = document;
        this.syncPages(current);
      },
      true,
    );
  }
}
