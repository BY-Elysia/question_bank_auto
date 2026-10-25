import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { BookStore } from '../dist/app/modules/textbooks/infrastructure/book-store.js';
import { SqliteRepository } from './support/sqlite-repository.mjs';
import { createApplication } from '../dist/app/apps/control-api/application.js';
import { ScriptedSkills } from './helpers.mjs';
const book = () => ({
  schemaVersion: '1.0',
  id: 'book',
  title: 'Test',
  revision: 0,
  createdAt: '2026-10-25',
  updatedAt: '2026-10-25',
  pages: [1, 2, 3].map((number) => ({
    number,
    width: 100,
    height: 100,
    status: 'ready',
    blank: false,
  })),
  document: { sections: [], contents: [], issues: [], processedPages: [] },
  jobs: [],
  proposals: [],
});
for (const adapter of ['json', 'sqlite'])
  test(`${adapter} repository: rollback, serialized writes, immutable revisions, guarded deletion`, async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'repository-contract-'));
    const repo =
      adapter === 'json'
        ? new BookStore(root)
        : new SqliteRepository(path.join(root, 'books.sqlite'));
    t.after(async () => {
      repo.close?.();
      await fs.rm(root, { recursive: true, force: true });
    });
    await repo.init();
    await repo.create(book());
    await assert.rejects(repo.create({ ...book(), id: 'invalid', revision: 1 }));
    await assert.rejects(repo.create({ ...book(), title: 'must not overwrite' }));
    assert.equal((await repo.read('book')).title, 'Test');
    await assert.rejects(
      repo.update(
        'book',
        (b) => {
          b.title = 'must roll back';
          throw new Error('rollback');
        },
        true,
      ),
      /rollback/,
    );
    assert.equal((await repo.read('book')).title, 'Test');
    assert.equal((await repo.read('book')).revision, 0);
    await Promise.all(
      Array.from({ length: 8 }, () =>
        repo.update(
          'book',
          (b) => {
            b.document.processedPages = [1];
          },
          true,
        ),
      ),
    );
    assert.equal((await repo.read('book')).revision, 8);
    assert.deepEqual((await repo.readRevision('book', 0)).processedPages, []);
    await assert.rejects(repo.readRevision('book', 9));
    const detached = await repo.read('book');
    detached.title = 'not saved';
    assert.equal((await repo.read('book')).title, 'Test');
    await assert.rejects(
      repo.remove('book', () => {
        throw new Error('active task');
      }),
      /active task/,
    );
    assert.equal((await repo.list()).length, 1);
    await repo.remove('book', () => {});
    await assert.rejects(repo.read('book'));
    assert.equal((await repo.list()).length, 0);
  });
test('The same HTTP controllers and workflows operate with SQLite metadata instead of JSON files', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sql-backend-'));
  const repo = new SqliteRepository(path.join(root, 'metadata.sqlite'));
  const system = await createApplication({ root, store: repo, skills: new ScriptedSkills() });
  await system.store.create(book());
  await system.app.listen(0, '127.0.0.1');
  const base = await system.app.getUrl();
  t.after(async () => {
    await system.app.close();
    repo.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  const start = await fetch(`${base}/api/textbooks/book/jobs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"kind":"parse","generateAnswers":true}',
  });
  assert.equal(start.status, 202);
  const job = await start.json();
  await system.jobs.wait(job.id);
  const data = await (await fetch(`${base}/api/textbooks/book`)).json();
  assert.equal(data.jobs[0].status, 'needs_review');
  assert.equal(data.document.contents.length, 4);
  const decision = await fetch(
    `${base}/api/textbooks/book/proposals/${data.proposals[0].id}/decision`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ expectedRevision: data.revision, decision: 'accept' }),
    },
  );
  assert.equal(decision.status, 200);
  const exported = await (await fetch(`${base}/api/textbooks/book/export.json`)).json();
  assert.equal(
    exported.contents.find((c) => c.id === 'c_q1').question.answer.origin,
    'ai_generated',
  );
  await assert.rejects(fs.access(path.join(root, 'books', 'book', 'state.json')));
  assert.equal(repo.db.prepare('SELECT count(*) AS count FROM revisions').get().count, 3);
});
