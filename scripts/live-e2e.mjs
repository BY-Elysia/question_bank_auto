// Opt-in, billable model test. Credentials come only from the process environment.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createApplication } from '../dist/app/apps/control-api/application.js';
import { HttpModelClient } from '../dist/app/ai/providers/model-client.js';
import { textbookFixture } from '../test/fixtures/textbook.mjs';
if (!(process.env.MODEL_API_KEY || process.env.ARK_API_KEY))
  throw new Error('Set MODEL_API_KEY (or ARK_API_KEY) to run the opt-in live test');
const root =
  process.env.LIVE_WORKSPACE_ROOT || (await fs.mkdtemp(path.join(os.tmpdir(), 'textbook-live-')));
const report = { startedAt: new Date().toISOString(), root, calls: 0, checks: [], usage: [] };
const provider = new HttpModelClient();
const limit = Number(process.env.LIVE_MAX_CALLS ?? 40);
const deadline = Date.now() + Number(process.env.LIVE_TIMEOUT_MS ?? 1200000);
const system = await createApplication({
  root,
  model: {
    async complete(request) {
      if (Date.now() >= deadline) throw new Error('Live test deadline exceeded');
      if (++report.calls > limit) throw new Error('Live test model call budget exceeded');
      const result = await provider.complete(request);
      report.usage.push({ model: result.model, usage: result.usage });
      return result;
    },
  },
});
const timeout = setTimeout(
  () => {
    void system.jobs.shutdown();
  },
  Number(process.env.LIVE_TIMEOUT_MS ?? 1200000),
);
let bookId = process.env.LIVE_RESUME_BOOK_ID;
const check = (name) => {
  report.checks.push(name);
  console.log(JSON.stringify({ passed: name }));
};
try {
  await system.app.listen(0, '127.0.0.1');
  const base = await system.app.getUrl();
  async function request(suffix, body, method = body === undefined ? 'GET' : 'POST', status = 200) {
    const response = await fetch(`${base}/api/textbooks/${bookId}${suffix}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    assert.equal(response.status, status, `${method} ${suffix}: HTTP ${response.status}`);
    return response.json();
  }
  if (!bookId) {
    const upload = await fetch(`${base}/api/textbooks?title=Live%20Arithmetic`, {
      method: 'POST',
      headers: { 'content-type': 'application/pdf' },
      body: textbookFixture(),
    });
    assert.equal(upload.status, 201);
    const uploaded = await upload.json();
    bookId = uploaded.id;
    report.bookId = bookId;
    assert.equal(uploaded.pages.length, 2);
    check('PDF upload and page inventory');
  } else {
    assert.ok(process.env.LIVE_WORKSPACE_ROOT, 'Resuming requires LIVE_WORKSPACE_ROOT');
    report.bookId = bookId;
    report.resumed = true;
  }
  async function job(input) {
    assert.ok(Date.now() < deadline, 'Live test deadline exceeded');
    const started = await request('/jobs', input, 'POST', 202);
    let previous = '';
    for (;;) {
      assert.ok(Date.now() < deadline, 'Live test deadline exceeded');
      const current = await request(`/jobs/${started.id}`);
      if (['queued', 'running'].includes(current.status)) {
        const state = `${input.kind}: ${current.phase}, page ${current.cursor}`;
        if (state !== previous) {
          console.log(JSON.stringify({ progress: state }));
          previous = state;
        }
        await sleep(2000);
        continue;
      }
      assert.ok(
        ['completed', 'needs_review'].includes(current.status),
        `${input.kind}: ${current.status}: ${current.error}`,
      );
      return current;
    }
  }
  if (!report.resumed) await job({ kind: 'parse', generateAnswers: true });
  let book = await request('');
  assert.ok(
    book.jobs.some((j) => j.kind === 'parse' && ['completed', 'needs_review'].includes(j.status)),
  );
  await fs.writeFile(path.join(root, 'parsed.json'), JSON.stringify(book, null, 2));
  assert.deepEqual(book.document.processedPages, [1, 2]);
  assert.equal(
    book.document.issues.filter((i) => i.severity === 'error').length,
    0,
    JSON.stringify(book.document.issues),
  );
  const questions = book.document.contents.filter((c) => c.question);
  const group = questions.find((c) => c.question.type === 'group');
  assert.ok(group, 'Cross-page question must remain a GROUP');
  assert.equal(group.question.children.length, 2);
  assert.deepEqual([...new Set(group.sources.map((s) => s.page))].sort(), [1, 2]);
  assert.ok(
    group.question.children.every((c) => c.answer === null),
    'Generated answers must not publish before acceptance',
  );
  // A visible answer can be inline or a separate answer block linked by a review proposal.
  for (const proposal of book.proposals.filter(
    (p) => p.status === 'pending' && p.after.question?.answer?.origin === 'source',
  ))
    book = await request(`/proposals/${proposal.id}/decision`, {
      expectedRevision: book.revision,
      decision: 'accept',
    });
  const simple = book.document.contents.find(
    (c) => c.id !== group.id && c.question?.answer?.origin === 'source',
  );
  assert.ok(
    simple && /5/.test(simple.question.answer.text),
    'Visible answer 5 must preserve source origin',
  );
  check('Full parse, cross-page GROUP and original source answer');
  const answers = book.proposals.find((p) => p.contentId === group.id && p.status === 'pending');
  assert.ok(answers, 'Missing answers must create a proposal');
  assert.match(answers.after.question.children[0].answer.text, /12/);
  assert.match(answers.after.question.children[1].answer.text, /14/);
  assert.ok(answers.after.question.children.every((c) => c.answer.origin === 'ai_generated'));
  book = await request(`/proposals/${answers.id}/decision`, {
    expectedRevision: book.revision,
    decision: 'accept',
  });
  assert.ok(
    book.document.contents
      .find((c) => c.id === group.id)
      .question.children.every((c) => c.answer.review === 'accepted'),
  );
  check('Generated area/perimeter answers, proposal isolation and acceptance');
  await job({ kind: 'verify', contentIds: [simple.id] });
  check('Real-model source verification');
  const paragraph = book.document.contents.find((c) => c.kind === 'paragraph');
  assert.ok(paragraph);
  const changed = { ...paragraph, text: 'INCORRECT OCR SENTINEL' };
  book = await request(
    `/contents/${paragraph.id}`,
    { expectedRevision: book.revision, content: changed },
    'PATCH',
  );
  const editedRevision = book.revision;
  await request(
    `/contents/${paragraph.id}`,
    { expectedRevision: book.revision - 1, content: changed },
    'PATCH',
    409,
  );
  await job({
    kind: 'repair',
    contentIds: [paragraph.id],
    instruction:
      'Compare with the original PDF. Replace the incorrect OCR sentinel with the exact visible original text.',
  });
  book = await request('');
  const repair = book.proposals.find((p) => p.contentId === paragraph.id && p.status === 'pending');
  assert.ok(
    repair &&
      /rectangle/i.test(repair.after.text) &&
      /4/.test(repair.after.text) &&
      /3/.test(repair.after.text),
  );
  assert.equal(book.document.contents.find((c) => c.id === paragraph.id).text, changed.text);
  book = await request(`/proposals/${repair.id}/decision`, {
    expectedRevision: book.revision,
    decision: 'reject',
  });
  assert.equal(book.revision, editedRevision);
  book = await request('/restore', {
    expectedRevision: book.revision,
    revision: editedRevision - 1,
  });
  assert.equal(book.document.contents.find((c) => c.id === paragraph.id).text, paragraph.text);
  check('Manual edit, stale-write rejection, real-model repair, rejection and revision restore');
  const document = await request('/export.json');
  assert.equal(document.contents.find((c) => c.id === simple.id).question.answer.origin, 'source');
  const zipResponse = await fetch(`${base}/api/textbooks/${bookId}/export.zip`);
  assert.equal(zipResponse.status, 200);
  const zipPath = path.join(root, 'textbook.zip');
  await fs.writeFile(zipPath, Buffer.from(await zipResponse.arrayBuffer()));
  const listing = await promisify(execFile)('unzip', ['-Z1', zipPath]);
  for (const file of ['textbook.json', 'source.pdf', 'pages/1.png', 'pages/2.png'])
    assert.ok(listing.stdout.includes(file));
  for (const page of [1, 2]) {
    const response = await fetch(`${base}/api/textbooks/${bookId}/pages/${page}/image`);
    assert.equal(response.status, 200);
    assert.equal(
      Buffer.from(await response.arrayBuffer()).toString('hex', 0, 8),
      '89504e470d0a1a0a',
    );
  }
  await fs.writeFile(path.join(root, 'export.json'), JSON.stringify(document, null, 2));
  check('JSON/ZIP export and both visualization page images');
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.error = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
} finally {
  clearTimeout(timeout);
  await system.app.close();
  report.finishedAt = new Date().toISOString();
  const reportFile = path.join(root, `report-${report.startedAt.replace(/[:.]/g, '-')}.json`);
  await fs.writeFile(reportFile, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({
      passed: report.passed,
      error: report.error,
      calls: report.calls,
      report: reportFile,
    }),
  );
}
