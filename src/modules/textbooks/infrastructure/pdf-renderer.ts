import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fail } from '../../../shared/errors.js';
const exec = promisify(execFile);
export class PdfRenderer {
  async inspect(pdf: string) {
    let stdout: string;
    try {
      ({ stdout } = await exec(process.env.PDFINFO_BIN ?? 'pdfinfo', [pdf], { timeout: 30000 }));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw error;
      fail(422, 'PDF cannot be read; check for corruption or encryption');
    }
    const count = Number(stdout.match(/^Pages:\s+(\d+)/m)?.[1]);
    if (!Number.isInteger(count) || count < 1 || count > Number(process.env.MAX_PDF_PAGES ?? 2000))
      fail(422, 'Invalid or excessive PDF page count');
    return Array.from({ length: count }, (_, index) => ({
      number: index + 1,
      width: null,
      height: null,
      status: 'uploaded' as const,
      blank: false,
    }));
  }
  async page(pdf: string, directory: string, number: number, signal?: AbortSignal) {
    await fs.mkdir(directory, { recursive: true });
    const prefix = path.join(directory, `${number}-${randomUUID()}`);
    try {
      await exec(
        process.env.PDFTOPPM_BIN ?? 'pdftoppm',
        [
          '-f',
          String(number),
          '-l',
          String(number),
          '-scale-to',
          '1800',
          '-singlefile',
          '-png',
          pdf,
          prefix,
        ],
        { timeout: 90000, maxBuffer: 1024 * 1024, signal },
      );
      const png = await fs.readFile(`${prefix}.png`);
      if (png.toString('hex', 0, 8) !== '89504e470d0a1a0a')
        throw new Error('Renderer did not produce PNG');
      await fs.rename(`${prefix}.png`, path.join(directory, `${number}.png`));
      return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
    } finally {
      await fs.rm(`${prefix}.png`, { force: true });
    }
  }
}
