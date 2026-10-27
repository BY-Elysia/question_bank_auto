// Opt-in real-image integration test. Images/results stay outside the repository.
// MODEL_* credentials/configuration and LIVE_IMAGE_DIR must be set by the caller.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { createApplication } from '../dist/app/apps/control-api/application.js';
import { HttpModelClient } from '../dist/app/ai/providers/model-client.js';
if (!process.env.LIVE_IMAGE_DIR || !process.env.MODEL_API_KEY)
  throw new Error('Set LIVE_IMAGE_DIR and MODEL_API_KEY');
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'textbook-images-live-'));
const report = { root, startedAt: new Date().toISOString(), checks: [], calls: 0, cachedTokens: 0 };
const provider = new HttpModelClient();
const deadline = Date.now() + 1800000;
const system = await createApplication({
  root,
  model: {
    async complete(request) {
      assert.ok(Date.now() < deadline && report.calls < 80, 'Live test budget exceeded');
      report.calls++;
      console.log(
        JSON.stringify({
          call: report.calls,
          role: request.role,
          pages: request.images.map((p) => p.page),
        }),
      );
      const result = await provider.complete(request);
      report.cachedTokens += result.cache?.cachedTokens ?? 0;
      return result;
    },
  },
});
const timer = setTimeout(() => void system.workspaces.shutdown(), 1800000);
const check = (name) => {
  report.checks.push(name);
  console.log(JSON.stringify({ passed: name }));
};
try {
  await system.app.listen(0, '127.0.0.1');
  const base = await system.app.getUrl();
  console.log(JSON.stringify({ base, root }));
  async function api(url, body, status = 200) {
    const r = await fetch(
      base + url,
      body === undefined
        ? {}
        : {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          },
    );
    assert.equal(r.status, status, `${url}: ${r.status}`);
    return r.json();
  }
  const form = new FormData();
  for (const n of [16, 17, 18, 19])
    form.append(
      'images',
      new Blob([await fs.readFile(path.join(process.env.LIVE_IMAGE_DIR, `${n}.jpg`))], {
        type: 'image/jpeg',
      }),
      `${n}.jpg`,
    );
  const upload = await fetch(base + '/api/workspaces/images?title=Real%20textbook%20edge%20cases', {
    method: 'POST',
    body: form,
  });
  assert.equal(upload.status, 201);
  const workspace = await upload.json();
  report.workspaceId = workspace.id;
  const url = `/api/workspaces/${workspace.id}`;
  let view = await api(url);
  assert.equal(view.pages.length, 4);
  for (const p of view.pages) assert.equal((await fetch(base + p.imageUrl)).status, 200);
  check('Image upload, automatic normalization and workspace preview');
  await api(
    url + '/extract',
    {
      metadata: {
        version: 'v1.1',
        courseId: '',
        textbookId: '',
        title: '数学分析教材习题详解',
        publisher: '',
        subject: '数学分析',
        hasAnswer: true,
        answerHandlingMode: 'extract_visible',
      },
      mode: 'chapters',
      chapters: [{ pages: [1, 2] }, { pages: [3, 4] }],
      concurrency: 2,
    },
    202,
  );
  let last = '';
  do {
    await sleep(2000);
    view = await api(url);
    const state = JSON.stringify({
      status: view.workspace.status,
      chapters: view.chapters.map((c) => ({ status: c.status, cursor: c.cursor })),
    });
    if (state !== last) {
      console.log(state);
      last = state;
    }
    assert.ok(Date.now() < deadline, 'Timeout');
  } while (['preparing', 'extracting'].includes(view.workspace.status));
  await fs.writeFile(path.join(root, 'view.json'), JSON.stringify(view, null, 2));
  assert.ok(['completed', 'needs_review'].includes(view.workspace.status), view.workspace.error);
  check('Real model completes both chapter workers and merges output');
  const checks = [];
  const expect = (name, condition) => checks.push({ name, passed: Boolean(condition) });
  expect('Prefix cache hits', report.cachedTokens > 0);
  expect(
    'Second chapter automatically recognized',
    view.chapters.some((c) => /数列.*极限/.test(c.title ?? '')),
  );
  const contents = view.document.contents;
  expect('Unique merged content IDs', new Set(contents.map((c) => c.id)).size === contents.length);
  expect(
    'Global page remapping',
    contents.every((c) => c.sources.every((s) => s.page >= 1 && s.page <= 4)),
  );
  const cross = contents.filter(
    (c) => c.question && new Set(c.sources.map((s) => s.page)).size > 1,
  );
  expect(
    'Question 14 spans first chapter pages',
    cross.some(
      (c) =>
        /14/.test(c.question.label ?? '') &&
        c.sources.some((s) => s.page === 1) &&
        c.sources.some((s) => s.page === 2),
    ),
  );
  expect(
    'Question 2 spans second chapter pages with five children',
    cross.some(
      (c) =>
        /(?:^2[.、．]?$|第2题$)/.test(c.question.label ?? '') &&
        c.sources.some((s) => s.page === 3) &&
        c.sources.some((s) => s.page === 4) &&
        c.question.children.length === 5,
    ),
  );
  expect(
    'No range crosses chapter boundary',
    contents.every(
      (c) => !(c.sources.some((s) => s.page <= 2) && c.sources.some((s) => s.page >= 3)),
    ),
  );
  const exported = await api(view.exportJsonUrl);
  expect('JSON export matches reviewed workspace', exported.contents.length === contents.length);
  const zip = await fetch(base + view.exportZipUrl);
  expect('ZIP export downloads', zip.ok && (await zip.arrayBuffer()).byteLength > 1000);
  report.assertions = checks;
  report.status = view.workspace.status;
  report.contentCount = contents.length;
  report.issues = view.document.issues;
  report.chapters = view.chapters.map((c) => ({
    title: c.title,
    pages: c.pages,
    status: c.status,
  }));
  report.passed = checks.every((c) => c.passed);
  if (!report.passed) process.exitCode = 1;
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
