import type { Book } from '../domain/book.js';
import type { Document } from '../domain/content.js';
/** create rejects duplicates/nonzero revisions; update/remove serialize per book and roll back on failure. */
export interface BookRepository {
  init(): Promise<void>;
  list(): Promise<Book[]>;
  read(id: string): Promise<Book>;
  create(book: Book): Promise<void>;
  update(id: string, mutate: (book: Book) => void, content?: boolean): Promise<Book>;
  remove(id: string, check: (book: Book) => void): Promise<void>;
  readRevision(id: string, revision: number): Promise<Document>;
}
