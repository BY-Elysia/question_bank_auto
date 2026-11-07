import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import { setTimeout as delay } from 'node:timers/promises';
import { createApplication } from '../dist/app/apps/control-api/application.js';
import { CatalogTools } from '../dist/app/modules/assistant/application/tools/catalog-tools.js';
import { InteractionTools } from '../dist/app/modules/assistant/application/tools/interaction-tools.js';
import { QuestionSearch } from '../dist/app/modules/catalog/domain/catalog.js';
import { fail } from '../dist/app/shared/errors.js';
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'knowledge-test-')),
    denied = new Set();
  let handler = async () => ({ text: 'ok' });
  let app;
  const runtime = {
    history: (m) => structuredClone(m),
    async step(i) {
      const r = await handler(i);
      return {
        checkpoint: [...i.checkpoint, { role: 'assistant', content: r.text }],
        interactions: [],
        usage: { total_tokens: 2 },
        model: 'fixture',
        stop: 'complete',
        ...r,
      };
    },
  };
  app = await createApplication({
    root,
    assistantRuntime: runtime,
    catalogAccess: {
      async assertWorkspace(_principal, id) {
        if (denied.has(id)) fail(403, 'denied');
      },
    },
  });
  await app.app.listen(0, '127.0.0.1');
  t.after(async () => {
    await app.app.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  const tools = new CatalogTools(app.knowledge, new InteractionTools());
  return {
    ...app,
    root,
    denied,
    base: await app.app.getUrl(),
    setHandler: (h) => (handler = h),
    async tool(i, name, args) {
      const tool = tools.tools(i.execution).find((t) => t.name === name);
      return JSON.parse((await tool.execute(crypto.randomUUID(), args, i.signal)).text);
    },
  };
}
async function seed(f, title = '微积分教材') {
  const png = await sharp({ create: { width: 100, height: 140, channels: 3, background: 'white' } })
    .png()
    .toBuffer();
  const w = await f.workspaces.uploadImages([png, png], title);
  await f.store.update(
    w.id,
    (b) => {
      b.document.processedPages = [1, 2];
      b.document.sections = [
        {
          id: 'chapter3',
          parentId: null,
          title: '第三章 导数',
          level: 1,
          source: { page: 1, box: [0, 0, 1, 0.1] },
        },
      ];
      b.document.contents = [
        ['choice', 'single_choice', '求函数 $f(x)=x^2$ 的导数。'],
        ['proof', 'proof', '证明导数的乘积法则。'],
      ].map(([id, type, prompt], n) => ({
        id,
        key: id,
        kind: 'question',
        sectionId: 'chapter3',
        text: '',
        table: null,
        caption: null,
        sources: [
          { page: 1, box: [0, 0.2, 1, 0.5] },
          { page: 2, box: [0, 0.1, 1, 0.3] },
        ],
        question: {
          label: String(n + 1),
          type,
          prompt,
          options:
            type === 'single_choice'
              ? [
                  { id: 'A', text: '$2x$' },
                  { id: 'B', text: '$x$' },
                ]
              : [],
          children: [],
          answer: n
            ? null
            : {
                text: 'A',
                explanation: "$f'(x)=2x$",
                origin: 'ai_generated',
                review: 'pending',
                sources: [],
              },
        },
      }));
    },
    true,
  );
  return w.id;
}
async function run(f, c, text = '查找第三章选择题') {
  const r = await f.assistant.start(c.id, text, crypto.randomUUID());
  await f.assistant.wait(c.id);
  return f.assistant.run(r.id);
}

test('Authorized search, detail, verified cross-page citation and protected preview are end-to-end', async (t) => {
  const f = await fixture(t),
    id = await seed(f),
    c = await f.assistant.create();
  await f.knowledge.setScope(c.id, [id]);
  let evidence;
  f.setHandler(async (i) => {
    const search = await f.tool(i, 'search_questions', {
      query: '导数',
      section: '第三章',
      type: 'single_choice',
    });
    assert.equal(search.data.total, 1);
    assert.equal(search.data.items[0].answerOrigin, 'ai_generated');
    const q = await f.tool(i, 'get_question', search.data.items[0]);
    assert.equal(q.ok, true);
    evidence = q.data.evidence;
    return { text: `答案是 A，属于待确认的 AI 答案。[来源:${evidence.id}] [来源:e_forged]` };
  });
  const r = await run(f, c);
  assert.equal(r.status, 'completed');
  const message = (await f.assistant.get(c.id)).messages.at(-1);
  assert.equal(message.citations.length, 1);
  assert.match(message.content, /来源未验证/);
  assert.deepEqual(
    evidence.sources.map((s) => s.page),
    [1, 2],
  );
  const view = await f.knowledge.citation(c.id, evidence.id);
  assert.equal(view.status, 'current');
  assert.equal(
    (
      await fetch(
        f.base + `/api/assistant/conversations/${c.id}/citations/${evidence.id}/pages/2/image`,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await fetch(
        f.base + `/api/assistant/conversations/${c.id}/citations/${evidence.id}/pages/3/image`,
      )
    ).status,
    403,
  );
  const other = await f.assistant.create();
  await assert.rejects(f.knowledge.citation(other.id, evidence.id), (e) => e.status === 404);
  const db = await fs.stat(path.join(f.root, 'assistant', 'knowledge.sqlite'));
  assert.equal(db.mode & 0o777, 0o600);
  assert.ok(
    f.assistant
      .events(r.id, 0)
      .some((e) => e.type === 'tool_status' && e.data.status === 'completed'),
  );
});

test('Model-supplied workspace IDs cannot escape selection or account ACLs; revoked citation access fails', async (t) => {
  const f = await fixture(t),
    a = await seed(f),
    b = await seed(f, '保密资料'),
    c = await f.assistant.create();
  await f.knowledge.setScope(c.id, [a]);
  let evidence;
  f.setHandler(async (i) => {
    const bad = await f.tool(i, 'get_question', { questionRef: `${b}:1:choice:root` });
    assert.equal(bad.ok, false);
    assert.match(bad.error, /范围/);
    const good = await f.tool(i, 'get_question', { questionRef: `${a}:1:choice:root` });
    evidence = good.data.evidence;
    return { text: `读取允许的题目[来源:${evidence.id}]` };
  });
  await run(f, c);
  f.denied.add(a);
  await assert.rejects(f.knowledge.citation(c.id, evidence.id), (e) => e.status === 403);
  await assert.rejects(f.knowledge.setScope(c.id, [a, b]), (e) => e.status === 403);
  const available = await f.knowledge.query.list(f.knowledge.principalId);
  assert.ok(!available.some((w) => w.id === a));
});

test('Index refreshes after edits, detects stale addresses, filters missing answers and treats SQL characters literally', async (t) => {
  const f = await fixture(t),
    id = await seed(f),
    query = f.knowledge.query,
    p = f.knowledge.principalId;
  let r = await query.search(p, [id], QuestionSearch.parse({ type: 'proof', answer: 'missing' }));
  assert.equal(r.total, 1);
  const old = r.items[0];
  await f.store.update(
    id,
    (b) => {
      b.document.contents[1].question.prompt = '新的极限证明';
    },
    true,
  );
  await assert.rejects(query.question(p, [id], old), (e) => e.status === 409);
  r = await query.search(p, [id], QuestionSearch.parse({ query: '新的极限' }));
  assert.equal(r.total, 1);
  assert.ok(r.items[0].revision > old.revision);
  assert.equal(
    (await query.search(p, [id], QuestionSearch.parse({ query: "%' OR 1=1 --" }))).total,
    0,
  );
  const first = await query.search(p, [id], QuestionSearch.parse({ limit: 1 }));
  assert.equal(first.nextOffset, 1);
  assert.equal(
    (await query.search(p, [id], QuestionSearch.parse({ limit: 1, offset: 1 }))).nextOffset,
    null,
  );
});

test('Scope changes discard old model context and interrupted runs cannot bypass the new scope', async (t) => {
  const f = await fixture(t),
    id = await seed(f),
    c = await f.assistant.create();
  await f.knowledge.setScope(c.id, [id]);
  let inputs = [];
  f.setHandler(async (i) => {
    inputs.push(i);
    return { text: 'SECRET_CONTEXT' };
  });
  await run(f, c);
  await f.knowledge.setScope(c.id, []);
  await run(f, c, '新的问题');
  assert.ok(!JSON.stringify(inputs.at(-1).checkpoint).includes('SECRET_CONTEXT'));
  await f.knowledge.setScope(c.id, [id]);
  f.setHandler(async () => {
    throw Error('provider down');
  });
  const failed = await run(f, c);
  await f.knowledge.setScope(c.id, []);
  let invoked = false;
  f.setHandler(async () => {
    invoked = true;
    return { text: 'should not run' };
  });
  await f.assistant.resume(failed.id);
  await f.assistant.wait(c.id);
  assert.equal(invoked, false);
  assert.equal(f.assistant.run(failed.id).status, 'failed');
});

test('Citation preserves its quoted revision after editing and remains an explicit tombstone after deletion', async (t) => {
  const f = await fixture(t),
    id = await seed(f),
    c = await f.assistant.create();
  await f.knowledge.setScope(c.id, [id]);
  let evidence;
  f.setHandler(async (i) => {
    evidence = (await f.tool(i, 'get_source_excerpt', { questionRef: `${id}:1:choice:root` }))
      .data.evidence;
    return { text: `结论[来源:${evidence.id}]` };
  });
  await run(f, c);
  await f.store.update(
    id,
    (b) => {
      b.document.contents[0].question.prompt = 'edited';
    },
    true,
  );
  const changed = await f.knowledge.citation(c.id, evidence.id);
  assert.equal(changed.status, 'changed');
  assert.match(changed.citation.excerpt, /导数/);
  await f.workspaces.remove(id);
  assert.equal((await f.knowledge.citation(c.id, evidence.id)).status, 'deleted');
});

test('Scope changes are blocked during execution; cancellation and malformed parameters do not expose data', async (t) => {
  const f = await fixture(t),
    id = await seed(f),
    c = await f.assistant.create();
  await f.knowledge.setScope(c.id, [id]);
  let entered;
  const ready = new Promise((r) => (entered = r));
  f.setHandler(async (i) => {
    const bad = await f.tool(i, 'get_question', { workspaceId: '../../etc', contentId: 'x' });
    assert.equal(bad.ok, false);
    entered();
    await delay(10000, null, { signal: i.signal });
    return { text: 'done' };
  });
  const r = await f.assistant.start(c.id, '查题', 'id');
  await ready;
  await assert.rejects(f.knowledge.setScope(c.id, []), (e) => e.status === 409);
  await f.assistant.cancel(r.id);
  assert.equal(f.assistant.run(r.id).status, 'cancelled');
  await f.knowledge.setScope(c.id, []);
});

test('Canonical question references preserve root/child identity and revision across the model tool schema', async () => {
  const { questionReference, questionAddress, QuestionReference } = await import('../dist/app/modules/catalog/domain/question-reference.js');
  const { validateToolArguments } = await import('@earendil-works/pi-ai');
  const { z } = await import('zod');
  const parameters = z.toJSONSchema(z.object({ questionRef: QuestionReference }));
  for (const childIndex of [null, 0, 1]) {
    const address = { workspaceId: 'book-a', contentId: 'question-b', revision: 57, childIndex };
    const args = { questionRef: questionReference(address) };
    const parsed = validateToolArguments({name:'get_question',parameters}, {name:'get_question',arguments:args});
    assert.deepEqual(questionAddress(parsed.questionRef), address);
  }
  assert.throws(() => questionAddress('../../etc:0:x:root'));
});
