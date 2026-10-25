import fs from 'node:fs/promises';
import path from 'node:path';
import { atomicJson } from '../../../shared/infrastructure/atomic-json.js';
import { Book } from '../domain/book.js';
import { Document } from '../domain/content.js';
import type { BookRepository } from '../ports/book.repository.js';
import { Id } from '../domain/content.js';
import { fail } from '../../../shared/errors.js';

/** A single backend process owns this volume. Atomic rename is the commit boundary. */
export class BookStore implements BookRepository {
  private locks = new Map<string, Promise<unknown>>();
  readonly root: string;
  constructor(root: string) {
    this.root = path.resolve(root);
  }
  dir(id: string) {
    if (!Id.safeParse(id).success) fail(400, 'Invalid ID');
    return path.join(this.root, 'books', id);
  }
  async init() {
    await fs.mkdir(path.join(this.root, 'books'), { recursive: true });
  }
  async list(): Promise<Book[]> {
    const entries = await fs.readdir(path.join(this.root, 'books'), { withFileTypes: true });
    const books: Book[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      try {
        books.push(await this.read(entry.name));
      } catch (error) {
        // Interrupted uploads have no state; corrupted committed state must remain visible as an error.
        if ((error as { status?: number }).status !== 404) throw error;
      }
    }
    return books;
  }
  async read(id: string): Promise<Book> {
    try {
      return Book.parse(
        JSON.parse(await fs.readFile(path.join(this.dir(id), 'state.json'), 'utf8')),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') fail(404, 'Textbook not found');
      throw error;
    }
  }
  async exclusive<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(id) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(fn);
    this.locks.set(id, next);
    try {
      return await next;
    } finally {
      if (this.locks.get(id) === next) this.locks.delete(id);
    }
  }
  async readRevision(id: string, revision: number) {
    const current = await this.read(id);
    if (!Number.isInteger(revision) || revision < 0 || revision > current.revision)
      fail(404, 'Revision not found');
    return Document.parse(
      JSON.parse(
        await fs.readFile(path.join(this.dir(id), 'revisions', `${revision}.json`), 'utf8'),
      ),
    );
  }
  async remove(id: string, check: (book: Book) => void) {
    await this.exclusive(id, async () => {
      const book = await this.read(id);
      check(book);
      await fs.rm(path.join(this.dir(id), 'state.json'));
    });
  }
  async create(book: Book) {
    const validated = Book.parse(book);
    if (validated.revision !== 0) fail(400, 'A new textbook must start at revision zero');
    await this.exclusive(validated.id, async () => {
      try {
        await this.read(validated.id);
        fail(409, 'Textbook already exists');
      } catch (error) {
        if ((error as { status?: number }).status !== 404) throw error;
      }
      await atomicJson(
        path.join(this.dir(validated.id), 'revisions', '0.json'),
        validated.document,
      );
      await atomicJson(path.join(this.dir(validated.id), 'state.json'), validated);
    });
  }
  async update(id: string, fn: (book: Book) => void, content = false): Promise<Book> {
    return this.exclusive(id, async () => {
      const book = await this.read(id);
      fn(book);
      book.updatedAt = new Date().toISOString();
      if (content) book.revision++;
      Book.parse(book);
      if (content) {
        await atomicJson(
          path.join(this.dir(id), 'revisions', `${book.revision}.json`),
          book.document,
        );
      }
      await atomicJson(path.join(this.dir(id), 'state.json'), book);
      return book;
    });
  }
}
