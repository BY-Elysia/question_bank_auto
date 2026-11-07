import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { HarnessService } from '../dist/app/modules/assistant/application/harness/service.js';
import { SqliteHarness } from '../dist/app/modules/assistant/infrastructure/sqlite-harness.js';
const catalog = { get: async () => ({ version: '1', instructions: 'test', id: 'assistant-chat' }) };
const context = { resolve: async () => ({ references: [] }) };
const records = { record: async () => {} };
const result = (i, text = 'done', extra = {}) => ({
  checkpoint: [...i.checkpoint, { role: 'assistant', content: text }],
  text,
  interactions: [],
  usage: { total_tokens: 2 },
  model: 'test',
  stop: 'complete',
  ...extra,
});
async function fixture(t, step) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-'));
  const runtime = { history: (x) => structuredClone(x), step };
  let store = await SqliteHarness.open(root);
  let service = new HarnessService(store, runtime, catalog, records, context);
  t.after(async () => {
    await service.shutdown();
    await fs.rm(root, { recursive: true, force: true });
  });
  return {
    root,
    get service() {
      return service;
    },
    get store() {
      return store;
    },
    async reopen() {
      await service.shutdown();
      store = await SqliteHarness.open(root);
      service = new HarnessService(store, runtime, catalog, records, context);
      await service.recover();
      return service;
    },
  };
}
async function until(check) {
  for (let i = 0; i < 200; i++) {
    if (check()) return;
    await delay(5);
  }
  throw Error('condition timed out');
}

test('Durable question survives restart, answer is idempotent and continues exactly once', async (t) => {
  let calls = 0;
  const f = await fixture(t, async (i) => {
    calls++;
    return i.answers.length
      ? result(i, 'answer=' + i.answers[0].answer)
      : result(i, '请确认', {
          stop: 'continue',
          interactions: [
            {
              id: 'q',
              toolCallId: 'call',
              question: '选哪个？',
              options: ['A', 'B'],
              kind: 'confirmation',
              status: 'pending',
              answer: null,
            },
          ],
        });
  });
  const c = await f.service.create(),
    r = await f.service.start(c.id, '开始', 'initial');
  await f.service.wait(c.id);
  assert.equal(f.service.run(r.id).status, 'waiting_input');
  assert.equal('checkpoint' in f.service.run(r.id), false);
  await f.reopen();
  assert.equal(f.service.run(r.id).interactions[0].question, '选哪个？');
  await Promise.all([f.service.answer(r.id, 'q', 'A'), f.service.answer(r.id, 'q', 'A')]);
  await f.service.wait(c.id);
  assert.equal(calls, 2);
  assert.equal(f.service.run(r.id).status, 'completed');
  assert.equal((await f.service.get(c.id)).messages.at(-1).content, 'answer=A');
  await assert.rejects(f.service.answer(r.id, 'q', 'B'), (e) => e.status === 409);
  const events = f.service.events(r.id, 0),
    cursor = events[1].seq;
  assert.deepEqual(
    f.service.events(r.id, cursor),
    events.filter((e) => e.seq > cursor),
  );
});

test('Interrupt aborts the old step and applies queued steering before follow-up without duplicates', async (t) => {
  let calls = 0;
  const seen = [];
  const f = await fixture(t, async (i) => {
    seen.push(i.checkpoint.filter((x) => x.role === 'user').map((x) => x.content));
    if (++calls === 1) {
      i.delta('partial');
      await delay(10000, undefined, { signal: i.signal });
    }
    return result(i, 'turn' + calls);
  });
  const c = await f.service.create(),
    r = await f.service.start(c.id, 'first', 'one');
  await until(() => calls === 1);
  await f.service.input(r.id, 'later', 'three', 'follow_up');
  await f.service.input(r.id, 'new direction', 'two', 'interrupt');
  await f.service.input(r.id, 'new direction', 'two', 'interrupt');
  await f.service.wait(c.id);
  assert.equal(calls, 3);
  assert.deepEqual(seen[1], ['first', 'new direction']);
  assert.deepEqual(seen[2], ['first', 'new direction', 'later']);
  assert.equal(f.service.run(r.id).status, 'completed');
  const messages = (await f.service.get(c.id)).messages;
  assert.equal(messages.filter((x) => x.content === 'new direction').length, 1);
  assert.equal(messages.find((x) => x.content === 'partial').status, 'failed');
});

test('Different conversations run independently; stop preserves partial text and rejects late answers', async (t) => {
  let started = 0;
  const f = await fixture(t, async (i) => {
    started++;
    i.delta('working');
    await delay(10000, undefined, { signal: i.signal });
    return result(i);
  });
  const a = await f.service.create(),
    b = await f.service.create();
  const ra = await f.service.start(a.id, 'a', 'a'),
    rb = await f.service.start(b.id, 'b', 'b');
  await until(() => started === 2);
  await f.service.cancel(ra.id);
  assert.equal(f.service.run(ra.id).status, 'cancelled');
  assert.equal(f.service.run(rb.id).status, 'running');
  assert.equal((await f.service.get(a.id)).messages.at(-1).content, 'working');
  await f.service.cancel(rb.id);
  await f.service.remove(a.id);
  assert.throws(
    () => f.service.run(ra.id),
    (e) => e.status === 404,
  );
});

