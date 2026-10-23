import path from 'node:path';
import { ZipArchive } from 'archiver';
import type { Response } from 'express';
import type { PageImagePort } from '../ports/workspace.repository.js';
import type { WorkspaceRepository } from '../ports/workspace.repository.js';
import { validateDocument } from '../domain/validation.js';
export class ExportService {
  constructor(
    private store: WorkspaceRepository,
    private images: PageImagePort,
  ) {}
  async json(id: string) {
    const book = await this.store.read(id);
    return {
      schemaVersion: book.schemaVersion,
      id: book.id,
      title: book.title,
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
  async zip(id: string, response: Response) {
    const book = await this.store.read(id);
    for (const page of book.pages) await this.images.ensure(id, page.number);
    const document = await this.json(id);
    response.setHeader('Content-Type', 'application/zip');
    response.setHeader('Content-Disposition', `attachment; filename="${id}.zip"`);
    const zip = new ZipArchive({ zlib: { level: 5 } });
    zip.on('error', (error) => response.destroy(error));
    response.on('close', () => {
      if (!response.writableFinished) zip.abort();
    });
    zip.pipe(response);
    zip.append(JSON.stringify(document, null, 2), { name: 'textbook.json' });
    zip.file(path.join(this.store.dir(id), 'source.pdf'), { name: 'source.pdf' });
    for (const page of document.pages)
      zip.file(path.join(this.store.dir(id), page.image), { name: page.image });
    await zip.finalize();
  }
}
