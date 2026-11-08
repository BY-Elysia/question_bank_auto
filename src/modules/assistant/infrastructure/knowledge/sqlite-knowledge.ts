import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { KnowledgeStore } from '../../ports/knowledge.js';
import type { Evidence, KnowledgeScope, ToolContext } from '../../domain/knowledge.js';
export class SqliteKnowledge implements KnowledgeStore {
  private constructor(private db: DatabaseSync) {}
  static async open(root: string) {
    const dir = path.join(root, 'assistant');
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    const file = path.join(dir, 'knowledge.sqlite');
    const db = new DatabaseSync(file);
    await fs.chmod(file, 0o600);
    db.exec(`PRAGMA journal_mode=WAL;
 CREATE TABLE IF NOT EXISTS scopes(conversation TEXT PRIMARY KEY,payload TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS evidence(id TEXT PRIMARY KEY,conversation TEXT NOT NULL,run TEXT NOT NULL,payload TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS evidence_conversation ON evidence(conversation);
 CREATE TABLE IF NOT EXISTS calls(run TEXT NOT NULL,id TEXT NOT NULL,conversation TEXT NOT NULL,name TEXT NOT NULL,status TEXT NOT NULL,args TEXT NOT NULL,result TEXT,updated TEXT NOT NULL,PRIMARY KEY(run,id));`);
    return new SqliteKnowledge(db);
  }
  scope(id: string): KnowledgeScope {
    const r = this.db.prepare('SELECT payload FROM scopes WHERE conversation=?').get(id);
    return r
      ? { allowEdits: false, ...JSON.parse(r.payload as string) }
      : { workspaceIds: [], epoch: 0, historyStart: 0, focus: null, allowEdits: false };
  }
  saveScope(id: string, scope: KnowledgeScope) {
    this.db
      .prepare(
        'INSERT INTO scopes VALUES(?,?) ON CONFLICT(conversation) DO UPDATE SET payload=excluded.payload',
      )
      .run(id, JSON.stringify(scope));
  }
  evidence(e: Evidence) {
    this.db
      .prepare('INSERT INTO evidence VALUES(?,?,?,?)')
      .run(e.id, e.conversationId, e.runId, JSON.stringify(e));
  }
  getEvidence(id: string) {
    const r = this.db.prepare('SELECT payload FROM evidence WHERE id=?').get(id);
    return r ? (JSON.parse(r.payload as string) as Evidence) : undefined;
  }
  call(c: ToolContext, id: string, name: string, status: string, args: unknown, result?: unknown) {
    this.db
      .prepare(
        'INSERT INTO calls VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(run,id) DO UPDATE SET status=excluded.status,result=excluded.result,updated=excluded.updated',
      )
      .run(
        c.runId,
        id,
        c.conversationId,
        name,
        status,
        JSON.stringify(args),
        result === undefined ? null : JSON.stringify(result),
        new Date().toISOString(),
      );
  }
  calls(id: string) {
    return Number(this.db.prepare('SELECT count(*) AS n FROM calls WHERE run=?').get(id)!.n);
  }
  remove(id: string) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const t of ['scopes', 'evidence', 'calls'])
        this.db.prepare(`DELETE FROM ${t} WHERE conversation=?`).run(id);
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  close() {
    this.db.close();
  }
}
