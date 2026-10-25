import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import type { TextbookAssets, PdfPort } from '../ports/assets.port.js';
import { Id } from '../domain/content.js';
import { normalizeImage } from './image-normalizer.js';
import { fail } from '../../../shared/errors.js';
export class FileAssets implements TextbookAssets {
  constructor(
    private root: string,
    private pdf: PdfPort,
  ) {}
  dir(id: string) {
    if (!Id.safeParse(id).success) fail(400, 'Invalid ID');
    return path.join(this.root, 'books', id);
  }
  async prepare(id: string, buffer: Buffer) {
    const dir = this.dir(id);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'source.pdf'), buffer);
    return this.pdf.inspect(path.join(dir, 'source.pdf'));
  }
  async prepareImages(id: string, images: Buffer[]) {
    const directory = path.join(this.dir(id), 'pages');
    await fs.mkdir(directory, { recursive: true });
    const pages = [];
    for (const [index, input] of images.entries()) {
      const { data, width, height } = await normalizeImage(input);
      await fs.writeFile(path.join(directory, `${index + 1}.png`), data);
      pages.push({ number: index + 1, width, height, status: 'ready' as const, blank: false });
    }
    return pages;
  }
  async copyPages(id: string, sourceId: string, numbers: number[]) {
    const directory = path.join(this.dir(id), 'pages');
    await fs.mkdir(directory, { recursive: true });
    const pages = [];
    for (const [index, number] of numbers.entries()) {
      const source = path.join(this.dir(sourceId), 'pages', `${number}.png`);
      await fs.copyFile(source, path.join(directory, `${index + 1}.png`));
      const image = await fs.readFile(source);
      pages.push({
        number: index + 1,
        width: image.readUInt32BE(16),
        height: image.readUInt32BE(20),
        status: 'ready' as const,
        blank: false,
      });
    }
    return pages;
  }
  async hasPdf(id: string) {
    try {
      await fs.access(path.join(this.dir(id), 'source.pdf'));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  }
  async source(id: string) {
    const file = path.join(this.dir(id), 'source.pdf');
    await fs.access(file);
    return { body: createReadStream(file), contentType: 'application/pdf', filename: 'source.pdf' };
  }
  async remove(id: string) {
    await fs.rm(this.dir(id), { recursive: true, force: true });
  }
}
