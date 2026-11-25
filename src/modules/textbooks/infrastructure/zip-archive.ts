import path from 'node:path';
import { ZipArchive } from 'archiver';
import type { ArchivePort } from '../ports/assets.port.js';
import { FileAssets } from './file-assets.js';
export class FileArchive implements ArchivePort {
  constructor(private assets: FileAssets) {}
  async create(id: string, document: unknown, pages: number[]) {
    const zip = new ZipArchive({ zlib: { level: 5 } });
    zip.append(JSON.stringify(document, null, 2), { name: 'textbook.json' });
    if (await this.assets.hasPdf(id))
      zip.file(path.join(this.assets.dir(id), 'source.pdf'), { name: 'source.pdf' });
    for (const page of pages)
      zip.file(path.join(this.assets.dir(id), 'pages', `${page}.png`), {
        name: `pages/${page}.png`,
      });
    let closed = false;
    zip.once('close', () => {
      closed = true;
      if (!zip.readableEnded) zip.abort();
    });
    zip.on('warning', (error) => {
      zip.destroy(error);
    });
    // Defer finalize until the caller attaches stream/error listeners to the returned readable.
    setImmediate(() => {
      if (closed || zip.destroyed) return;
      void zip.finalize().catch((error) => zip.destroy(error));
    });
    return { body: zip, contentType: 'application/zip', filename: `${id}.zip` };
  }
}
