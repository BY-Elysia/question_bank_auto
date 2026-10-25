import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { setTimeout as delay } from 'node:timers/promises';
import { createApplication } from '../dist/app/apps/control-api/application.js';
import { ExtractionSettings } from '../dist/app/modules/workspaces/domain/workspace.js';
import { partition } from '../dist/app/modules/workspaces/domain/partition.js';
import { WorkspaceViewResponse } from '../dist/app/modules/workspaces/presentation/contracts.js';
import { pdfBuffer, source, payload, question } from './helpers.mjs';
const settings = (extra = {}) =>
  ExtractionSettings.parse({
    metadata: {
      version: 'v1.1',
      courseId: 'course',
      textbookId: 'textbook',
      title: 'Mathematics',
      publisher: 'Example Press',
      subject: 'Math',
      hasAnswer: false,
      answerHandlingMode: 'leave_empty',
    },
    ...extra,
  });
const png = () =>
  sharp({ create: { width: 120, height: 160, channels: 3, background: 'white' } })
    .png()
    .toBuffer();
function fakeSkills() {
  return {
    calls: [],
    active: 0,
    peak: 0,
    failBook: null,
    async run(id, input, schema, pages, context) {
      context.signal.throwIfAborted();
      this.calls.push({ id, input, pages, bookId: context.bookId });
      if (id === 'textbook-structure-detect') {
        this.active++;
        this.peak = Math.max(this.peak, this.active);
        try {
          await delay(15, undefined, { signal: context.signal });
          if (this.failBook === context.bookId) throw new Error('Injected chapter error');
        } finally {
          this.active--;
        }
        return schema.parse({
          sections:
            input.page === 1
              ? [
                  {
                    id: 'chapter',
                    parentId: null,
                    title: `Detected ${context.bookId.slice(0, 8)}`,
                    level: 1,
                    source: source(1, 0, 0.1),
                  },
                ]
              : [],
          activeSectionId: 'chapter',
        });
      }
      if (id === 'cross-page-reconcile')
        return schema.parse(
          input.mode === 'lookahead'
            ? { tailKey: input.tail.key, continues: false, reason: 'new question' }
            : {
                complete: [
                  {
                    key: `r_${input.queue.at(-1)}`,
                    kind: 'question',
                    sectionId: 'chapter',
                    sources: [source(input.queue.at(-1))],
                    label: 'Exercise',
                  },
                ],
                pending: [],
                blankPages: [],
                reason: 'complete',
              },
        );
      if (id === 'page-content-extract')
        return schema.parse({
          items: input.ranges.map((r) => ({
            key: r.key,
            content: { ...payload('Question'), question: question('1') },
          })),
          issues: [],
        });
      if (id === 'answer-generate')
        return schema.parse({
          answers: input.targets.map((childIndex) => ({
            childIndex,
            text: '42',
            explanation: 'Steps',
          })),
          issues: [],
        });
      if (id === 'source-verify') return schema.parse({ sourceIds: [], issues: [] });
      throw new Error(id);
    },
  };
}
async function fixture(t, options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'workspace-test-'));
  const skills = options.skills ?? fakeSkills();
  const system = await createApplication({ root, skills, ...options });
  await system.app.listen(0, '127.0.0.1');
  const base = await system.app.getUrl();
  t.after(async () => {
    await system.app.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  return { ...system, root, base, skills };
}
async function upload(system, count = 2) {
  const form = new FormData();
  const buffer = await png();
  for (let i = 0; i < count; i++)
    form.append('images', new Blob([buffer], { type: 'image/png' }), `page-${i + 1}.png`);
  const response = await fetch(`${system.base}/api/workspaces/images?title=Test`, {
    method: 'POST',
    body: form,
  });
  assert.equal(response.status, 201);
  return response.json();
}
test('Image upload opens a workspace view; metadata starts extraction and merges parallel chapters without paths or ID collisions', async (t) => {
  const s = await fixture(t),
    w = await upload(s, 4);
  assert.equal(w.status, 'ready');
  assert.equal(w.totalPages, 4);
  let view = WorkspaceViewResponse.parse(
    await (await fetch(`${s.base}/api/workspaces/${w.id}`)).json(),
  );
  assert.equal(view.sourceUrl, null);
  assert.equal(view.nextStep, 'configure_extraction');
  assert.equal(view.pages.length, 4);
  for (const page of view.pages) {
    const response = await fetch(s.base + page.imageUrl);
    assert.equal(response.status, 200);
    assert.equal(
      Buffer.from(await response.arrayBuffer()).toString('hex', 0, 8),
      '89504e470d0a1a0a',
    );
  }
  const input = settings({ mode: 'chapters', chapters: [{ pages: [1, 3] }, { pages: [2, 4] }] });
  const response = await fetch(`${s.base}/api/workspaces/${w.id}/extract`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  assert.equal(response.status, 202);
  await s.workspaces.wait(w.id);
  view = WorkspaceViewResponse.parse(await s.workspaceView.get(w.id));
  assert.equal(view.workspace.status, 'completed', view.workspace.error);
  assert.equal(s.skills.peak, 2);
  assert.ok(view.chapters.every((c) => c.title.startsWith('Detected ')));
  assert.deepEqual(view.document.processedPages, [1, 2, 3, 4]);
  assert.equal(new Set(view.document.contents.map((c) => c.id)).size, 4);
  assert.deepEqual(
    view.document.contents.map((c) => c.sources[0].page),
    [1, 2, 3, 4],
  );
  for (const c of view.document.contents)
    assert.ok(view.document.sections.some((section) => section.id === c.sectionId));
  assert.ok(!JSON.stringify(view).includes(s.root));
  assert.equal((await s.books.list()).length, 0);
  assert.equal((await s.store.read(w.id)).extractionContext.metadata.publisher, 'Example Press');
  const exported = await (await fetch(s.base + view.exportJsonUrl)).json();
  assert.equal(exported.contents.length, 4);
  const zip = await fetch(s.base + view.exportZipUrl);
  assert.equal(zip.status, 200);
  assert.equal(Buffer.from(await zip.arrayBuffer()).toString('hex', 0, 2), '504b');
  assert.equal((await fetch(`${s.base}/api/textbooks/${w.id}/source`)).status, 404);
});
test('PDF workspace upload automatically renders every page before exposing extraction setup', async (t) => {
  const rendered = [];
  const pdf = {
    async inspect() {
      return [1, 2].map((number) => ({
        number,
        width: null,
        height: null,
        status: 'uploaded',
        blank: false,
      }));
    },
    async page(_pdf, directory, number) {
      rendered.push(number);
      await delay(20);
      await fs.mkdir(directory, { recursive: true });
      await fs.writeFile(path.join(directory, `${number}.png`), await png());
      return { width: 120, height: 160 };
    },
  };
  const s = await fixture(t, { pdf });
  const response = await fetch(`${s.base}/api/workspaces/pdf?title=PDF`, {
    method: 'POST',
    headers: { 'content-type': 'application/pdf' },
    body: pdfBuffer(),
  });
  assert.equal(response.status, 202);
  const w = await response.json();
  assert.equal(w.status, 'preparing');
  await assert.rejects(s.workspaces.extract(w.id, settings()), /finish image preparation/);
  await s.workspaces.wait(w.id);
  const view = await s.workspaceView.get(w.id);
  assert.equal(view.workspace.status, 'ready');
  assert.equal(view.workspace.preparedPages, 2);
  assert.deepEqual(rendered, [1, 2]);
  assert.equal(view.nextStep, 'configure_extraction');
});
test('Chapter assignment rejects missing/duplicate/unknown/reordered images and user-supplied chapter names', () => {
  for (const chapters of [
    [{ pages: [1] }, { pages: [1, 2] }],
    [{ pages: [1] }, { pages: [3] }],
    [{ pages: [1] }, { pages: [2, 5] }],
    [{ pages: [2, 1] }, { pages: [3, 4] }],
  ])
    assert.throws(() => partition(settings({ mode: 'chapters', chapters }), 4));
  assert.throws(() =>
    settings({
      mode: 'chapters',
      chapters: [{ pages: [1], title: 'Not supplied by user' }, { pages: [2] }],
    }),
  );
  assert.throws(() => settings({ metadata: { title: 'Book' } }));
});
test('Failed chapter resumes without repeating finished chapters or publishing a partial document', async (t) => {
  const s = await fixture(t),
    w = await upload(s, 2);
  const original = s.skills.run.bind(s.skills);
  let badBook;
  s.skills.run = async (id, input, schema, pages, context) => {
    if (!badBook) badBook = context.bookId;
    if (context.bookId === badBook && id === 'textbook-structure-detect')
      throw new Error('Injected chapter error');
    return original(id, input, schema, pages, context);
  };
  await s.workspaces.extract(
    w.id,
    settings({ mode: 'chapters', chapters: [{ pages: [1] }, { pages: [2] }] }),
  );
  await s.workspaces.wait(w.id);
  let state = await s.workspaces.get(w.id);
  assert.equal(state.status, 'failed');
  assert.equal((await s.store.read(w.id)).revision, 0);
  const completed = state.chapters.find((c) => c.status === 'completed');
  assert.ok(completed);
  const prior = s.skills.calls.filter((c) => c.bookId === completed.bookId).length;
  s.skills.run = original;
  await s.workspaces.resume(w.id);
  await s.workspaces.wait(w.id);
  state = await s.workspaces.get(w.id);
  assert.equal(state.status, 'completed', state.error);
  assert.equal((await s.store.read(w.id)).revision, 1);
  assert.equal(s.skills.calls.filter((c) => c.bookId === completed.bookId).length, prior);
});
test('Workspace cancellation reaches chapter jobs; locks block direct edits and duplicate jobs', async (t) => {
  const s = await fixture(t),
    w = await upload(s, 2);
  const original = s.skills.run.bind(s.skills);
  let entered;
  const ready = new Promise((resolve) => {
    entered = resolve;
  });
  s.skills.run = async (...args) => {
    entered();
    await delay(10000, undefined, { signal: args[4].signal });
    return original(...args);
  };
  await s.workspaces.extract(w.id, settings());
  await ready;
  await assert.rejects(
    s.review.replace(w.id, 0, (await s.store.read(w.id)).document),
    /workspace processing/,
  );
  await assert.rejects(s.jobs.start(w.id, { kind: 'parse' }), /Workspace is managing/);
  await s.workspaces.cancel(w.id);
  assert.equal((await s.workspaces.get(w.id)).status, 'cancelled');
  assert.equal((await s.store.read(w.id)).workflowLock, null);
  s.skills.run = original;
  await s.workspaces.resume(w.id);
  await s.workspaces.wait(w.id);
  assert.equal((await s.workspaces.get(w.id)).status, 'completed');
});
test('Original answer preferences preserve leave-empty/extract-visible and generate only when requested', async (t) => {
  for (const mode of ['leave_empty', 'extract_visible', 'generate_brief']) {
    const s = await fixture(t),
      w = await upload(s, 1);
    await s.workspaces.extract(
      w.id,
      settings({
        metadata: {
          title: 'Math',
          subject: 'Math',
          hasAnswer: mode === 'extract_visible',
          answerHandlingMode: mode,
        },
      }),
    );
    await s.workspaces.wait(w.id);
    const book = await s.store.read(w.id);
    assert.equal(book.document.contents[0].question.answer, null);
    assert.equal(book.proposals.length, mode === 'generate_brief' ? 1 : 0);
    assert.equal(
      s.skills.calls.some((c) => c.id === 'answer-generate'),
      mode === 'generate_brief',
    );
  }
});
test('Image ingestion rejects corrupt/unsupported data and preserves supplied order with normalized PNG output', async (t) => {
  const s = await fixture(t);
  await assert.rejects(
    s.workspaces.uploadImages([Buffer.from('not an image')], 'Bad'),
    /cannot be decoded/,
  );
  await assert.rejects(
    s.workspaces.uploadImages(
      [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>')],
      'Bad',
    ),
    /static PNG/,
  );
  assert.equal((await s.workspaces.list()).length, 0);
  const jpeg = await sharp({ create: { width: 300, height: 100, channels: 3, background: 'red' } })
    .jpeg()
    .toBuffer();
  const w = await s.workspaces.uploadImages([jpeg, await png()], 'Images');
  const view = await s.workspaceView.get(w.id);
  assert.deepEqual(
    view.pages.map((p) => [p.width, p.height]),
    [
      [300, 100],
      [120, 160],
    ],
  );
});
test('Real PDF upload → automatic Poppler rendering → configure → extract → workspace visualization over HTTP', async (t) => {
  const { ScriptedSkills } = await import('./helpers.mjs');
  const s = await fixture(t, { skills: new ScriptedSkills() });
  const response = await fetch(`${s.base}/api/workspaces/pdf?title=RealPDF`, {
    method: 'POST',
    headers: { 'content-type': 'application/pdf' },
    body: pdfBuffer(),
  });
  assert.equal(response.status, 202);
  const w = await response.json();
  await s.workspaces.wait(w.id);
  const view = await s.workspaceView.get(w.id);
  assert.equal(view.workspace.status, 'ready', view.workspace.error);
  for (const n of [1, 2]) {
    const bytes = await fs.readFile(path.join(s.root, 'books', w.id, 'pages', `${n}.png`));
    assert.equal(bytes.toString('hex', 0, 8), '89504e470d0a1a0a');
  }
  const start = await fetch(`${s.base}/api/workspaces/${w.id}/extract`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(settings()),
  });
  assert.equal(start.status, 202);
  await s.workspaces.wait(w.id);
  const final = WorkspaceViewResponse.parse(
    await (await fetch(`${s.base}/api/workspaces/${w.id}`)).json(),
  );
  assert.equal(final.workspace.status, 'completed', final.workspace.error);
  assert.equal(final.document.contents.length, 3);
  assert.ok(final.sourceUrl);
});
test('Deleting a workspace removes its source, chapter workers and manifest together', async (t) => {
  const s = await fixture(t),
    w = await upload(s, 2);
  await s.workspaces.extract(
    w.id,
    settings({ mode: 'chapters', chapters: [{ pages: [1] }, { pages: [2] }] }),
  );
  await s.workspaces.wait(w.id);
  assert.equal((await s.store.list()).length, 3);
  const response = await fetch(`${s.base}/api/workspaces/${w.id}`, { method: 'DELETE' });
  assert.equal(response.status, 204);
  assert.equal((await s.store.list()).length, 0);
  assert.equal((await s.workspaces.list()).length, 0);
  assert.equal((await fetch(`${s.base}/api/workspaces/${w.id}`)).status, 404);
});
test('A restarted backend resumes the workspace and chapter checkpoint without duplicating results', async (t) => {
  const s = await fixture(t),
    w = await upload(s, 2);
  let entered;
  const ready = new Promise((r) => {
    entered = r;
  });
  const original = s.skills.run.bind(s.skills);
  s.skills.run = async (...args) => {
    entered();
    await delay(10000, undefined, { signal: args[4].signal });
    return original(...args);
  };
  await s.workspaces.extract(w.id, settings());
  await ready;
  await s.app.close();
  assert.equal((await s.workspaces.get(w.id)).status, 'interrupted');
  const restarted = await createApplication({ root: s.root, skills: fakeSkills() });
  t.after(() => restarted.app.close());
  await restarted.workspaces.resume(w.id);
  await restarted.workspaces.wait(w.id);
  const final = await restarted.workspaceView.get(w.id);
  assert.equal(final.workspace.status, 'completed', final.workspace.error);
  assert.equal(final.document.contents.length, 2);
  assert.equal(final.revision, 1);
});
test('Legacy form metadata reaches model requests as data, with default prefix caching and shared workspace scope', async (t) => {
  const { ScriptedSkills } = await import('./helpers.mjs');
  const scripted = new ScriptedSkills(),
    requests = [];
  const model = {
    async complete(request) {
      requests.push(request);
      const id = request.system.match(/^name: (.+)$/m)[1];
      return {
        text: JSON.stringify(scripted.output(id, request.input.task)),
        usage: null,
        model: 'test',
      };
    },
  };
  const s = await fixture(t, { skills: undefined, model }),
    w = await upload(s, 2);
  await s.workspaces.extract(w.id, settings({ instructions: 'User-specific extraction note' }));
  await s.workspaces.wait(w.id);
  assert.equal((await s.workspaces.get(w.id)).status, 'completed');
  assert.ok(requests.length > 0);
  assert.ok(requests.every((r) => r.cache === 'prefix' && r.cacheScope === w.id));
  assert.ok(
    requests.every(
      (r) =>
        r.input.context.metadata.publisher === 'Example Press' &&
        r.input.context.instructions === 'User-specific extraction note',
    ),
  );
  assert.ok(requests.every((r) => !r.system.includes('User-specific extraction note')));
});
test('Restart clears a stale root lock after terminal status was already persisted', async (t) => {
  const s = await fixture(t),
    w = await upload(s, 1);
  await s.workspaces.extract(w.id, settings());
  await s.workspaces.wait(w.id);
  await s.store.update(w.id, (book) => {
    book.workflowLock = w.id;
  });
  await s.workspaces.recover();
  const view = WorkspaceViewResponse.parse(await s.workspaceView.get(w.id));
  assert.equal(view.actions.review, true);
  assert.equal(view.actions.export, true);
  await s.store.update(w.id, (book) => {
    book.jobs.push({
      id: 'verification',
      kind: 'verify',
      status: 'needs_review',
      request: { kind: 'verify' },
      phase: 'review',
      baseRevision: book.revision,
      cursor: 1,
      startPage: 1,
      endPage: 1,
      pending: [],
      activeSectionId: null,
      stage: null,
      processedIds: [],
      issues: [
        {
          code: 'CHECK_SOURCE',
          severity: 'warning',
          page: 1,
          contentId: null,
          message: 'Check source',
        },
      ],
      error: null,
      createdAt: book.createdAt,
      updatedAt: book.updatedAt,
      events: [],
    });
  });
  const reviewed = WorkspaceViewResponse.parse(await s.workspaceView.get(w.id));
  assert.equal(reviewed.jobs[0].issues[0].message, 'Check source');
  assert.equal('stage' in reviewed.jobs[0], false);
});