test('Concurrent start idempotency, checkpoint recovery and message pagination', async (t) => {
  let calls = 0;
  const f = await fixture(t, async (i) => {
    if (++calls === 1) throw Error('temporary');
    return result(i);
  });
  const c = await f.service.create();
  const [a, b] = await Promise.all([
    f.service.start(c.id, 'hello', 'same'),
    f.service.start(c.id, 'hello', 'same'),
  ]);
  assert.equal(a.id, b.id);
  await f.service.wait(c.id);
  assert.equal(f.service.run(a.id).status, 'failed');
  await f.reopen();
  await f.service.resume(a.id);
  await f.service.wait(c.id);
  assert.equal(f.service.run(a.id).status, 'completed');
  await assert.rejects(f.service.start(c.id, 'different', 'same'), (e) => e.status === 409);
  assert.equal((await f.service.get(c.id)).messages.filter((x) => x.role === 'user').length, 1);
  const p = f.service.messages(c.id, undefined, 1);
  assert.equal(p.messages.length, 1);
  assert.equal(p.messages[0].role, 'assistant');
  assert.equal(f.service.messages(c.id, p.nextCursor, 50).messages.length, 2);
  f.service.rename(c.id, 'Renamed');
  assert.equal(f.service.view(c.id).conversation.title, 'Renamed');
});

test('Legacy JSON import is one-time, deleting migrated conversations does not resurrect them', async (t) => {
  const f = await fixture(t, async (i) => result(i));
  // Simulate a pre-harness installation in a separate root.
  const root = path.join(f.root, 'legacy');
  await fs.mkdir(path.join(root, 'conversations'), { recursive: true });
  const c = { id: 'legacy', title: 'old', updatedAt: new Date().toISOString(), messages: [] };
  await fs.writeFile(path.join(root, 'conversations', 'legacy.json'), JSON.stringify(c));
  const store = await SqliteHarness.open(root);
  assert.equal(store.get('legacy').conversation.title, 'old');
  store.remove('legacy');
  store.close();
  const reopened = await SqliteHarness.open(root);
  assert.equal(reopened.list().length, 0);
  reopened.close();
});

test('Redirect while waiting cancels the pending confirmation instead of approving it', async (t) => {
  const f = await fixture(t, async (i) =>
    i.answers.length
      ? result(i, 'redirected')
      : result(i, '', {
          stop: 'continue',
          interactions: [
            {
              id: 'q',
              toolCallId: 'call',
              question: '确认原方案？',
              options: ['确认'],
              kind: 'confirmation',
              status: 'pending',
              answer: null,
            },
          ],
        }),
  );
  const c = await f.service.create(),
    r = await f.service.start(c.id, 'start', 'a');
  await f.service.wait(c.id);
  await f.service.input(r.id, '取消原方案，重新回答', 'b', 'interrupt');
  await f.service.wait(c.id);
  assert.equal(f.service.run(r.id).status, 'completed');
  assert.equal(f.service.run(r.id).interactions[0].status, 'cancelled');
  await assert.rejects(f.service.answer(r.id, 'q', '确认'), (e) => e.status === 409);
  assert.equal((await f.service.get(c.id)).messages[1].content, '确认原方案？');
});

test('Cancel wins over a simultaneous redirect and leaves queued work unexecuted', async (t) => {
  let calls = 0;
  const f = await fixture(t, async (i) => {
    calls++;
    await delay(10000, undefined, { signal: i.signal });
    return result(i);
  });
  const c = await f.service.create(),
    r = await f.service.start(c.id, 'first', 'a');
  await until(() => calls === 1);
  const cancel = f.service.cancel(r.id);
  await f.service.input(r.id, 'late', 'b', 'interrupt');
  await cancel;
  assert.equal(f.service.run(r.id).status, 'cancelled');
  assert.equal(calls, 1);
});

test('State is bounded; older messages page backwards and text increments leave run checkpoints untouched', async (t) => {
  const f = await fixture(t, async (i) => result(i));
  const c = await f.service.create(),
    r = await f.service.start(c.id, 'first', 'initial');
  await f.service.wait(c.id);
  f.store.update(c.id, (s) => {
    for (let n = 0; n < 110; n++)
      s.conversation.messages.push({
        id: 'm' + n,
        role: n % 2 ? 'assistant' : 'user',
        content: 'msg' + n,
        status: 'complete',
        error: null,
      });
    s.conversation.messages.at(-1).status = 'pending';
  });
  const before = f.store.get(c.id).runs[0];
  f.store.appendText(c.id, r.id, 'm109', ' delta');
  assert.deepEqual(f.store.get(c.id).runs[0], before);
  const view = f.service.view(c.id);
  assert.equal(view.conversation.messages.length, 50);
  assert.equal(view.nextCursor, 'm60');
  assert.equal(view.conversation.messages.at(-1).content, 'msg109 delta');
  const older = f.service.messages(c.id, view.nextCursor, 50);
  assert.equal(older.messages[0].id, 'm10');
  assert.equal(older.messages.at(-1).id, 'm59');
  assert.equal(f.service.messages(c.id, older.nextCursor, 50).nextCursor, null);
});
