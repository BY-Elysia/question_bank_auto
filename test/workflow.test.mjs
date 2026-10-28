import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, run, ScriptedSkills, source, payload, question, range } from './helpers.mjs';
import { BookStore } from '../dist/app/modules/textbooks/infrastructure/book-store.js';
import { checkBoundary, materialize } from '../dist/app/ai/workflows/textbook-extraction/guards.js';

test('Formal queue preserves a cross-page question, next chapter and all complete questions', async (t) => {
  const system = await fixture(t);
  const { book, job } = await run(system);
  assert.equal(job.status, 'completed');
  assert.equal(book.document.contents.length, 4);
  assert.deepEqual(
    book.document.contents.find((c) => c.key === 'q1').sources.map((s) => s.page),
    [1, 2],
  );
  assert.equal(book.document.contents.find((c) => c.key === 'p3').sectionId, 'sec_3_1');
  assert.deepEqual(book.document.processedPages, [1, 2, 3]);
  const firstExtract = system.skills.calls.find((c) => c.id === 'page-content-extract');
  assert.deepEqual(
    firstExtract.input.ranges.map((r) => r.key),
    ['p1'],
  );
  assert.deepEqual(firstExtract.pages, [1]);
  assert.equal(book.revision, 1);
});
test('Boundary/extractor conflict retries without dropping a later complete question', async (t) => {
  const skills = new ScriptedSkills();
  skills.missingOnce = true;
  const system = await fixture(t, skills);
  const { book, job } = await run(system);
  assert.equal(job.status, 'completed');
  assert.ok(book.document.contents.some((c) => c.key === 'q2'));
  assert.equal(
    skills.calls.filter(
      (c) => c.id === 'page-content-extract' && c.input.ranges.some((r) => r.key === 'q2'),
    ).length,
    2,
  );
});
test('Repeated extraction omissions stop before advancing the failing page', async (t) => {
  const skills = new ScriptedSkills();
  skills.missingAlways = true;
  const system = await fixture(t, skills);
  const { book, job } = await run(system);
  assert.equal(job.status, 'failed');
  assert.equal(job.cursor, 2);
  assert.equal(book.revision, 0);
  assert.equal(job.pending[0].key, 'q1');
  assert.equal(job.stage.contents.length, 1);
  skills.missingAlways = false;
  await system.jobs.resume('book', job.id);
  await system.jobs.wait(job.id);
  const resumed = await system.store.read('book');
  assert.equal(resumed.jobs[0].status, 'completed');
  assert.equal(resumed.document.contents.length, 4);
});
test('Wrong lookahead tail cannot introduce a preview-page question', async (t) => {
  const skills = new ScriptedSkills();
  skills.badPreview = true;
  const system = await fixture(t, skills);
  const { job } = await run(system);
  assert.equal(job.status, 'failed');
  assert.equal(job.cursor, 1);
  assert.equal(skills.calls.filter((c) => c.id === 'page-content-extract').length, 0);
});
test('Unclosed last-page range is preserved as a review issue rather than silently accepted', async (t) => {
  const system = await fixture(t, new ScriptedSkills(), 1);
  const { book, job } = await run(system);
  assert.equal(job.status, 'needs_review');
  assert.equal(job.pending[0].key, 'q1');
  assert.ok(book.document.issues.some((i) => i.code === 'INCOMPLETE_RANGE'));
  assert.ok(!book.document.contents.some((c) => c.key === 'q1'));
});
test('Runtime failure resumes from a durable page checkpoint without duplicate content', async (t) => {
  const skills = new ScriptedSkills();
  skills.failAt = 5;
  const system = await fixture(t, skills);
  const { job } = await run(system);
  assert.equal(job.status, 'failed');
  assert.equal(job.cursor, 2);
  const restartedStore = new BookStore(system.root);
  assert.equal((await restartedStore.read('book')).jobs[0].cursor, 2);
  skills.failAt = 0;
  await system.jobs.resume('book', job.id);
  await system.jobs.wait(job.id);
  const book = await system.store.read('book');
  assert.equal(book.document.contents.length, 4);
  assert.equal(
    skills.calls.filter((c) => c.id === 'page-content-extract' && c.input.ranges[0]?.key === 'p1')
      .length,
    1,
  );
});
test('Recovery marks running jobs interrupted and permits explicit resume', async (t) => {
  const system = await fixture(t);
  const { job } = await run(system);
  await system.store.update('book', (b) => {
    b.jobs[0].status = 'running';
  });
  await system.jobs.recover();
  assert.equal((await system.store.read('book')).jobs[0].status, 'interrupted');
  await system.jobs.resume('book', job.id);
  await system.jobs.wait(job.id);
  assert.equal((await system.store.read('book')).document.contents.length, 4);
});
test('Boundary guard rejects preview sources, lost pending ranges and fake blank pages', () => {
  const document = { sections: [{ id: 'sec_1_1' }], contents: [] };
  assert.throws(
    () =>
      checkBoundary(
        { complete: [range('q', [2])], pending: [], blankPages: [] },
        [1],
        [],
        document,
      ),
    /Lookahead/,
  );
  assert.throws(
    () =>
      checkBoundary(
        { complete: [], pending: [], blankPages: [1] },
        [1],
        [range('q', [1])],
        document,
      ),
    /lost/,
  );
  assert.throws(
    () =>
      checkBoundary(
        { complete: [range('q', [1])], pending: [], blankPages: [1] },
        [1],
        [],
        document,
      ),
    /blank/,
  );
});
test('Group content must include children; source extraction cannot invent generated answers', () => {
  const bad = { ...question('x'), type: 'group' };
  assert.throws(
    () =>
      materialize({ items: [{ key: 'q', content: { ...payload(''), question: bad } }] }, [
        range('q', [1]),
      ]),
    /children/,
  );
  bad.type = 'calculation';
  bad.answer = {
    text: 'x',
    explanation: '',
    origin: 'ai_generated',
    review: 'pending',
    sources: [],
  };
  assert.throws(
    () =>
      materialize({ items: [{ key: 'q', content: { ...payload(''), question: bad } }] }, [
        range('q', [1]),
      ]),
    /source answers/,
  );
});

