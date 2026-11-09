import type {
  CatalogQuestion,
  CatalogWorkspace,
  QuestionAddress,
  QuestionSearch,
} from '../domain/catalog.js';
import type { Book } from '../../textbooks/domain/book.js';
/** Read-only catalog use cases available to clients without exposing index/storage adapters. */
export interface CatalogQueries {
  list(principal: string): Promise<CatalogWorkspace[]>;
  authorize(principal: string, ids: string[]): Promise<void>;
  read(
    principal: string,
    scope: string[],
    id: string,
  ): Promise<{ workspace: CatalogWorkspace; book: Book }>;
  outline(
    principal: string,
    scope: string[],
    id: string,
  ): Promise<{
    workspace: CatalogWorkspace;
    revision: number;
    processedPages: number;
    questionCount: number;
    sections: Book['document']['sections'];
  }>;
  search(
    principal: string,
    scope: string[],
    query: QuestionSearch,
  ): Promise<{
    items: CatalogQuestion[];
    total: number;
    revisions: Record<string, number>;
    nextOffset: number | null;
  }>;
  question(principal: string, scope: string[], address: QuestionAddress): Promise<CatalogQuestion>;
  close(): void;
}
