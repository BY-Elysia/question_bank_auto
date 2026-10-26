// Isolated test server: real HTTP, repositories and PDF rendering; deterministic model outputs.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { createApplication } from '../../dist/app/apps/control-api/application.js';
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'textbook-web-e2e-'));
process.env.WEB_ROOT = fileURLToPath(new URL('../dist', import.meta.url));
const source = (p, box = [0.08, 0.2, 0.92, 0.43]) => ({ page: p, box });
let system;
const skills = {
  async run(id, input, schema, pages, context) {
    const book = await system.store.read(context.bookId);
    await delay(book.title.includes('恢复') ? 1200 : 120, undefined, { signal: context.signal });
    if (id === 'textbook-structure-detect')
      return schema.parse({
        sections:
          input.page === 1
            ? [
                {
                  id: 'chapter',
                  parentId: null,
                  title: '第一章 · 基础数学',
                  level: 1,
                  source: source(1, [0.08, 0.05, 0.9, 0.15]),
                },
              ]
            : [],
        activeSectionId: 'chapter',
      });
    if (id === 'cross-page-reconcile')
      return schema.parse(
        input.mode === 'lookahead'
          ? { tailKey: input.tail.key, continues: false, reason: '完整题目' }
          : {
              complete: [
                {
                  key: `q_${input.queue.at(-1)}`,
                  kind: 'question',
                  sectionId: 'chapter',
                  sources: [source(input.queue.at(-1))],
                  label: '练习',
                },
              ],
              pending: [],
              blankPages: [],
              reason: '完整题目',
            },
      );
    if (id === 'page-content-extract')
      return schema.parse({
        items: input.ranges.map((r) => ({
          key: r.key,
          content: {
            text: '',
            question: {
              label: r.key.split('_')[1],
              type: 'calculation',
              prompt: '已知 $f(x)=2x+3$，求 $f(4)$ 的值。',
              options: [],
              answer: null,
              children: [],
            },
            table: null,
            caption: null,
          },
        })),
        issues: [],
      });
    if (id === 'answer-generate')
      return schema.parse({
        answers: input.targets.map((childIndex) => ({
          childIndex,
          text: '11',
          explanation: '将 $x=4$ 代入，得 $2\\times4+3=11$。',
        })),
        issues: [],
      });
    if (id === 'content-repair')
      return schema.parse({
        content: {
          text: input.content.text,
          question: { ...input.content.question, prompt: '修复后的题干：求函数值。' },
          table: null,
          caption: null,
        },
        issues: [],
      });
    if (id === 'source-verify')
      return schema.parse(
        input.mode === 'answer_lookup'
          ? { sourceIds: [], issues: [] }
          : {
              issues: [
                {
                  code: 'CHECK',
                  severity: 'warning',
                  page: pages[0],
                  contentId: input.content.id,
                  message: '请核对函数中的常数项。',
                },
              ],
            },
      );
    throw Error('Unknown test skill');
  },
};
system = await createApplication({ root, skills });
await system.app.listen(Number(process.env.TEST_PORT ?? 5191), '127.0.0.1');
console.log('Isolated frontend test server ready');
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, async () => {
    await system.app.close();
    await fs.rm(root, { recursive: true, force: true });
    process.exit(0);
  });