test('Reparse selection expands to complete an existing cross-page block without losing untouched pages', async (t) => {
  const system = await fixture(t);
  await run(system);
  const { book, job } = await run(system, { kind: 'parse', startPage: 2, endPage: 2 });
  assert.equal(job.startPage, 1);
  assert.equal(job.endPage, 2);
  assert.equal(job.status, 'completed', job.error);
  assert.equal(book.document.contents.length, 4);
  assert.ok(book.document.contents.some((c) => c.key === 'p3'));
});
test('A newly discovered continuation extends a requested page range before committing', async (t) => {
  const system = await fixture(t);
  const { book, job } = await run(system, { kind: 'parse', startPage: 1, endPage: 1 });
  assert.equal(job.endPage, 2);
  assert.ok(book.document.contents.some((c) => c.key === 'q1'));
  assert.ok(book.document.issues.some((i) => i.code === 'UNPROCESSED_PAGE' && i.page === 3));
});
test('Cancellation aborts model work, preserves checkpoint, and active tasks block duplicate work and edits', async (t) => {
  const skills = new ScriptedSkills();
  const original = skills.run.bind(skills);
  let release, entered;
  const started = new Promise((resolve) => (entered = resolve));
  skills.run = async (...args) => {
    const context = args.at(-1);
    entered();
    await new Promise((resolve, reject) => {
      release = resolve;
      context.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    });
    return original(...args);
  };
  const system = await fixture(t, skills);
  const job = await system.jobs.start('book', { kind: 'parse' });
  await started;
  await assert.rejects(system.jobs.start('book', { kind: 'parse' }), /already active/);
  const current = await system.store.read('book');
  await assert.rejects(system.review.replace('book', 0, current.document), /active task/);
  const cancelled = await system.jobs.cancel('book', job.id);
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.cursor, 1);
  release();
  skills.run = original;
  await system.jobs.resume('book', job.id);
  await system.jobs.wait(job.id);
  assert.equal((await system.store.read('book')).jobs[0].status, 'completed');
});
test('Answer generation refuses an incompletely parsed textbook', async (t) => {
  const system = await fixture(t);
  await assert.rejects(system.jobs.start('book', { kind: 'answers' }), /entire textbook/);
  const { book, job } = await run(system, {
    kind: 'parse',
    startPage: 1,
    endPage: 1,
    generateAnswers: true,
  });
  assert.equal(job.status, 'needs_review');
  assert.equal(book.proposals.length, 0);
  assert.ok(job.issues.some((i) => i.code === 'ANSWER_GENERATION_BLOCKED'));
});

