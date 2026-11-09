import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createApplication } from '../dist/app/apps/control-api/application.js';
import { ScriptedSkills, pdfBuffer } from './helpers.mjs';
const exec = promisify(execFile);

test('Real PDF → lazy PNG → model instructions → job → proposal → accepted JSON and ZIP over HTTP', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'textbook-http-'));
  const scripted = new ScriptedSkills();
  const requests = [];
  let malformed = true;
  const model = {
    async complete(request) {
      requests.push(request);
      const id = request.system.match(/^name: (.+)$/m)[1];
      if (malformed) {
        malformed = false;
        return { text: 'not JSON', usage: null, model: 'test-vision' };
      }
      return {
        text:
          id === 'rubric-generate'
            ? '<<<RUBRIC>>>\n3 | 正确代入本题的已知数值与计算条件\n4 | 完成算术推导并给出本题最后的计算结果\n3 | 写出本题计算结果并验证成立\n<<<END>>>'
            : id === 'answer-generate'
              ? '<<<ANSWER>>>\n42\n<<<EXPLANATION>>>\nSteps\n<<<RUBRIC>>>\n3 | 根据题设条件确定计算表达式\n4 | 根据数值完成本题关键计算\n3 | 得到最后结果并验证符合条件\n<<<END>>>'
              : JSON.stringify(scripted.wireOutput(id, request.input.task, request.system)),
        usage: { total_tokens: 10 },
        model: 'test-vision',
      };
    },
  };
  const system = await createApplication({ root, model });
  await system.app.listen(0, '127.0.0.1');
  const base = await system.app.getUrl();
  t.after(async () => {
    await system.app.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  const upload = await fetch(`${base}/api/textbooks?title=Physics`, {
    method: 'POST',
    headers: { 'content-type': 'application/pdf' },
    body: pdfBuffer(),
  });
  assert.equal(upload.status, 201);
  const book = await upload.json();
  assert.equal(book.pages.length, 2);
  assert.equal(book.pages[0].status, 'uploaded');
  const image = await fetch(`${base}/api/textbooks/${book.id}/pages/1/image`);
  assert.equal(image.status, 200);
  assert.equal(Buffer.from(await image.arrayBuffer()).toString('hex', 0, 8), '89504e470d0a1a0a');
  const start = await fetch(`${base}/api/textbooks/${book.id}/jobs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind: 'parse', generateAnswers: true }),
  });
  assert.equal(start.status, 202);
  const job = await start.json();
  await system.jobs.wait(job.id);
  const state = await (await fetch(`${base}/api/textbooks/${book.id}`)).json();
  assert.equal(state.jobs[0].status, 'needs_review', state.jobs[0].error);
  assert.equal(state.document.contents.length, 3);
  assert.equal(state.pages[1].status, 'processed');
  assert.equal(state.proposals.length, 2);
  assert.ok(requests.some((r) => r.input.validationFeedback.includes('未通过')));
  assert.ok(
    requests.every((r) => r.system.includes('JSON Schema') || r.system.includes('<<<ANSWER>>>')),
  );
  assert.ok(
    requests.some(
      (r) => r.images.length === 2 && r.images[0].url.startsWith('data:image/png;base64,'),
    ),
  );
  let revision = state.revision;
  for (const proposal of state.proposals) {
    const decision = await fetch(
      `${base}/api/textbooks/${book.id}/proposals/${proposal.id}/decision`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ expectedRevision: revision, decision: 'accept' }),
      },
    );
    assert.equal(decision.status, 200);
    revision = (await decision.json()).revision;
  }
  const exported = await (await fetch(`${base}/api/textbooks/${book.id}/content.json`)).json();
  assert.equal(
    exported.contents.find((c) => c.key === 'q1').question.answer.origin,
    'ai_generated',
  );
  assert.equal(exported.pendingProposalCount, 0);
  assert.equal((await fetch(`${base}/api/textbooks/${book.id}/export.json`)).status, 200);
  const prepared = await (
    await fetch(`${base}/api/textbooks/${book.id}/export/prepare`, { method: 'POST' })
  ).json();
  assert.equal(prepared.ready, true);
  assert.equal(prepared.jobId, null);
  const zipped = await fetch(`${base}/api/textbooks/${book.id}/export.zip`);
  assert.equal(zipped.status, 200);
  const zipPath = path.join(root, 'test.zip');
  await fs.writeFile(zipPath, Buffer.from(await zipped.arrayBuffer()));
  const listing = await exec('unzip', ['-Z1', zipPath]);
  for (const name of ['textbook.json', 'source.pdf', 'pages/1.png', 'pages/2.png'])
    assert.ok(listing.stdout.includes(name));
  const logs = await fs.readdir(path.join(root, 'books', book.id, 'runs', job.id));
  assert.ok(logs.includes('page-content-extract.json'));
  assert.equal(
    (
      await fetch(`${base}/api/textbooks/${book.id}/jobs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"kind":"exam-compose"}',
      })
    ).status,
    400,
  );
  assert.equal((await fetch(`${base}/api/textbooks/${book.id}/pages/99/image`)).status, 404);
  assert.equal((await fetch(`${base}/api/library`)).status, 404);
  assert.equal(
    (
      await fetch(`${base}/api/textbooks/${book.id}/restore`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"expectedRevision":0,"revision":0}',
      })
    ).status,
    409,
  );
  for (const suffix of [
    '/api/health',
    '/api/textbooks',
    `/api/textbooks/${book.id}/source`,
    `/api/textbooks/${book.id}/document`,
    `/api/textbooks/${book.id}/jobs`,
    `/api/textbooks/${book.id}/jobs/${job.id}`,
    `/api/textbooks/${book.id}/revisions`,
  ]) {
    const response = await fetch(`${base}${suffix}`);
    assert.equal(response.status, 200, suffix);
    await response.arrayBuffer();
  }
  assert.equal(
    (await fetch(`${base}/api/textbooks/${book.id}/validate`, { method: 'POST' })).status,
    200,
  );
  assert.equal(
    (
      await fetch(`${base}/api/textbooks/${book.id}/jobs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{bad',
      })
    ).status,
    400,
  );
  const remove = await fetch(`${base}/api/textbooks/${book.id}`, { method: 'DELETE' });
  assert.equal(remove.status, 204);
  assert.equal((await fetch(`${base}/api/textbooks/${book.id}`)).status, 404);
});
