import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { WorkspaceRepository } from '../ports/workspace.repository.js';
import type { PageImagePort } from '../ports/workspace.repository.js';
import type { PdfPort } from '../ports/workspace.repository.js';
import { emptyDocument } from '../domain/book.js';
import { fail } from '../../../shared/errors.js';
export class TextbooksService {
  constructor(
    readonly store: WorkspaceRepository,
    private pdf: PdfPort,
    private images: PageImagePort,
  ) {}
  async upload(buffer: Buffer, title: string) {
    if (!buffer.length || !buffer.subarray(0, 1024).includes(Buffer.from('%PDF-')))
      fail(400, 'A PDF body is required');
    const id = randomUUID(),
      dir = this.store.dir(id);
    await fs.mkdir(dir, { recursive: true });
    try {
      await fs.writeFile(path.join(dir, 'source.pdf'), buffer);
      const pages = await this.pdf.inspect(path.join(dir, 'source.pdf'));
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
      await fs.rm(dir, { recursive: true, force: true });
      throw error;
    }
  }
  async asset(id: string, page?: number) {
    const book = await this.store.read(id);
    if (page !== undefined && !book.pages.some((p) => p.number === page))
      fail(404, 'Page not found');
    return page === undefined
      ? path.join(this.store.dir(id), 'source.pdf')
      : this.images.ensure(id, page);
  }
  async remove(id: string) {
    await this.store.exclusive(id, async () => {
      const book = await this.store.read(id);
      if (book.jobs.some((j) => j.status === 'running' || j.status === 'queued'))
        fail(409, 'Cancel active jobs before deleting');
      await fs.rm(this.store.dir(id), { recursive: true });
    });
  }
}
