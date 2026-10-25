// Test adapter: exercises the production repository contract against an actual SQL database.
// JSON columns demonstrate transactional substitution; this is not a production migration design.
import { DatabaseSync } from 'node:sqlite';
import { Book } from '../../dist/app/modules/textbooks/domain/book.js';
import { fail } from '../../dist/app/shared/errors.js';
export class SqliteRepository {
  constructor(file = ':memory:') {
    this.db = new DatabaseSync(file);
  }
  async init() {
    this.db.exec(
      'CREATE TABLE IF NOT EXISTS books (id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS revisions (book_id TEXT, revision INTEGER, data TEXT NOT NULL, PRIMARY KEY(book_id, revision));',
    );
  }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  async list() {
    return this.db
      .prepare('SELECT data FROM books')
      .all()
      .map((row) => Book.parse(JSON.parse(row.data)));
  }
  load(id) {
    const row = this.db.prepare('SELECT data FROM books WHERE id=?').get(id);
    if (!row) fail(404, 'Textbook not found');
    return Book.parse(JSON.parse(row.data));
  }
  async read(id) {
    return this.load(id);
  }
  async create(input) {
    const book = Book.parse(input);
    if (book.revision !== 0) fail(400, 'A new textbook must start at revision zero');
    this.transaction(() => {
      if (this.db.prepare('SELECT 1 FROM books WHERE id=?').get(book.id)) fail(409, 'Book exists');
      this.db.prepare('INSERT INTO books VALUES (?,?)').run(book.id, JSON.stringify(book));
      this.db
        .prepare('INSERT INTO revisions VALUES (?,?,?)')
        .run(book.id, 0, JSON.stringify(book.document));
    });
  }
  async update(id, fn, content = false) {
    return this.transaction(() => {
      const book = this.load(id);
      fn(book);
      book.updatedAt = new Date().toISOString();
      if (content) book.revision++;
      Book.parse(book);
      if (content)
        this.db
          .prepare('INSERT INTO revisions VALUES (?,?,?)')
          .run(id, book.revision, JSON.stringify(book.document));
      this.db.prepare('UPDATE books SET data=? WHERE id=?').run(JSON.stringify(book), id);
      return book;
    });
  }
  async remove(id, check) {
    this.transaction(() => {
      check(this.load(id));
      this.db.prepare('DELETE FROM books WHERE id=?').run(id);
      this.db.prepare('DELETE FROM revisions WHERE book_id=?').run(id);
    });
  }
  async readRevision(id, revision) {
    const book = this.load(id);
    if (revision < 0 || revision > book.revision) fail(404, 'Revision not found');
    const row = this.db
      .prepare('SELECT data FROM revisions WHERE book_id=? AND revision=?')
      .get(id, revision);
    if (!row) fail(404, 'Revision not found');
    return JSON.parse(row.data);
  }
  close() {
    this.db.close();
  }
}
