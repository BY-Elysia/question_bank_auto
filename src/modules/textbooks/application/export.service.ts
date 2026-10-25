import type { ArchivePort } from '../ports/assets.port.js';
import type { PageImagePort } from '../ports/assets.port.js';
import type { BookRepository } from '../ports/book.repository.js';
import { validateDocument } from '../domain/validation.js';
export class ExportService {
  constructor(
    private store: BookRepository,
    private images: PageImagePort,
    private archives: ArchivePort,
  ) {}
  async json(id: string) {
    const book = await this.store.read(id);
    return {
      schemaVersion: book.schemaVersion,
      id: book.id,
      title: book.title,
      metadata: book.extractionContext?.metadata ?? null,
      revision: book.revision,
      pages: book.pages.map((p) => ({ ...p, image: `pages/${p.number}.png` })),
      ...book.document,
      validation: validateDocument(book.document, book.pages.length),
      reviewIssues: book.jobs
        .filter((j) => j.baseRevision === book.revision)
        .flatMap((j) => j.issues),
      pendingProposalCount: book.proposals.filter((p) => p.status === 'pending').length,
    };
  }
  async zip(id: string) {
    const book = await this.store.read(id);
    for (const page of book.pages) await this.images.ensure(id, page.number);
    const document = await this.json(id);
    return this.archives.create(
      id,
      document,
      book.pages.map((p) => p.number),
    );
  }
}
