import { projectChapter } from './merge-chapters.js';
import type { WorkspaceRepository } from '../ports/workspace.repository.js';
import type { BookRepository } from '../../textbooks/ports/book.repository.js';
export class WorkspaceView {
  constructor(
    private workspaces: WorkspaceRepository,
    private books: BookRepository,
  ) {}
  async get(id: string) {
    const workspace = await this.workspaces.read(id),
      book = await this.books.read(id);
    const active =
        Boolean(book.workflowLock) ||
        ['preparing', 'extracting', 'deleting'].includes(workspace.status),
      resumable = ['failed', 'interrupted', 'cancelled'].includes(workspace.status);
    const chapters = await Promise.all(
      workspace.chapters.map(async (chapter) => {
        let child;
        try {
          child = await this.books.read(chapter.bookId);
        } catch (error) {
          if ((error as { status?: number }).status !== 404) throw error;
        }
        const job = child?.jobs.find((j) => j.id === chapter.jobId);
        const preview = job?.stage ?? child?.document;
        return {
          ...chapter,
          cursor: job?.cursor ?? 1,
          processedPages:
            job?.stage?.processedPages.length ?? child?.document.processedPages.length ?? 0,
          preview: preview ? projectChapter(chapter, preview) : null,
          imageUrls: chapter.pages.map((n) => `/api/textbooks/${id}/pages/${n}/image`),
        };
      }),
    );
    return {
      workspace,
      pages: book.pages.map((p) => ({
        ...p,
        imageUrl: `/api/textbooks/${id}/pages/${p.number}/image`,
      })),
      revision: book.revision,
      document: book.document,
      proposals: book.proposals,
      jobs: book.jobs.map(({ stage, ...job }) => job),
      chapters,
      sourceUrl: book.sourceKind === 'pdf' ? `/api/textbooks/${id}/source` : null,
      exportJsonUrl: `/api/textbooks/${id}/export.json`,
      exportZipUrl: `/api/textbooks/${id}/export.zip`,
      nextStep:
        workspace.status === 'deleting'
          ? 'deleting'
          : workspace.status === 'preparing'
            ? 'preparing'
            : workspace.status === 'ready'
              ? 'configure_extraction'
              : workspace.status === 'extracting'
                ? 'extracting'
                : resumable
                  ? 'retry'
                  : 'review',
      actions: {
        delete: !active,
        configure: workspace.status === 'ready' && !active,
        cancel: ['preparing', 'extracting'].includes(workspace.status),
        resume: resumable,
        review: !active && book.revision > 0,
        export: !active && book.revision > 0,
      },
    };
  }
}
