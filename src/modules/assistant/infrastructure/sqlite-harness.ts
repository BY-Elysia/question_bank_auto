import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { HarnessStore, HarnessSession } from '../ports/harness-store.js';
import type { Conversation } from '../domain/conversation.js';
import type { AssistantRun, RunEvent } from '../domain/run.js';
import { fail } from '../../../shared/errors.js';
import { FileConversations } from './file-conversations.js';
type SessionRow = { id: string; title: string; updatedAt: string; pending: number };
export class SqliteHarness implements HarnessStore {
  private constructor(private db: DatabaseSync) {}
  static async open(root: string) {
    const dir = path.join(root, 'assistant');
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    const file = path.join(dir, 'harness.sqlite');
    const db = new DatabaseSync(file);
    await fs.chmod(file, 0o600);
    db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,title TEXT NOT NULL,updatedAt TEXT NOT NULL,pending INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS messages(session TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,id TEXT NOT NULL,position INTEGER NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(session,id));
      CREATE INDEX IF NOT EXISTS messages_order ON messages(session,position);
      CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY,session TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,position INTEGER NOT NULL,payload TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS runs_order ON runs(session,position);
      CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT,run TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,type TEXT NOT NULL,data TEXT NOT NULL,at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS events_run ON events(run,seq);`);
    const store = new SqliteHarness(db);
    if (!db.prepare("SELECT key FROM meta WHERE key='legacy-import'").get()) {
      for (const c of await new FileConversations(root).list()) {
        if (!db.prepare('SELECT id FROM sessions WHERE id=?').get(c.id)) store.create(c);
      }
      db.prepare("INSERT INTO meta VALUES('legacy-import','1')").run();
    }
    return store;
  }
  private transaction<T>(operation: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = operation();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  private row(id: string): SessionRow {
    const row = this.db.prepare('SELECT * FROM sessions WHERE id=?').get(id);
    if (!row) fail(404, 'Conversation not found');
    return row as SessionRow;
  }
  private emit(runId: string, type: string, data: unknown) {
    this.db
      .prepare('INSERT INTO events(run,type,data,at) VALUES(?,?,?,?)')
      .run(runId, type, JSON.stringify(data), new Date().toISOString());
  }
  create(conversation: Conversation) {
    this.transaction(() => {
      this.db
        .prepare('INSERT INTO sessions VALUES(?,?,?,?)')
        .run(conversation.id, conversation.title, conversation.updatedAt, 0);
      conversation.messages.forEach((m, i) =>
        this.db
          .prepare('INSERT INTO messages VALUES(?,?,?,?)')
          .run(conversation.id, m.id, i, JSON.stringify(m)),
      );
    });
  }
  list() {
    return (
      this.db.prepare('SELECT * FROM sessions ORDER BY updatedAt DESC').all() as SessionRow[]
    ).map((x) => ({ ...x, pending: !!x.pending }));
  }
  get(id: string): HarnessSession {
    const { pending, ...row } = this.row(id);
    void pending;
    return {
      conversation: {
        ...row,
        messages: this.db
          .prepare('SELECT payload FROM messages WHERE session=? ORDER BY position')
          .all(id)
          .map((x) => JSON.parse(x.payload as string)),
      },
      runs: this.db
        .prepare('SELECT payload FROM runs WHERE session=? ORDER BY position')
        .all(id)
        .map((x) => JSON.parse(x.payload as string)),
    };
  }
  snapshot(id: string) {
    const { pending, ...row } = this.row(id);
    void pending;
    const page = this.messages(id, undefined, 50);
    const run = this.db
      .prepare('SELECT payload FROM runs WHERE session=? ORDER BY position DESC LIMIT 1')
      .get(id);
    return {
      conversation: { ...row, messages: page.messages },
      runs: run ? [JSON.parse(run.payload as string) as AssistantRun] : [],
      nextCursor: page.nextCursor,
    };
  }
  messages(id: string, cursor: string | undefined, limit: number) {
    this.row(id);
    const row = cursor
      ? this.db.prepare('SELECT position FROM messages WHERE session=? AND id=?').get(id, cursor)
      : undefined;
    if (cursor && !row) fail(400, '无效消息游标');
    const rows = this.db
      .prepare(
        'SELECT payload FROM messages WHERE session=? AND position<? ORDER BY position DESC LIMIT ?',
      )
      .all(id, row?.position ?? Number.MAX_SAFE_INTEGER, limit + 1);
    const messages = rows
      .slice(0, limit)
      .reverse()
      .map((x) => JSON.parse(x.payload as string)) as Conversation['messages'];
    return { messages, nextCursor: rows.length > limit ? messages[0]!.id : null };
  }
  update<T>(
    id: string,
    change: (s: HarnessSession, emit: (id: string, type: string, data: unknown) => void) => T,
  ): T {
    return this.transaction(() => {
      const s = this.get(id),
        before = JSON.stringify(s);
      const previousMessages = new Map(
        s.conversation.messages.map((m) => [m.id, JSON.stringify(m)]),
      );
      const previousRuns = new Map(s.runs.map((r) => [r.id, JSON.stringify(r)]));
      const events: { id: string; type: string; data: unknown }[] = [];
      const result = change(s, (id, type, data) => events.push({ id, type, data }));
      if (!events.length && before === JSON.stringify(s)) return result;
      s.conversation.updatedAt = new Date().toISOString();
      for (const r of s.runs)
        if (events.some((e) => e.id === r.id)) r.updatedAt = s.conversation.updatedAt;
      this.db
        .prepare('UPDATE sessions SET title=?,updatedAt=?,pending=? WHERE id=?')
        .run(
          s.conversation.title,
          s.conversation.updatedAt,
          Number(s.runs.some((r) => ['queued', 'running', 'waiting_input'].includes(r.status))),
          id,
        );
      s.conversation.messages.forEach((m, i) => {
        const payload = JSON.stringify(m);
        if (previousMessages.get(m.id) !== payload)
          this.db
            .prepare(
              'INSERT INTO messages VALUES(?,?,?,?) ON CONFLICT(session,id) DO UPDATE SET payload=excluded.payload',
            )
            .run(id, m.id, i, payload);
      });
      s.runs.forEach((r, i) => {
        const payload = JSON.stringify(r);
        if (previousRuns.get(r.id) !== payload)
          this.db
            .prepare(
              'INSERT INTO runs VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload',
            )
            .run(r.id, id, i, payload);
      });
      for (const e of events) this.emit(e.id, e.type, e.data);
      return result;
    });
  }
  appendText(session: string, runId: string, messageId: string, delta: string) {
    this.transaction(() => {
      const row = this.db
        .prepare('SELECT payload FROM messages WHERE session=? AND id=?')
        .get(session, messageId);
      if (!row) fail(404, 'Message not found');
      const m = JSON.parse(row.payload as string) as Conversation['messages'][number];
      if (m.status !== 'pending') return;
      m.content += delta;
      this.db
        .prepare('UPDATE messages SET payload=? WHERE session=? AND id=?')
        .run(JSON.stringify(m), session, messageId);
      this.emit(runId, 'message_delta', { messageId, text: m.content, delta });
    });
  }
  findRun(id: string) {
    const r = this.db.prepare('SELECT session FROM runs WHERE id=?').get(id);
    if (!r) fail(404, 'Run not found');
    return r.session as string;
  }
  events(runId: string, after: number): RunEvent[] {
    return this.db
      .prepare(
        'SELECT seq,run as runId,type,data,at FROM events WHERE run=? AND seq>? ORDER BY seq LIMIT 500',
      )
      .all(runId, after)
      .map((r) => ({ ...r, data: JSON.parse(r.data as string) })) as unknown as RunEvent[];
  }
  remove(id: string) {
    this.db.prepare('DELETE FROM sessions WHERE id=?').run(id);
  }
  close() {
    this.db.close();
  }
}
