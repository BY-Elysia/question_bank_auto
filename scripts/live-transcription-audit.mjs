// Verify fidelity independently of extraction; operate on a disposable copy of the supplied workspace.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createApplication } from '../dist/app/apps/control-api/application.js';
import { liveSkillSnapshot } from './live-skill-snapshot.mjs';
const source = process.env.LIVE_WORKSPACE_ROOT;
if (!source || !process.env.MODEL_API_KEY)
  throw new Error('Set LIVE_WORKSPACE_ROOT and MODEL_API_KEY');
const origin = JSON.parse(await fs.readFile(path.join(source, 'report.json')));
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'transcription-audit-'));
await fs.cp(
  path.join(source, 'books', origin.workspaceId),
  path.join(root, 'books', origin.workspaceId),
  { recursive: true },
);
const system = await createApplication({ root, catalog: await liveSkillSnapshot(root) });
const timer = setTimeout(() => void system.jobs.shutdown(), 240000);
const report = {
  root,
  sourceWorkspace: origin.workspaceId,
  injectedOmission: process.env.LIVE_AUDIT_DROP_RAW_TEXT === '1',
};
try {
  const book = await system.store.read(origin.workspaceId);
  const content = book.document.contents.find((c) =>
    /^(?:14|第14题)$/.test(c.question?.label ?? ''),
  );
  assert.ok(content, 'Expected question 14');
  if (report.injectedOmission)
    await system.store.update(
      book.id,
      (current) => {
        current.document.contents.find((c) => c.id === content.id).text = '';
      },
      true,
    );
  const job = await system.jobs.start(book.id, { kind: 'verify', contentIds: [content.id] });
  await system.jobs.wait(job.id);
  const result = await system.jobs.get(book.id, job.id);
  report.status = result.status;
  report.issues = result.issues;
  report.error = result.error;
  assert.ok(['completed', 'needs_review'].includes(result.status), result.error);
} catch (error) {
  report.error = error.message;
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
  await system.app.close();
  await fs.writeFile(path.join(root, 'audit-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}
