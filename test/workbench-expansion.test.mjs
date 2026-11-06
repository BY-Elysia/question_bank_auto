import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import http from 'node:http';
import { createApplication } from '../dist/app/apps/control-api/application.js';
import { HttpModelClient } from '../dist/app/ai/providers/model-client.js';
import { normalizeUsage } from '../dist/app/modules/profile/infrastructure/file-usage.js';
import { questionBankExport } from '../dist/app/modules/textbooks/application/question-bank-export.js';
import { question } from './helpers.mjs';
const png = () =>
  sharp({ create: { width: 160, height: 220, channels: 3, background: 'white' } })
    .png()
    .toBuffer();
const metadata = {
  title: '修改后的教材',
  subject: '数学',
  publisher: '出版社',
  version: 'v1.1',
  courseId: 'course',
  textbookId: 'book',
  hasAnswer: false,
  answerHandlingMode: 'leave_empty',
};
async function fixture(t, options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-'));
  const app = await createApplication({ root, ...options });
  await app.app.listen(0, '127.0.0.1');
  const base = await app.app.getUrl();
  t.after(async () => {
    await app.app.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  return { ...app, root, base };
}
async function seed(app) {
  const w = await app.workspaces.uploadImages([await png()], '原教材');
  await app.store.update(
    w.id,
    (b) => {
      b.document.processedPages = [1];
      b.document.contents = [1, 2].map((n) => ({
        id: `q${n}`,
        key: `q${n}`,
        kind: 'question',
        sectionId: null,
        sources: [{ page: 1, box: [0, 0, 1, 1] }],
        text: '',
        caption: null,
        table: null,
        question: { ...question(String(n)), type: 'fill_blank' },
      }));
    },
    true,
  );
  return w;
}
test('Image insertion is detached, ordered, resumable, isolated and metadata updates affect exports', async (t) => {
  let release;
  const gate = new Promise((r) => (release = r));
  let calls = 0;
  const app = await fixture(t, {
    skills: {
      async run(id, input, schema, pages, context) {
        assert.equal(id, 'question-insert');
        calls++;
        await gate;
        return schema.parse({
          questions: [{ ...question('原题号99'), type: 'fill_blank', prompt: '补充 $x^2$' }],
        });
      },
    },
  });
  const a = await seed(app),
    b = await seed(app);
  const job = await app.insertion.upload(a.id, 'q2', 'before', await png(), 1, app.jobs);
  assert.ok(['queued', 'running'].includes(job.status));
  await assert.rejects(app.workspaces.updateMetadata(a.id, 1, metadata), (e) => e.status === 409);
  await app.workspaces.updateMetadata(b.id, 1, metadata); // Another workspace remains writable.
  assert.equal((await app.store.read(a.id)).document.contents.length, 2);
  release();
  await app.jobs.wait(job.id);
  const saved = await app.store.read(a.id);
  assert.equal(saved.jobs[0].status, 'completed');
  assert.equal(saved.pages.length, 2);
  assert.deepEqual(
    saved.document.contents.map((c) => c.question.label),
    ['1', '2', '3'],
  );
  assert.equal(saved.document.contents[1].question.prompt, '补充 $x^2$');
  assert.equal(saved.document.contents[1].sources[0].page, 2);
  assert.equal((await app.books.asset(a.id, 2, 'preview')).contentType, 'image/webp');
  // Re-executing a committed insertion must not duplicate it.
  await app.insertion.execute({
    bookId: a.id,
    jobId: job.id,
    signal: new AbortController().signal,
  });
  assert.equal(calls, 1);
  await app.workspaces.updateMetadata(a.id, 2, metadata);
  const exported = questionBankExport(await app.store.read(a.id));
  assert.equal(exported.textbook.title, metadata.title);
  assert.equal(exported.questions.length, 3);
  const view = await app.workspaceView.get(a.id);
  assert.equal(view.workspace.totalPages, 2);
  assert.equal((await app.store.read(b.id)).document.contents.length, 2);
});
test('Failed insertion keeps existing document and uploaded image for a successful resume', async (t) => {
  let fail = true;
  const app = await fixture(t, {
    skills: {
      async run(id, input, schema) {
        if (fail) throw Error('mock format failure');
        return schema.parse({ questions: [question('9')] });
      },
    },
  });
  const w = await seed(app),
    j = await app.insertion.upload(w.id, 'q1', 'after', await png(), 1, app.jobs);
  await app.jobs.wait(j.id);
  const before = await app.store.read(w.id);
  assert.equal(before.jobs[0].status, 'failed');
  assert.equal(before.revision, 1);
  assert.equal(before.pages.length, 1);
  fail = false;
  await app.jobs.resume(w.id, j.id);
  await app.jobs.wait(j.id);
  const after = await app.store.read(w.id);
  assert.equal(after.document.contents.length, 3);
  assert.equal(after.jobs[0].status, 'completed');
});
test('Assistant survives leaving the HTTP request, persists messages and records actual token use', async (t) => {
  let release;
  const gate = new Promise((r) => (release = r));
  const app = await fixture(t, {
    model: {
      async complete(r) {
        assert.equal(r.messages[0].content, '你好');
        await gate;
        return {
          text: '你好，$x^2$',
          model: 'test',
          usage: { prompt_tokens: 8, completion_tokens: 4, total_tokens: 12 },
        };
      },
    },
  });
  const c = await app.assistant.create();
  const response = await fetch(app.base + `/api/assistant/conversations/${c.id}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: '你好' }),
  });
  assert.equal(response.status, 202);
  assert.equal((await response.json()).messages[1].status, 'pending');
  await assert.rejects(app.assistant.send(c.id, '重复'), (e) => e.status === 409);
  release();
  await app.assistant.wait(c.id);
  assert.equal((await app.assistant.get(c.id)).messages[1].content, '你好，$x^2$');
  const usage = await app.profile.usageSummary();
  assert.equal(usage.assistant.total, 12);
  assert.equal(usage.assistant.calls, 1);
  const persisted = JSON.parse(
    await fs.readFile(path.join(app.root, 'conversations', c.id + '.json')),
  );
  assert.equal(persisted.messages[1].status, 'complete');
});
test('Settings never expose keys and never reuse a secret for a different provider', async (t) => {
  const app = await fixture(t);
  const config = {
    baseUrl: 'https://provider.example/v1',
    apiKey: 'secret-value',
    model: 'model',
    visionModel: 'vision',
    protocol: 'chat',
    prefixCache: false,
  };
  const saved = await app.profile.save(config);
  assert.equal(saved.hasApiKey, true);
  assert.equal('apiKey' in saved, false);
  await assert.rejects(
    app.profile.save({ ...config, baseUrl: 'https://different.example/v1', apiKey: '' }),
    (e) => e.status === 400,
  );
  const same = await app.profile.save({ ...config, apiKey: '' });
  assert.equal(same.hasApiKey, true);
  const response = await fetch(app.base + '/api/profile/model');
  assert.ok(!(await response.text()).includes('secret-value'));
});
test('Provider adapters preserve chat roles and support native Anthropic image messages', async (t) => {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    let raw = '';
    for await (const c of req) raw += c;
    requests.push({ url: req.url, headers: req.headers, body: JSON.parse(raw) });
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify(
        req.url.endsWith('messages')
          ? {
              content: [{ type: 'text', text: 'OK' }],
              stop_reason: 'end_turn',
              usage: { input_tokens: 7, output_tokens: 2 },
            }
          : { choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }] },
      ),
    );
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => server.close(r)));
  const settings = {
    baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
    apiKey: 'key',
    model: 'm',
    visionModel: 'v',
    protocol: 'chat',
    prefixCache: false,
  };
  const client = new HttpModelClient(undefined, { get: async () => ({ ...settings }) });
  const req = {
    system: 'system',
    input: {},
    images: [],
    role: 'reasoning',
    cache: 'prefix',
    outputMode: 'text',
    signal: new AbortController().signal,
    messages: [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
      { role: 'user', content: 'next' },
    ],
  };
  await client.complete(req);
  assert.equal(requests[0].body.messages[2].role, 'assistant');
  assert.equal(requests[0].url, '/v1/chat/completions');
  settings.protocol = 'anthropic';
  await client.complete({
    ...req,
    messages: undefined,
    images: [{ page: 1, url: 'data:image/png;base64,AA==' }],
  });
  assert.equal(requests[1].headers['x-api-key'], 'key');
  assert.equal(requests[1].headers.authorization, undefined);
  assert.equal(requests[1].body.messages[0].content[2].source.type, 'base64');
  assert.deepEqual(
    normalizeUsage({ input_tokens: 5, output_tokens: 3, cache_read_input_tokens: 7 }),
    { input: 12, output: 3, cached: 7, total: 15 },
  );
});

test('Cancelling after an insertion commit cannot turn its persisted result into a failed job', async (t) => {
  let app, entered, release;
  const committed = new Promise((r) => (entered = r)),
    gate = new Promise((r) => (release = r));
  app = await fixture(t, {
    handlers: new Map([
      [
        'insert',
        {
          isCommitted: (job) => job.processedIds.length > 0,
          async execute(c) {
            await app.store.update(
              c.bookId,
              (b) => {
                b.jobs.find((j) => j.id === c.jobId).processedIds = ['committed'];
              },
              true,
            );
            entered();
            await gate;
          },
        },
      ],
    ]),
  });
  const w = await seed(app),
    j = await app.insertion.upload(w.id, 'q1', 'after', await png(), 1, app.jobs);
  await committed;
  const stopping = app.jobs.cancel(w.id, j.id);
  release();
  await stopping;
  assert.equal((await app.jobs.get(w.id, j.id)).status, 'completed');
});

test('Insertion normalizes a pure choice heading without another model call and accepts omitted empty children', async (t) => {
  let calls = 0;
  const option = {
    ...question('(1)'),
    type: 'single_choice',
    options: [
      { id: 'A', text: '$x^2$' },
      { id: 'B', text: '$2x$' },
    ],
  };
  const { children, ...leaf } = option;
  const app = await fixture(t, {
    skills: {
      async run(id, input, schema) {
        calls++;
        return schema.parse({
          questions: [
            {
              ...question('1'),
              type: 'group',
              prompt: '一、选择题',
              children: [leaf, { ...leaf, label: '(2)' }],
            },
            { ...leaf, label: '3' },
          ],
        });
      },
    },
  });
  const w = await seed(app),
    j = await app.insertion.upload(w.id, 'q1', 'after', await png(), 1, app.jobs);
  await app.jobs.wait(j.id);
  const b = await app.store.read(w.id);
  assert.equal(b.jobs[0].status, 'completed');
  assert.equal(calls, 1);
  assert.equal(b.document.contents.length, 5);
  assert.ok(b.document.contents.slice(1, 4).every((c) => c.question.children.length === 0));
  assert.deepEqual(
    b.document.contents.map((c) => c.question.label),
    ['1', '2', '3', '4', '5'],
  );
});

test('Assistant configuration is isolated from textbook credentials, persists and drives assistant requests', async (t) => {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    for await (const chunk of req) {
    }
    requests.push({ url: req.url, authorization: req.headers.authorization });
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        choices: [{ message: { content: 'independent assistant' }, finish_reason: 'stop' }],
      }),
    );
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const app = await fixture(t);
  const initial = await app.assistantConfiguration.get();
  assert.equal(initial.hasApiKey, false);
  const config = {
    baseUrl: base + '/assistant',
    apiKey: 'assistant-test-key',
    model: 'assistant-model',
    visionModel: '',
    protocol: 'chat',
    prefixCache: false,
  };
  await app.profile.save({
    ...config,
    baseUrl: base + '/textbook',
    apiKey: 'textbook-test-key',
    model: 'textbook-model',
  });
  assert.equal((await app.assistantConfiguration.get()).hasApiKey, false);
  const saved = await fetch(app.base + '/api/assistant/model', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  assert.equal(saved.status, 200);
  assert.equal('apiKey' in (await saved.json()), false);
  const c = await app.assistant.create();
  await app.assistant.send(c.id, 'test independent config');
  await app.assistant.wait(c.id);
  assert.equal((await app.assistant.get(c.id)).messages[1].content, 'independent assistant');
  assert.equal(requests[0].url, '/assistant/chat/completions');
  assert.equal(requests[0].authorization, 'Bearer assistant-test-key');
  assert.equal((await app.profile.get()).model, 'textbook-model');
  const disk = JSON.parse(
    await fs.readFile(path.join(app.root, 'profile', 'assistant-model.json')),
  );
  assert.equal(disk.model, 'assistant-model');
  assert.equal((await app.assistantConfiguration.test({ ...config, apiKey: '' })).ok, true);
  assert.equal(requests.at(-1).authorization, 'Bearer assistant-test-key');
});
