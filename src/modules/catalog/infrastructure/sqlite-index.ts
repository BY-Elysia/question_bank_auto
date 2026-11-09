import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { QuestionIndex } from '../ports/catalog.js';
import type { CatalogQuestion, QuestionSearch } from '../domain/catalog.js';
export class SqliteQuestionIndex implements QuestionIndex {
  private constructor(private db: DatabaseSync) {}
  static async open(root: string) {
    const dir = path.join(root, 'catalog');
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    const file = path.join(dir, 'questions.sqlite');
    const db = new DatabaseSync(file);
    await fs.chmod(file, 0o600);
    db.exec(`PRAGMA journal_mode=WAL;
 CREATE TABLE IF NOT EXISTS versions(workspace TEXT PRIMARY KEY,version TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS questions(workspace TEXT NOT NULL,position INTEGER NOT NULL,type TEXT NOT NULL,answer TEXT NOT NULL,section TEXT NOT NULL,search TEXT NOT NULL,payload TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS question_scope ON questions(workspace,type,answer);`);
    return new SqliteQuestionIndex(db);
  }
  sync(id: string, version: string, items: CatalogQuestion[]) {
    if (
      this.db.prepare('SELECT version FROM versions WHERE workspace=?').get(id)?.version === version
    )
      return;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('DELETE FROM questions WHERE workspace=?').run(id);
      const insert = this.db.prepare('INSERT INTO questions VALUES(?,?,?,?,?,?,?)');
      items
        .filter((q) => q.searchable)
        .forEach((q, i) => {
          const a = q.question.answer;
          const search = [
            q.title,
            q.section,
            q.parentPrompt,
            q.question.prompt,
            ...q.question.options.map((o) => o.text),
            a?.text ?? '',
            a?.explanation ?? '',
          ]
            .join('\n')
            .normalize('NFKC')
            .toLowerCase();
          insert.run(
            id,
            i,
            q.question.type,
            a ? (a.review === 'pending' ? 'pending' : 'present') : 'missing',
            q.section,
            search,
            JSON.stringify(q),
          );
        });
      this.db
        .prepare(
          'INSERT INTO versions VALUES(?,?) ON CONFLICT(workspace) DO UPDATE SET version=excluded.version',
        )
        .run(id, version);
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  search(ids: string[], q: QuestionSearch) {
    if (!ids.length) return { items: [], total: 0 };
    const conditions = [`workspace IN (${ids.map(() => '?').join(',')})`],
      args: (string | number)[] = [...ids];
    const like = (v: string) => '%' + v.replace(/[\\%_]/g, '\\$&') + '%';
    if (q.type) {
      conditions.push('type=?');
      args.push(q.type);
    }
    if (q.answer !== 'any') {
      conditions.push(q.answer === 'present' ? "answer<>'missing'" : 'answer=?');
      if (q.answer !== 'present') args.push(q.answer);
    }
    if (q.section) {
      conditions.push("section LIKE ? ESCAPE '\\'");
      args.push(like(q.section));
    }
    for (const term of q.query.normalize('NFKC').toLowerCase().split(/\s+/).filter(Boolean)) {
      conditions.push("search LIKE ? ESCAPE '\\'");
      args.push(like(term));
    }
    const where = conditions.join(' AND ');
    const total = Number(
      this.db.prepare('SELECT count(*) AS n FROM questions WHERE ' + where).get(...args)!.n,
    );
    const rows = this.db
      .prepare(
        'SELECT payload FROM questions WHERE ' +
          where +
          ' ORDER BY workspace,position LIMIT ? OFFSET ?',
      )
      .all(...args, q.limit, q.offset);
    return { items: rows.map((r) => JSON.parse(r.payload as string) as CatalogQuestion), total };
  }
  close() {
    this.db.close();
  }
}
