import { WorkspaceStore } from '../../modules/workspaces/infrastructure/workspace-store.js';
import type { WorkspaceRepository } from '../../modules/workspaces/ports/workspace.repository.js';
import { WorkspacesService } from '../../modules/workspaces/application/workspaces.service.js';
import { ExtractionRunner } from '../../modules/workspaces/application/extraction-runner.js';
import { WorkspaceView } from '../../modules/workspaces/application/workspace-view.js';
import { FilePrefixCache } from '../../ai/infrastructure/file-prefix-cache.js';
import type { PrefixCache } from '../../ai/ports/prefix-cache.js';
import path from 'node:path';
import type { BookRepository } from '../../modules/textbooks/ports/book.repository.js';
import type {
  TextbookAssets,
  PageImagePort,
  ArchivePort,
  PdfPort,
} from '../../modules/textbooks/ports/assets.port.js';
import type { ModelClient } from '../../ai/ports/model-client.js';
import type { Skills } from '../../ai/ports/skills.js';
import type { SkillCatalog, RunRecords } from '../../ai/ports/skill-catalog.js';
import type { JobHandlers, JobHandler } from '../../modules/jobs/ports/job-handler.js';
import { BookStore } from '../../modules/textbooks/infrastructure/book-store.js';
import { FileAssets } from '../../modules/textbooks/infrastructure/file-assets.js';
import { FileArchive } from '../../modules/textbooks/infrastructure/zip-archive.js';
import { PdfRenderer } from '../../modules/textbooks/infrastructure/pdf-renderer.js';
import { PageImages } from '../../modules/textbooks/infrastructure/page-images.js';
import { FileSkillCatalog } from '../../ai/infrastructure/file-skill-catalog.js';
import { FileRunRecords } from '../../ai/infrastructure/file-run-records.js';
import { SkillRunner } from '../../ai/runtime/skill-runner.js';
import { HttpModelClient } from '../../ai/providers/model-client.js';
import { TextbooksService } from '../../modules/textbooks/application/textbooks.service.js';
import { ExportService } from '../../modules/textbooks/application/export.service.js';
import { ReviewService } from '../../modules/review/application/review.service.js';
import { JobsService } from '../../modules/jobs/application/jobs.service.js';
import { TextbookWorkflow } from '../../ai/workflows/textbook-extraction/workflow.js';
import { ReviewWorkflow } from '../../modules/review/application/review-workflow.js';
export interface AppOptions {
  root?: string;
  workspaceStore?: WorkspaceRepository;
  prefixCache?: PrefixCache;
  store?: BookRepository;
  skills?: Skills;
  model?: ModelClient;
  pdf?: PdfPort;
  assets?: { files: TextbookAssets; images: PageImagePort; archives: ArchivePort };
  catalog?: SkillCatalog;
  records?: RunRecords;
  handlers?: JobHandlers;
}
/** Composition root: all concrete adapters are selected here, not in business use cases. */
export async function createServices(options: AppOptions = {}) {
  const root = path.resolve(options.root ?? process.env.WORKSPACE_ROOT ?? './workspace');
  const store = options.store ?? new BookStore(root);
  await store.init();
  const pdf = options.pdf ?? new PdfRenderer();
  const localFiles = new FileAssets(root, pdf);
  const assets = options.assets ?? {
    files: localFiles,
    images: new PageImages(store, pdf, localFiles),
    archives: new FileArchive(localFiles),
  };
  const skills =
    options.skills ??
    new SkillRunner(
      store,
      options.model ?? new HttpModelClient(options.prefixCache ?? new FilePrefixCache(root)),
      assets.images,
      options.catalog ?? new FileSkillCatalog(),
      options.records ?? new FileRunRecords(root),
    );
  const books = new TextbooksService(store, assets.files, assets.images);
  const review = new ReviewService(store),
    exports = new ExportService(store, assets.images, assets.archives);
  const parser = new TextbookWorkflow(store, skills),
    reviewWorkflow = new ReviewWorkflow(store, skills);
  const defaults: JobHandlers = new Map<Parameters<JobHandlers['get']>[0], JobHandler>([
    [
      'parse',
      {
        execute: async (context) => {
          await parser.execute(context);
          await reviewWorkflow.execute(context);
        },
      },
    ],
    ['verify', reviewWorkflow],
    ['repair', reviewWorkflow],
    ['answers', reviewWorkflow],
  ]);
  const jobs = new JobsService(store, options.handlers ?? defaults);
  await jobs.recover();
  const workspaceStore = options.workspaceStore ?? new WorkspaceStore(root);
  await workspaceStore.init();
  const workspaceRunner = new ExtractionRunner(workspaceStore, store, books, jobs);
  const workspaces = new WorkspacesService(
    workspaceStore,
    store,
    books,
    assets.images,
    workspaceRunner,
  );
  const workspaceView = new WorkspaceView(workspaceStore, store);
  await workspaces.recover();
  return { store, books, review, exports, jobs, skills, workspaces, workspaceView };
}
