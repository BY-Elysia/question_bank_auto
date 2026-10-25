// Opt-in live test: synthetic two-chapter PDF, automatic page images and prefix-cached extraction.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { createApplication } from '../dist/app/apps/control-api/application.js';
import { textbookFixture } from '../test/fixtures/textbook.mjs';
if (!(process.env.MODEL_API_KEY || process.env.ARK_API_KEY))
  throw new Error('Configure model credentials for this billable live test');
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'workspace-live-'));
const system = await createApplication({ root });
const report = { root, startedAt: new Date().toISOString(), checks: [] };
const timer = setTimeout(() => {
  void system.workspaces.shutdown();
}, 600000);
try {
  await system.app.listen(0, '127.0.0.1');
  const base = await system.app.getUrl();
  const pdf = textbookFixture([
    ['Chapter 1: Arithmetic', 'Exercise 1. Calculate 2 + 3.'],
    [
      'Chapter 2: Geometry',
      'Exercise 1. A rectangle is 4 cm long and 3 cm wide.',
      'Calculate its area in square cm.',
    ],
  ]);
  const uploaded = await fetch(`${base}/api/workspaces/pdf?title=Live%20chapters`, {
    method: 'POST',
    headers: { 'content-type': 'application/pdf' },
    body: pdf,
  });
  assert.equal(uploaded.status, 202);
  const w = await uploaded.json();
  report.workspaceId = w.id;
  const get = async () => {
    const response = await fetch(`${base}/api/workspaces/${w.id}`);
    assert.equal(response.status, 200);
    return response.json();
  };
  async function wait() {
    for (let i = 0; i < 300; i++) {
      const view = await get();
      if (!['preparing', 'extracting'].includes(view.workspace.status)) return view;
      await sleep(2000);
    }
    throw new Error('Workspace timeout');
  }
  let view = await wait();
  assert.equal(view.workspace.status, 'ready', view.workspace.error);
  report.checks.push('PDF automatic conversion');
  const form = new FormData();
  for (const p of view.pages) {
    const response = await fetch(base + p.imageUrl);
    form.append(
      'images',
      new Blob([await response.arrayBuffer()], { type: 'image/png' }),
      `${p.number}.png`,
    );
  }
  const images = await fetch(`${base}/api/workspaces/images?title=Uploaded%20images`, {
    method: 'POST',
    body: form,
  });
  assert.equal(images.status, 201);
  assert.equal((await images.json()).status, 'ready');
  report.checks.push('Image upload and workspace creation');
  const response = await fetch(`${base}/api/workspaces/${w.id}/extract`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      metadata: {
        version: 'v1.1',
        courseId: 'demo',
        textbookId: 'demo',
        title: 'Arithmetic and Geometry',
        publisher: 'Test',
        subject: 'Mathematics',
        hasAnswer: false,
        answerHandlingMode: 'generate_brief',
      },
      mode: 'chapters',
      chapters: [{ pages: [1] }, { pages: [2] }],
    }),
  });
  assert.equal(response.status, 202);
  view = await wait();
  assert.equal(view.workspace.status, 'needs_review', view.workspace.error);
  assert.equal(view.workspace.settings.cache, 'prefix');
  assert.ok(view.chapters.every((c) => c.title));
  assert.match(view.chapters[0].title, /Arithmetic/i);
  assert.match(view.chapters[1].title, /Geometry/i);
  const questions = view.document.contents.filter((c) => c.question);
  assert.equal(questions.length, 2);
  assert.equal(new Set(questions.map((c) => c.id)).size, 2);
  assert.deepEqual(
    questions.map((c) => c.sources[0].page),
    [1, 2],
  );
  const answers = view.proposals.map((p) => p.after.question?.answer);
  assert.equal(answers.length, 2);
  assert.ok(answers.every((a) => a.origin === 'ai_generated'));
  assert.ok(answers.some((a) => /5/.test(a.text)));
  assert.ok(answers.some((a) => /12/.test(a.text)));
  report.checks.push(
    'Parallel chapters, automatic titles, ordered merge and missing-answer proposals',
  );
  const records = [];
  for (const book of await system.store.list()) {
    for (const job of book.jobs) {
      const dir = path.join(root, 'books', book.id, 'runs', job.id);
      try {
        for (const name of await fs.readdir(dir)) {
          const entry = JSON.parse(await fs.readFile(path.join(dir, name), 'utf8'));
          if (entry.usage) records.push(entry);
        }
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
  }
  report.modelCalls = records.length;
  report.cachedTokens = records.reduce((n, r) => n + (r.cache?.cachedTokens ?? 0), 0);
  assert.ok(report.cachedTokens > 0);
  report.checks.push('Provider confirms nonzero prefix-cache hits');
  report.chapters = view.chapters.map((c) => ({
    title: c.title,
    pages: c.pages,
    status: c.status,
  }));
  report.answers = answers.map((a) => ({ text: a.text, origin: a.origin }));
  report.passed = true;
  await fs.writeFile(path.join(root, 'view.json'), JSON.stringify(view, null, 2));
} catch (error) {
  report.passed = false;
  report.error = error.message;
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
  await system.app.close();
  report.finishedAt = new Date().toISOString();
  await fs.writeFile(path.join(root, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}
