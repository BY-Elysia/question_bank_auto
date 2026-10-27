import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { fixture, run } from './helpers.mjs';
import { SkillRunner } from '../dist/app/ai/runtime/skill-runner.js';
import { FileSkillCatalog } from '../dist/app/ai/infrastructure/file-skill-catalog.js';
import { FileRunRecords } from '../dist/app/ai/infrastructure/file-run-records.js';
import { JobsService } from '../dist/app/modules/jobs/application/jobs.service.js';

test('A new AI skill package executes without editing SkillRunner; changed instructions invalidate a pinned task', async (t) => {
  const system = await fixture(t);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'new-ai-package-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await fs.mkdir(path.join(dir, 'summarize-chapter'));
  await fs.writeFile(
    path.join(dir, 'summarize-chapter', 'definition.json'),
    JSON.stringify({ id: 'summarize-chapter', version: '1.0.0', modelRole: 'reasoning' }),
  );
  const instruction = '---\nname: summarize-chapter\n---\nSummarize this chapter.';
  await fs.writeFile(path.join(dir, 'summarize-chapter', 'SKILL.md'), instruction);
  const model = {
    async complete(request) {
      assert.equal(request.role, 'reasoning');
      assert.ok(request.system.includes('Summarize'));
      return { text: '{"summary":"example"}', model: 'test', usage: null };
    },
  };
  const runner = new SkillRunner(
    system.store,
    model,
    {
      async dataUrl() {
        throw new Error('No images expected');
      },
    },
    new FileSkillCatalog(pathToFileURL(dir + '/')),
    new FileRunRecords(system.root),
  );
  const context = { bookId: 'book', jobId: 'extension-test', signal: new AbortController().signal };
  const schema = z.object({ summary: z.string() });
  assert.equal(
    (await runner.run('summarize-chapter', { text: 'chapter' }, schema, [], context)).summary,
    'example',
  );
  await fs.writeFile(path.join(dir, 'summarize-chapter', 'SKILL.md'), instruction + ' Changed.');
  await assert.rejects(
    runner.run('summarize-chapter', {}, schema, [], context),
    /instructions changed/,
  );
  await assert.rejects(runner.run('../unsafe', {}, schema, [], context), /Invalid skill/);
});
test('Workflow handlers can be replaced without importing concrete workflows into the job scheduler', async (t) => {
  const system = await fixture(t);
  await run(system);
  let called = 0;
  const scheduler = new JobsService(
    system.store,
    new Map([
      [
        'verify',
        {
          async execute(ctx) {
            assert.equal(ctx.bookId, 'book');
            called++;
          },
        },
      ],
    ]),
  );
  const job = await scheduler.start('book', { kind: 'verify' });
  await scheduler.wait(job.id);
  assert.equal(called, 1);
  assert.equal((await scheduler.get('book', job.id)).status, 'completed');
  await assert.rejects(
    scheduler.start('book', { kind: 'repair', contentIds: ['c_q1'], instruction: 'x' }),
    /Unsupported/,
  );
});

test('Skill schema failures record field diagnostics without persisting model source text', async (t) => {
  const system = await fixture(t);
  const records = [];
  let calls = 0;
  const runner = new SkillRunner(
    system.store,
    {
      async complete(request) {
        if (calls++) assert.match(request.input.validationFeedback, /summary/);
        return {
          text: JSON.stringify({ summary: { privateSource: 'DO_NOT_LOG_SOURCE' } }),
          model: 'test',
          usage: null,
        };
      },
    },
    {
      async dataUrl() {
        throw new Error('No images expected');
      },
    },
    {
      async get() {
        return { id: 'test', version: '1', instructions: 'test', modelRole: 'vision' };
      },
    },
    {
      async pin() {},
      async record(_book, _job, record) {
        records.push(record);
      },
    },
  );
  await assert.rejects(
    runner.run('test', {}, z.object({ summary: z.string() }), [], {
      bookId: 'book',
      jobId: 'diagnostic',
      signal: new AbortController().signal,
    }),
    /invalid structured output/,
  );
  assert.equal(records.length, 2);
  assert.equal(records[1].validationError, 'summary: invalid_type');
  assert.ok(!JSON.stringify(records).includes('DO_NOT_LOG_SOURCE'));
});
