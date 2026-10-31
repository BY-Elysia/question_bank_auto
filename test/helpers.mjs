import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApplication } from '../dist/app/apps/control-api/application.js';
export const source = (page, top = 0, bottom = 1) => ({ page, box: [0, top, 1, bottom] });
export const payload = (text) => ({ text, question: null, table: null, caption: null });
export const question = (label, answer = null) => ({
  label,
  type: 'calculation',
  prompt: `Compute ${label}`,
  options: [],
  answer,
  children: [],
});
export const range = (key, pages, kind = 'question', sectionId = 'sec_1_1') => ({
  key,
  kind,
  sectionId,
  sources: pages.map((p) => source(p)),
  label: key,
});
export const answer = {
  text: '2',
  explanation: 'Original explanation',
  origin: 'source',
  review: 'pending',
  sources: [source(2)],
};
export class ScriptedSkills {
  calls = [];
  failAt = 0;
  missingOnce = false;
  missingAlways = false;
  badPreview = false;
  async run(id, input, schema, pages, context) {
    context.signal.throwIfAborted();
    this.calls.push({ id, input, pages });
    if (this.failAt && this.calls.length === this.failAt)
      throw new Error('Injected provider failure');
    return schema.parse(this.output(id, input));
  }
  output(id, input) {
    if (id === 'textbook-structure-detect')
      return {
        sections:
          input.page === 1
            ? [
                {
                  id: 'sec_1_1',
                  parentId: null,
                  title: 'Chapter 1',
                  level: 1,
                  source: source(1, 0, 0.1),
                },
              ]
            : input.page === 3
              ? [
                  {
                    id: 'sec_3_1',
                    parentId: null,
                    title: 'Chapter 2',
                    level: 1,
                    source: source(3, 0, 0.1),
                  },
                ]
              : [],
        activeSectionId: input.page === 3 ? 'sec_3_1' : 'sec_1_1',
      };
    if (id === 'cross-page-reconcile') {
      if (input.mode === 'seam')
        return {
          targetKey: input.previous.key,
          decision: 'independent',
          sources: [],
          reason: 'New content',
        };
      if (input.mode === 'lookahead')
        return {
          tailKey: this.badPreview ? 'wrong' : input.tail.key,
          continues: input.tail.key === 'q1' && input.previewPage === 2,
          reason: 'Checked tail',
        };
      const p = input.queue.at(-1);
      if (p === 1)
        return {
          complete: [range('p1', [1], 'paragraph')],
          pending: [range('q1', [1])],
          blankPages: [],
          reason: 'Q1 continues',
        };
      if (p === 2)
        return {
          complete: [range('q1', [1, 2]), range('q2', [2])],
          pending: [],
          blankPages: [],
          reason: 'Both questions complete',
        };
      return {
        complete: [range('p3', [3], 'paragraph', 'sec_3_1')],
        pending: [],
        blankPages: [],
        reason: 'Next chapter',
      };
    }
    if (id === 'page-content-extract') {
      let ranges = input.ranges;
      if (this.missingAlways || (this.missingOnce && ranges.some((r) => r.key === 'q2'))) {
        this.missingOnce = false;
        ranges = ranges.filter((r) => r.key !== 'q2');
      }
      return {
        items: ranges.map((r) => ({
          key: r.key,
          content: {
            ...payload(r.kind === 'paragraph' ? 'Body text' : ''),
            question:
              r.kind === 'question' ? question(r.key, r.key === 'q2' ? answer : null) : null,
          },
        })),
        issues: [],
      };
    }
    if (id === 'answer-generate')
      return {
        answers: input.targets.map((childIndex) => ({
          childIndex,
          text: '42',
          explanation: 'Steps',
        })),
        issues: [],
      };
    if (id === 'content-repair')
      return {
        content: { ...payload('Corrected text'), question: input.content.question },
        issues: [],
      };
    if (id === 'source-verify' && input.mode === 'source_transcribe')
      return { blocks: [{ page: input.sources[0].page, text: 'Original explanation' }] };
    if (id === 'source-verify' && input.mode === 'transcription_audit')
      return {
        checks: [
          {
            page: input.content.sources[0].page,
            sourceText: 'Original explanation',
            extractedText: 'Original explanation',
            verdict: 'matched',
          },
        ],
      };
    if (id === 'source-verify') return { issues: [] };
    throw new Error(id);
  }
}
export async function fixture(t, skills = new ScriptedSkills(), pages = 3) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'textbook-test-'));
  const system = await createApplication({ root, skills });
  const now = new Date().toISOString();
  await system.store.create({
    schemaVersion: '1.0',
    id: 'book',
    title: 'Test',
    revision: 0,
    createdAt: now,
    updatedAt: now,
    pages: Array.from({ length: pages }, (_, i) => ({
      number: i + 1,
      width: 100,
      height: 100,
      status: 'ready',
      blank: false,
    })),
    document: { sections: [], contents: [], issues: [], processedPages: [] },
    jobs: [],
    proposals: [],
  });
  t.after(async () => {
    await system.app.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  return { ...system, root, skills };
}
export async function run(system, request = { kind: 'parse' }) {
  const job = await system.jobs.start('book', request);
  await system.jobs.wait(job.id);
  const book = await system.store.read('book');
  return { book, job: book.jobs.find((j) => j.id === job.id) };
}
export function pdfBuffer(count = 2) {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', ''];
  const kids = [];
  for (let i = 0; i < count; i++) {
    const page = objects.length + 1,
      stream = page + 1;
    kids.push(`${page} 0 R`);
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Contents ${stream} 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >>`,
    );
    const text = `BT /F1 16 Tf 20 360 Td (Page ${i + 1}: question content) Tj ET`;
    objects.push(`<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`);
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${count} >>`;
  let result = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(result));
    result += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(result);
  result += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) result += `${String(offset).padStart(10, '0')} 00000 n \n`;
  result += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(result);
}
