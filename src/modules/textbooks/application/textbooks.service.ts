import { randomUUID } from 'node:crypto';
import type { BookRepository } from '../ports/book.repository.js';
import type { PageImagePort } from '../ports/assets.port.js';
import type { TextbookAssets } from '../ports/assets.port.js';
import { emptyDocument } from '../domain/book.js';
import { fail } from '../../../shared/errors.js';
export class TextbooksService {
  constructor(
    private store: BookRepository,
    private assets: TextbookAssets,
    private images: PageImagePort,
  ) {}
  async upload(buffer: Buffer, title: string) {
    if (!buffer.length || !buffer.subarray(0, 1024).includes(Buffer.from('%PDF-')))
      fail(400, 'A PDF body is required');
    const id = randomUUID();
    try {
      const pages = await this.assets.prepare(id, buffer);
      const now = new Date().toISOString();
      const book = {
        schemaVersion: '1.0' as const,
        id,
        title,
        revision: 0,
        createdAt: now,
        updatedAt: now,
        pages,
        document: emptyDocument(),
        jobs: [],
        proposals: [],
      };
      await this.store.create(book);
      return book;
    } catch (error) {
      await this.assets.remove(id);
      throw error;
    }
  }
  async asset(id: string, page?: number) {
    const book = await this.store.read(id);
    if (page !== undefined && !book.pages.some((p) => p.number === page))
      fail(404, 'Page not found');
    return page === undefined ? this.assets.source(id) : this.images.read(id, page);
  }
  async remove(id: string) {
    await this.store.remove(id, (book) => {
      if (book.jobs.some((j) => ['running', 'queued'].includes(j.status)))
        fail(409, 'Cancel active jobs before deleting');
    });
    await this.assets.remove(id);
  }
  get(id: string) {
    return this.store.read(id);
  }
  async list() {
    return (await this.store.list()).map((b) => ({
      id: b.id,
      title: b.title,
      revision: b.revision,
      pageCount: b.pages.length,
      updatedAt: b.updatedAt,
    }));
  }
}
