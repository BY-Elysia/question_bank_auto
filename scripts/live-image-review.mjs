import { liveSkillSnapshot } from './live-skill-snapshot.mjs';
// Opt-in source verification and repair against a completed real-image workspace.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { createApplication } from '../dist/app/apps/control-api/application.js';
const root = process.env.LIVE_WORKSPACE_ROOT;
if (!root || !process.env.MODEL_API_KEY)
  throw new Error('Set LIVE_WORKSPACE_ROOT and MODEL_API_KEY');
const previous = JSON.parse(await fs.readFile(path.join(root, 'report.json'), 'utf8'));
const id = previous.workspaceId;
const system = await createApplication({ root, catalog: await liveSkillSnapshot(root) });
const report = { checks: [], startedAt: new Date().toISOString() };
const deadline = Date.now() + 600000;
const timer = setTimeout(() => void system.jobs.shutdown(), 600000);
try {
  await system.app.listen(0, '127.0.0.1');
  const base = await system.app.getUrl();
  const url = `${base}/api/textbooks/${id}`;
  async function api(suffix = '', body, method = body ? 'POST' : 'GET', status = 200) {
    const r = await fetch(url + suffix, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    assert.equal(r.status, status);
    return r.json();
  }
  async function job(body) {
    const j = await api('/jobs', body, 'POST', 202);
    for (;;) {
      const current = await api(`/jobs/${j.id}`);
      if (!['queued', 'running'].includes(current.status)) {
        assert.ok(['completed', 'needs_review'].includes(current.status), current.error);
        return current;
      }
      assert.ok(Date.now() < deadline);
      await sleep(2000);
    }
  }
  let book = await api();
  const target = book.document.contents.find(
    (c) => c.question?.label?.replace(/[.、．]/g, '') === '18',
  );
  assert.ok(target, 'Expected question 18 from image 17');
  await job({ kind: 'verify', contentIds: [target.id] });
  report.checks.push('Real model source verification');
  book = await api();
  const before = book.revision;
  const damaged = structuredClone(target);
  damaged.question.prompt = 'E2E_CORRUPTED_PROMPT';
  damaged.text = 'E2E_CORRUPTED_PROMPT';
  book = await api(
    `/contents/${target.id}`,
    { expectedRevision: book.revision, content: damaged },
    'PATCH',
  );
  await job({
    kind: 'repair',
    contentIds: [target.id],
    instruction:
      '这道题的题干被测试覆盖为 E2E_CORRUPTED_PROMPT。请严格按原图还原题干和公式，保留原题号及可见证明，不编造。',
  });
  book = await api();
  const proposal = book.proposals.find(
    (p) =>
      p.contentId === target.id &&
      p.status === 'pending' &&
      !JSON.stringify(p.after).includes('E2E_CORRUPTED_PROMPT'),
  );
  assert.ok(proposal, 'Repair must propose original text');
  assert.match(proposal.after.question.prompt, /正整数/);
  assert.equal(
    book.document.contents.find((c) => c.id === target.id).question.prompt,
    'E2E_CORRUPTED_PROMPT',
  );
  book = await api(`/proposals/${proposal.id}/decision`, {
    expectedRevision: book.revision,
    decision: 'accept',
  });
  assert.ok(
    !JSON.stringify(book.document.contents.find((c) => c.id === target.id)).includes(
      'E2E_CORRUPTED_PROMPT',
    ),
  );
  report.checks.push('Corrupt question, real-model repair, proposal isolation and acceptance');
  book = await api('/restore', { expectedRevision: book.revision, revision: before });
  assert.deepEqual(
    book.document.contents.find((c) => c.id === target.id),
    target,
  );
  report.checks.push('Revision restoration');
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.error = error.message;
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
  await system.app.close();
  report.finishedAt = new Date().toISOString();
  await fs.writeFile(path.join(root, 'review-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}