test('A cancellation signal reaches PDF rendering before any model request', async (t) => {
  const { createApplication } = await import('../dist/app/apps/control-api/application.js');
  const fs = await import('node:fs/promises');
  const os = await import('node:os');
  const path = await import('node:path');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'textbook-render-cancel-'));
  let entered;
  const started = new Promise((resolve) => (entered = resolve));
  const system = await createApplication({
    root,
    pdf: {
      async inspect() {
        return [];
      },
      async page(_file, _dir, _number, signal) {
        entered();
        await new Promise((_, reject) =>
          signal.addEventListener('abort', () => reject(new Error('Render aborted')), {
            once: true,
          }),
        );
      },
    },
    model: {
      async complete() {
        throw new Error('Model must not be reached');
      },
    },
  });
  t.after(async () => {
    await system.app.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  const now = new Date().toISOString();
  await system.store.create({
    schemaVersion: '1.0',
    id: 'book',
    title: 'Test',
    revision: 0,
    createdAt: now,
    updatedAt: now,
    pages: [{ number: 1, width: null, height: null, status: 'uploaded', blank: false }],
    document: { sections: [], contents: [], issues: [], processedPages: [] },
    jobs: [],
    proposals: [],
  });
  const job = await system.jobs.start('book', { kind: 'parse' });
  await started;
  const cancelled = await system.jobs.cancel('book', job.id);
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.cursor, 1);
});

test('A declared leading fragment remains visible and carries a missing-stem review issue', async (t) => {
  class FragmentSkills extends ScriptedSkills {
    output(id, input) {
      const result = super.output(id, input);
      if (id === 'cross-page-reconcile' && input.mode === 'boundary' && input.queue.at(-1) === 1)
        result.orphanedStarts = ['p1'];
      return result;
    }
  }
  const system = await fixture(t, new FragmentSkills());
  const { book, job } = await run(system);
  assert.equal(job.status, 'needs_review');
  assert.ok(book.document.contents.some((c) => c.key === 'p1' && c.kind === 'paragraph'));
  assert.ok(
    book.document.issues.some(
      (i) => i.code === 'MISSING_QUESTION_START' && i.page === 1 && i.contentId === 'c_p1',
    ),
  );
});
test('Orphan declarations cannot refer to unknown ranges, full questions or carried pending ranges', () => {
  const document = { sections: [], contents: [], issues: [], processedPages: [] };
  const fragment = range('frag', [1], 'paragraph', null);
  const base = {
    complete: [fragment],
    pending: [],
    blankPages: [],
    reason: '',
    orphanedStarts: ['missing'],
  };
  assert.throws(() => checkBoundary(base, [1], [], document), /orphaned/);
  assert.throws(
    () =>
      checkBoundary(
        { ...base, orphanedStarts: ['frag'], complete: [{ ...fragment, kind: 'question' }] },
        [1],
        [],
        document,
      ),
    /orphaned/,
  );
  assert.throws(
    () => checkBoundary({ ...base, orphanedStarts: ['frag'] }, [1], [fragment], document),
    /orphaned/,
  );
});

test('Partial subquestions cannot be published while another overlapping part remains pending', () => {
  const whole = {
    ...range('full', [1], 'question', null),
    sources: [{ page: 1, box: [0.1, 0.5, 0.9, 0.9] }],
  };
  const fragment = {
    ...range('partial', [1], 'question', null),
    sources: [{ page: 1, box: [0.12, 0.52, 0.51, 0.57] }],
  };
  const document = { sections: [], contents: [], issues: [], processedPages: [] };
  assert.throws(
    () =>
      checkBoundary(
        { complete: [whole], pending: [fragment], blankPages: [], orphanedStarts: [], reason: '' },
        [1],
        [],
        document,
      ),
    /overlaps complete and pending/,
  );
  const committed = { ...payload(''), ...whole, id: 'c_full', question: question('2') };
  assert.throws(
    () =>
      checkBoundary(
        { complete: [fragment], pending: [], blankPages: [], orphanedStarts: [], reason: '' },
        [1],
        [],
        { ...document, contents: [committed] },
      ),
    /already processed question/,
  );
  const separate = { ...fragment, sources: [{ page: 1, box: [0.1, 0.92, 0.9, 0.99] }] };
  assert.doesNotThrow(() =>
    checkBoundary(
      { complete: [whole], pending: [separate], blankPages: [], orphanedStarts: [], reason: '' },
      [1],
      [],
      document,
    ),
  );
});
