import { randomUUID } from 'node:crypto';
import type { BookRepository } from '../ports/book.repository.js';
import type { PageImagePort } from '../ports/assets.port.js';
import type { TextbookAssets } from '../ports/assets.port.js';
import { emptyDocument } from '../domain/book.js';
import { Book } from '../domain/book.js';
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
      const book = Book.parse({
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
      });
      await this.store.create(book);
      return book;
    } catch (error) {
      await this.assets.remove(id);
      throw error;
    }
  }
  async uploadImages(images: Buffer[], title: string) {
    if (
      !images.length ||
      images.length > 500 ||
      images.reduce((sum, b) => sum + b.length, 0) > 100 * 1024 * 1024
    )
      fail(400, 'Upload 1–500 images with total size at most 100 MB');
    const id = randomUUID();
    try {
      const pages = await this.assets.prepareImages(id, images);
      return await this.createImageBook(id, title, pages);
    } catch (error) {
      await this.assets.remove(id);
      throw error;
    }
  }
  async copyPages(id: string, sourceId: string, numbers: number[], title: string) {
    const source = await this.store.read(sourceId);
    if (!numbers.length || numbers.some((n) => !source.pages.some((p) => p.number === n)))
      fail(400, 'Unknown source page');
    for (const number of numbers) await this.images.ensure(sourceId, number);
    try {
      return await this.createImageBook(
        id,
        title,
        await this.assets.copyPages(id, sourceId, numbers),
      );
    } catch (error) {
      await this.assets.remove(id);
      throw error;
    }
  }
  private async createImageBook(id: string, title: string, pages: Book['pages']) {
    const now = new Date().toISOString();
    const book = Book.parse({
      schemaVersion: '1.0',
      id,
      title,
      sourceKind: 'images',
      revision: 0,
      createdAt: now,
      updatedAt: now,
      pages,
      document: emptyDocument(),
      jobs: [],
      proposals: [],
    });
    await this.store.create(book);
    return book;
  }
  async asset(id: string, page?: number) {
    const book = await this.store.read(id);
    if (page === undefined && book.sourceKind === 'images')
      fail(404, 'This textbook was uploaded as images');
    if (page !== undefined && !book.pages.some((p) => p.number === page))
      fail(404, 'Page not found');
    return page === undefined ? this.assets.source(id) : this.images.read(id, page);
  }
  async remove(id: string, owner?: string) {
    await this.store.remove(id, (book) => {
      if (book.workspaceId && book.workspaceId !== owner)
        fail(409, 'Delete the workspace to remove its assets');
      if (book.workflowLock && book.workflowLock !== owner)
        fail(409, 'Workspace is managing this textbook');
      if (book.jobs.some((j) => ['running', 'queued'].includes(j.status)))
        fail(409, 'Cancel active jobs before deleting');
    });
    await this.assets.remove(id);
  }
  get(id: string) {
    return this.store.read(id);
  }
  async list() {
    return (await this.store.list())
      .filter((b) => !b.workspaceId)
      .map((b) => ({
        id: b.id,
        title: b.title,
        revision: b.revision,
        pageCount: b.pages.length,
        updatedAt: b.updatedAt,
      }));
  }
}
