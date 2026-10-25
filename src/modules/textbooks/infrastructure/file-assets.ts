import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import type { TextbookAssets, PdfPort } from '../ports/assets.port.js';
import { Id } from '../domain/content.js';
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
  async source(id: string) {
    const file = path.join(this.dir(id), 'source.pdf');
    await fs.access(file);
    return { body: createReadStream(file), contentType: 'application/pdf', filename: 'source.pdf' };
  }
  async remove(id: string) {
    await fs.rm(this.dir(id), { recursive: true, force: true });
  }
}
