import fs from 'node:fs/promises';
import path from 'node:path';
import type { BookRepository } from '../ports/book.repository.js';
import type { PdfPort, PageImagePort, PageImageVariant } from '../ports/assets.port.js';
import { PageImageVariants } from './page-image-variants.js';
import { FileAssets } from './file-assets.js';
import { createReadStream } from 'node:fs';
import { fail } from '../../../shared/errors.js';
interface PendingRender {
  promise: Promise<string>;
  controller: AbortController;
  waiters: Set<object>;
}

function raceAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

export class PageImages implements PageImagePort {
  private running = new Map<string, PendingRender>();
  private variants = new PageImageVariants();
  constructor(
    private store: BookRepository,
    private pdf: PdfPort,
    private assets: FileAssets,
  ) {}
  private async file(id: string, number: number, signal?: AbortSignal): Promise<string> {
    signal?.throwIfAborted();
    const key = `${id}:${number}`;
    let entry = this.running.get(key);
    if (!entry) {
      const controller = new AbortController();
      const waiters = new Set<object>();
      const promise = this.render(id, number, controller.signal).finally(() => {
        if (this.running.get(key) === entry) this.running.delete(key);
      });
      entry = { promise, controller, waiters };
      this.running.set(key, entry);
    }
    const waiter = {};
    entry.waiters.add(waiter);
    const onAbort = () => {
      entry!.waiters.delete(waiter);
      if (!entry!.waiters.size) entry!.controller.abort(signal?.reason);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      return await raceAbort(entry.promise, signal);
    } finally {
      signal?.removeEventListener('abort', onAbort);
      entry.waiters.delete(waiter);
    }
  }
  async ensure(id: string, page: number, signal?: AbortSignal) {
    await this.file(id, page, signal);
  }
  async read(
    id: string,
    page: number,
    signal?: AbortSignal,
    variant: PageImageVariant = 'original',
  ) {
    const file = await this.variants.file(await this.file(id, page, signal), variant);
    const stat = await fs.stat(file);
    return {
      body: createReadStream(file),
      contentType: variant === 'original' ? 'image/png' : 'image/webp',
      filename: `${page}.${variant === 'original' ? 'png' : 'webp'}`,
      etag: `W/"${variant}-${stat.size}-${stat.mtimeMs}"`,
      size: stat.size,
    };
  }
  async dataUrl(id: string, page: number, signal?: AbortSignal) {
    const file = await this.file(id, page, signal);
    return `data:image/png;base64,${(await fs.readFile(file, signal ? { signal } : undefined)).toString('base64')}`;
  }
  private async render(id: string, number: number, signal?: AbortSignal) {
    const book = await this.store.read(id),
      page = book.pages.find((p) => p.number === number);
    if (!page) fail(404, 'Page not found');
    const directory = path.join(this.assets.dir(id), 'pages'),
      file = path.join(directory, `${number}.png`);
    if (page.width && page.height) {
      try {
        await fs.access(file);
        return file;
      } catch {}
    }
    if (book.sourceKind === 'images') fail(404, 'Uploaded page image is missing');
    const dimensions = await this.pdf.page(
      path.join(this.assets.dir(id), 'source.pdf'),
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
