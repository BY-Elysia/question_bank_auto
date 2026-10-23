import type { Book } from '../domain/book.js';
import type { Document } from '../domain/content.js';
/** One process owns a workspace. update is serialized and atomically commits a snapshot. */
export interface WorkspaceRepository {
  readonly root: string;
  dir(id: string): string;
  list(): Promise<Book[]>;
  read(id: string): Promise<Book>;
  create(book: Book): Promise<void>;
  update(id: string, mutate: (book: Book) => void, content?: boolean): Promise<Book>;
  exclusive<T>(id: string, work: () => Promise<T>): Promise<T>;
  atomic(file: string, value: unknown): Promise<void>;
  readRevision(id: string, revision: number): Promise<Document>;
}
export interface PdfPort {
  inspect(pdf: string): Promise<Book['pages']>;
  page(
    pdf: string,
    directory: string,
    number: number,
    signal?: AbortSignal,
  ): Promise<{ width: number; height: number }>;
}
export interface PageImagePort {
  ensure(id: string, page: number, signal?: AbortSignal): Promise<string>;
}
