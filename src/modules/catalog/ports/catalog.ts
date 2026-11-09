import type { CatalogQuestion, CatalogWorkspace, QuestionSearch } from '../domain/catalog.js';
import type { Book } from '../../textbooks/domain/book.js';
export interface CatalogReader {
  list(): Promise<CatalogWorkspace[]>;
  read(workspaceId: string): Promise<{ workspace: CatalogWorkspace; book: Book }>;
}
export interface QuestionIndex {
  sync(workspaceId: string, version: string, questions: CatalogQuestion[]): void;
  search(
    workspaceIds: string[],
    query: QuestionSearch,
  ): { items: CatalogQuestion[]; total: number };
  close(): void;
}
export interface AccessPolicy {
  assertWorkspace(principalId: string, workspaceId: string): Promise<void>;
}
