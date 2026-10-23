import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Book } from '../domain/book.js';
import { Document } from '../domain/content.js';
import type { WorkspaceRepository } from '../ports/workspace.repository.js';
import { Id } from '../domain/content.js';
import { fail } from '../../../shared/errors.js';

/** A single backend process owns this volume. Atomic rename is the commit boundary. */
export class BookStore implements WorkspaceRepository {
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
  async atomic(file: string, value: unknown) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${randomUUID()}.tmp`;
    const handle = await fs.open(temporary, 'wx');
    try {
      await handle.writeFile(JSON.stringify(value));
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(temporary, file);
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
    return Document.parse(
      JSON.parse(
        await fs.readFile(path.join(this.dir(id), 'revisions', `${revision}.json`), 'utf8'),
      ),
    );
  }
  async create(book: Book) {
    await this.atomic(path.join(this.dir(book.id), 'revisions', '0.json'), book.document);
    await this.atomic(path.join(this.dir(book.id), 'state.json'), Book.parse(book));
  }
  async update(id: string, fn: (book: Book) => void, content = false): Promise<Book> {
    return this.exclusive(id, async () => {
      const book = await this.read(id);
      fn(book);
      book.updatedAt = new Date().toISOString();
      if (content) book.revision++;
      Book.parse(book);
      if (content) {
        await this.atomic(
          path.join(this.dir(id), 'revisions', `${book.revision}.json`),
          book.document,
        );
      }
      Book.parse(book);
      await this.atomic(path.join(this.dir(id), 'state.json'), book);
      return book;
    });
  }
}
