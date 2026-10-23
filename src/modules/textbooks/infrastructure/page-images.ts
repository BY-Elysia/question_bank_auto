import fs from 'node:fs/promises';
import path from 'node:path';
import { BookStore } from './book-store.js';
import { PdfRenderer } from './pdf-renderer.js';
import { fail } from '../../../shared/errors.js';
export class PageImages {
  private running = new Map<string, Promise<string>>();
  constructor(
    private store: BookStore,
    private pdf: PdfRenderer,
  ) {}
  async ensure(id: string, number: number, signal?: AbortSignal): Promise<string> {
    const key = `${id}:${number}`;
    const existing = this.running.get(key);
    if (existing) return existing;
    const run = this.render(id, number, signal);
    this.running.set(key, run);
    try {
      return await run;
    } finally {
      this.running.delete(key);
    }
  }
  private async render(id: string, number: number, signal?: AbortSignal) {
    const book = await this.store.read(id),
      page = book.pages.find((p) => p.number === number);
    if (!page) fail(404, 'Page not found');
    const directory = path.join(this.store.dir(id), 'pages'),
      file = path.join(directory, `${number}.png`);
    if (page.width && page.height) {
      try {
        await fs.access(file);
        return file;
      } catch {}
    }
    const dimensions = await this.pdf.page(
      path.join(this.store.dir(id), 'source.pdf'),
      directory,
      number,
      signal,
    );
    await this.store.update(id, (current) => {
      const p = current.pages.find((p) => p.number === number)!;
      Object.assign(p, dimensions);
      if (p.status === 'uploaded') p.status = 'ready';
    });
    return file;
  }
}
