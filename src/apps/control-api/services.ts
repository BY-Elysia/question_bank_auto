import { RubricWorkflow } from '../../modules/review/application/rubric-workflow.js';
import { ExportPreparation } from '../../modules/textbooks/application/export-preparation.js';
import { PageSourceImageReader } from '../../modules/assistant/infrastructure/knowledge/source-image-reader.js';
import { QuestionOperationService } from '../../modules/review/application/question-operation-service.js';
import { ReviewActions } from '../../modules/assistant/application/actions/review-actions.js';
import { ReviewTools } from '../../modules/assistant/application/tools/review-tools.js';
import { ChangeService } from '../../modules/review/application/change-service.js';
import { SqliteQuestionIndex } from '../../modules/catalog/infrastructure/sqlite-index.js';
import {
  WorkspaceCatalogReader,
  SingleAccountCatalogAccess,
} from '../../modules/catalog/infrastructure/workspace-reader.js';
import { CatalogQuery } from '../../modules/catalog/application/catalog-query.js';
import type { AccessPolicy } from '../../modules/catalog/ports/catalog.js';
import { SqliteKnowledge } from '../../modules/assistant/infrastructure/knowledge/sqlite-knowledge.js';
import { KnowledgeService } from '../../modules/assistant/application/knowledge/knowledge-service.js';
import { CatalogTools } from '../../modules/assistant/application/tools/catalog-tools.js';
import { InteractionTools } from '../../modules/assistant/application/tools/interaction-tools.js';
import type { AssistantToolRegistry } from '../../modules/assistant/ports/tools.js';
import { ModelConfiguration } from '../../modules/profile/application/model-configuration.js';
import type { SettingsRepository } from '../../modules/profile/ports/settings.repository.js';
import type { UsageRepository } from '../../modules/profile/ports/usage.repository.js';
import type { HarnessStore } from '../../modules/assistant/ports/harness-store.js';
import type { AssistantContextPort } from '../../modules/assistant/ports/context.js';
import { QuestionInsertion } from '../../modules/questions/application/question-insertion.js';
import { FileSettings } from '../../modules/profile/infrastructure/file-settings.js';
import { FileUsage } from '../../modules/profile/infrastructure/file-usage.js';
import { ProfileService } from '../../modules/profile/application/profile.service.js';
import { HarnessService } from '../../modules/assistant/application/harness/service.js';
import { SqliteHarness } from '../../modules/assistant/infrastructure/sqlite-harness.js';
import { PiRuntime } from '../../modules/assistant/infrastructure/runtime/pi-runtime.js';
import { CompleteRuntime } from '../../modules/assistant/infrastructure/runtime/complete-runtime.js';
import type { AgentRuntime } from '../../modules/assistant/ports/runtime.js';
import { EmptyAssistantContext } from '../../modules/assistant/ports/context.js';
import type { AccessConfig } from '../../shared/auth/gate.js';
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
  catalogAccess?: AccessPolicy;
  assistantSettings?: SettingsRepository;
  assistantModel?: ModelClient;
  assistantRuntime?: AgentRuntime;
  assistantTools?: AssistantToolRegistry;
  settings?: SettingsRepository;
  usage?: UsageRepository;
  harnessStore?: HarnessStore;
  assistantContext?: AssistantContextPort;
  access?: AccessConfig;
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
  const settings = options.settings ?? new FileSettings(root);
  const catalog = options.catalog ?? new FileSkillCatalog();
  const records = options.records ?? new FileRunRecords(root);
  const model =
    options.model ??
    new HttpModelClient(options.prefixCache ?? new FilePrefixCache(root), settings);
  const profile = new ProfileService(
    settings,
    options.usage ?? new FileUsage(root),
    store,
    (value) => new HttpModelClient(undefined, { get: async () => value }),
  );
  const assistantSettings = options.assistantSettings ?? new FileSettings(root, 'assistant');
  const assistantConfiguration = new ModelConfiguration(
    assistantSettings,
    (value) => new HttpModelClient(undefined, { get: async () => value }),
  );
  const workspaceStore = options.workspaceStore ?? new WorkspaceStore(root);
  await workspaceStore.init();
  const harnessStore = options.harnessStore ?? (await SqliteHarness.open(root));
  const principal = options.access?.username ?? process.env.ACCESS_USERNAME ?? 'local-account';
  const catalogAccess =
    options.catalogAccess ?? new SingleAccountCatalogAccess(principal, workspaceStore);
  const workspaceAccess = {
    authorize: (id: string) => catalogAccess.assertWorkspace(principal, id),
  };
  const catalogQuery = new CatalogQuery(
    new WorkspaceCatalogReader(workspaceStore, store),
    await SqliteQuestionIndex.open(root),
    catalogAccess,
  );
  const knowledge = new KnowledgeService(
    principal,
    await SqliteKnowledge.open(root),
    harnessStore,
    catalogQuery,
    catalog,
    assets.images,
    new PageSourceImageReader(assets.images),
  );
  const skills = options.skills ?? new SkillRunner(store, model, assets.images, catalog, records);
  const books = new TextbooksService(store, assets.files, assets.images);
  const review = new ReviewService(store, principal),
    exports = new ExportService(store, assets.images, assets.archives);
  const parser = new TextbookWorkflow(store, skills),
    reviewWorkflow = new ReviewWorkflow(store, skills);
  const insertion = new QuestionInsertion(store, books, assets.files, skills);
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
    ['insert', insertion],
    ['rubrics', new RubricWorkflow(store, skills)],
  ]);
  const jobs = new JobsService(store, options.handlers ?? defaults);
  await jobs.recover();
  const changes = new ChangeService(store);
  const reviewActions = new ReviewActions(
    knowledge,
    new QuestionOperationService(jobs, store, review, changes),
  );
  const assistantTools =
    options.assistantTools ??
    new ReviewTools(new CatalogTools(knowledge, new InteractionTools()), reviewActions, knowledge);
  const injectedModel = options.assistantModel ?? options.model;
  const runtime =
    options.assistantRuntime ??
    (injectedModel
      ? new CompleteRuntime(injectedModel)
      : new PiRuntime(assistantSettings, assistantTools));
  const assistant = new HarnessService(
    harnessStore,
    runtime,
    catalog,
    records,
    options.assistantContext ?? new EmptyAssistantContext(),
    knowledge,
    reviewActions,
  );
  await assistant.recover();
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
  return {
    store,
    books,
    review,
    exports,
    exportPreparation: new ExportPreparation(store),
    jobs,
    skills,
    workspaces,
    workspaceView,
    profile,
    assistant,
    assistantConfiguration,
    knowledge,
    insertion,
    changes,
    reviewActions,
    workspaceAccess,
  };
}
