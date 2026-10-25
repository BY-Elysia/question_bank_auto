import { randomUUID } from 'node:crypto';
import type { WorkspaceRepository } from '../ports/workspace.repository.js';
import { Workspace, type ExtractionSettings } from '../domain/workspace.js';
import { partition } from '../domain/partition.js';
import type { BookRepository } from '../../textbooks/ports/book.repository.js';
import type { Book } from '../../textbooks/domain/book.js';
import type { PageImagePort } from '../../textbooks/ports/assets.port.js';
import type { TextbooksService } from '../../textbooks/application/textbooks.service.js';
import type { ExtractionRunner } from './extraction-runner.js';
import { fail, message } from '../../../shared/errors.js';
export class WorkspacesService {
  private deletions = new Set<string>();
  private runs = new Map<string, { abort: AbortController; promise: Promise<void> }>();
  constructor(
    private workspaces: WorkspaceRepository,
    private store: BookRepository,
    private books: TextbooksService,
    private images: PageImagePort,
    private runner: ExtractionRunner,
  ) {}
  async uploadPdf(buffer: Buffer, title: string) {
    return this.register(await this.books.upload(buffer, title), true);
  }
  async uploadImages(images: Buffer[], title: string) {
    return this.register(await this.books.uploadImages(images, title), false);
  }
  private async register(book: Book, prepare: boolean) {
    const workspace = Workspace.parse({
      id: book.id,
      title: book.title,
      sourceKind: book.sourceKind,
      status: prepare ? 'preparing' : 'ready',
      preparedPages: prepare ? 0 : book.pages.length,
      totalPages: book.pages.length,
      settings: null,
      runId: null,
      baseRevision: 0,
      mergedRevision: null,
      answersJobId: null,
      chapters: [],
      error: null,
      createdAt: book.createdAt,
      updatedAt: book.updatedAt,
    });
    try {
      await this.workspaces.create(workspace);
      await this.store.update(book.id, (b) => {
        b.workspaceId = book.id;
        b.workflowLock = prepare ? book.id : null;
      });
    } catch (error) {
      await this.books.remove(book.id, book.id);
      throw error;
    }
    if (prepare) this.launch(book.id, 'prepare');
    return workspace;
  }
  async extract(id: string, settings: ExtractionSettings) {
    if (this.runs.has(id)) fail(409, 'Workspace must finish image preparation before extraction');
    const workspace = await this.workspaces.read(id),
      book = await this.store.read(id);
    const groups = partition(settings, workspace.totalPages);
    await this.workspaces.update(id, (w) => {
      if (w.status !== 'ready')
        fail(409, 'Workspace must finish image preparation before extraction');
      w.status = 'extracting';
      w.title = settings.metadata.title;
      w.settings = settings;
      w.runId = randomUUID();
      w.baseRevision = book.revision;
      w.chapters = groups.map((pages, i) => ({
        id: `chapter_${i + 1}`,
        pages,
        bookId: randomUUID(),
        jobId: null,
        title: null,
        status: 'queued',
        error: null,
      }));
    });
    try {
      await this.lock(id);
      this.launch(id, 'extract');
    } catch (error) {
      await this.workspaces.update(id, (w) => {
        w.status = 'failed';
        w.error = message(error);
      });
      throw error;
    }
    return this.workspaces.read(id);
  }
  private async lock(id: string) {
    await this.store.update(id, (b) => {
      if (b.workflowLock && b.workflowLock !== id) fail(409, 'Workspace is busy');
      if (b.jobs.some((j) => ['queued', 'running'].includes(j.status)))
        fail(409, 'A textbook task is active');
      b.workflowLock = id;
    });
  }
  private launch(id: string, kind: 'prepare' | 'extract') {
    const abort = new AbortController();
    const promise = new Promise<void>((resolve) => setImmediate(resolve))
      .then(async () => {
        try {
          if (kind === 'extract') await this.runner.execute(id, abort.signal);
          else {
            const book = await this.store.read(id);
            for (const page of book.pages) {
              abort.signal.throwIfAborted();
              await this.images.ensure(id, page.number, abort.signal);
              await this.workspaces.update(id, (w) => {
                w.preparedPages = page.number;
              });
            }
            abort.signal.throwIfAborted();
            await this.workspaces.update(id, (w) => {
              w.status = 'ready';
              w.error = null;
            });
          }
        } catch (error) {
          await this.workspaces.update(id, (w) => {
            w.status = abort.signal.aborted
              ? abort.signal.reason === 'shutdown'
                ? 'interrupted'
                : 'cancelled'
              : 'failed';
            w.error = abort.signal.aborted
              ? 'Processing stopped; resume from the saved checkpoint'
              : message(error);
          });
        } finally {
          await this.store.update(id, (b) => {
            if (b.workflowLock === id) b.workflowLock = null;
          });
        }
      })
      .finally(() => this.runs.delete(id));
    this.runs.set(id, { abort, promise });
  }
  async resume(id: string) {
    const workspace = await this.workspaces.read(id),
      book = await this.store.read(id);
    if (this.runs.has(id)) fail(409, 'Workspace is already running');
    if (!['failed', 'cancelled', 'interrupted'].includes(workspace.status))
      fail(409, 'Workspace is not resumable');
    if (
      workspace.settings &&
      book.revision !==
        (book.workspaceCommit === workspace.runId
          ? workspace.baseRevision + 1
          : workspace.baseRevision)
    )
      fail(409, 'Workspace content changed; cannot resume stale extraction');
    await this.workspaces.update(id, (w) => {
      if (!['failed', 'cancelled', 'interrupted'].includes(w.status))
        fail(409, 'Workspace is already running');
      w.status = w.settings ? 'extracting' : 'preparing';
      w.error = null;
    });
    try {
      await this.lock(id);
      this.launch(id, workspace.settings ? 'extract' : 'prepare');
    } catch (error) {
      await this.workspaces.update(id, (w) => {
        w.status = 'failed';
        w.error = message(error);
      });
      throw error;
    }
    return this.workspaces.read(id);
  }
  async cancel(id: string) {
    await this.workspaces.read(id);
    const run = this.runs.get(id);
    if (run) {
      run.abort.abort('cancel');
      await run.promise;
    }
    return this.workspaces.read(id);
  }
  async remove(id: string) {
    if (this.deletions.has(id)) fail(409, 'Workspace deletion is already running');
    this.deletions.add(id);
    try {
      await this.workspaces.update(id, (w) => {
        if (['preparing', 'extracting'].includes(w.status) || this.runs.has(id))
          fail(409, 'Cancel workspace processing before deleting');
        w.status = 'deleting';
      });
      try {
        await this.lock(id);
      } catch (error) {
        if ((error as { status?: number }).status !== 404) throw error;
      }
      const owned = (await this.store.list())
        .filter((b) => b.workspaceId === id)
        .sort((a, b) => Number(a.id === id) - Number(b.id === id));
      for (const book of owned) await this.books.remove(book.id, id);
      await this.workspaces.remove(id);
    } finally {
      this.deletions.delete(id);
    }
  }
  async recover() {
    for (const workspace of await this.workspaces.list()) {
      if (workspace.status === 'deleting') {
        await this.remove(workspace.id);
        continue;
      }
      if (['preparing', 'extracting'].includes(workspace.status)) {
        await this.workspaces.update(workspace.id, (w) => {
          w.status = 'interrupted';
          w.error = 'Process restarted; resume the workspace';
        });
      }
      // A crash can occur after the terminal status was persisted, before unlocking.
      await this.store.update(workspace.id, (b) => {
        if (b.workflowLock === workspace.id) b.workflowLock = null;
      });
    }
  }
  async wait(id: string) {
    await this.runs.get(id)?.promise;
  }
  async shutdown() {
    for (const run of this.runs.values()) run.abort.abort('shutdown');
    await Promise.allSettled([...this.runs.values()].map((r) => r.promise));
  }
  get(id: string) {
    return this.workspaces.read(id);
  }
  async list() {
    return (await this.workspaces.list()).map(
      ({ id, title, sourceKind, status, preparedPages, totalPages, updatedAt }) => ({
        id,
        title,
        sourceKind,
        status,
        preparedPages,
        totalPages,
        updatedAt,
      }),
    );
  }
}
