import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileSeam } from '../dist/app/ai/workflows/textbook-extraction/page-seam.js';
import { contextIssues } from '../dist/app/ai/workflows/textbook-extraction/context-quality.js';
import { transcriptionProblems } from '../dist/app/modules/textbooks/domain/transcription-quality.js';
import { extractRanges } from '../dist/app/ai/workflows/textbook-extraction/extract-ranges.js';
import { checkBoundary } from '../dist/app/ai/workflows/textbook-extraction/guards.js';
import { source, question, payload, range } from './helpers.mjs';
const context = { bookId: 'book', jobId: 'job', signal: new AbortController().signal };
const content = () => ({
  ...payload(''),
  id: 'c_q',
  key: 'q',
  kind: 'question',
  sectionId: null,
  sources: [source(1, 0.3, 1)],
  question: question('7'),
});
const document = () => ({ sections: [], contents: [content()], issues: [], processedPages: [1] });
test('A closed question can reopen from next-page evidence without mutating the published snapshot', async () => {
  const original = document(),
    stage = structuredClone(original);
  const pending = await reconcileSeam(
    {
      async run(id, input, schema, pages) {
        assert.equal(input.mode, 'seam');
        assert.deepEqual(pages, [1, 2]);
        return schema.parse({
          targetKey: 'q',
          decision: 'continues',
          sources: [source(2, 0, 0.1)],
          reason: 'Final proof summary',
        });
      },
    },
    stage,
    [],
    2,
    context,
  );
  assert.equal(original.contents.length, 1);
  assert.equal(stage.contents.length, 0);
  assert.deepEqual(pending[0].sources, [source(1, 0.3, 1), source(2, 0, 0.1)]);
  assert.throws(
    () =>
      checkBoundary(
        {
          complete: [{ ...pending[0], sources: [source(1, 0.3, 1), source(2, 0.5, 1)] }],
          pending: [],
          blankPages: [],
          orphanedStarts: [],
          reason: '',
        },
        [1, 2],
        pending,
        stage,
      ),
    /Pending range was lost/,
  );
});
test('Uncertain ownership becomes a review issue and never guesses a merge', async () => {
  const stage = document();
  await reconcileSeam(
    {
      async run() {
        return {
          targetKey: 'q',
          decision: 'uncertain',
          sources: [],
          reason: 'Ambiguous paragraph',
        };
      },
    },
    stage,
    [],
    2,
    context,
  );
  assert.equal(stage.contents.length, 1);
  assert.equal(stage.issues[0].code, 'PAGE_SEAM_UNCERTAIN');
  const continuation = {
    ...payload('综上所述，极限成立。'),
    id: 'c_end',
    key: 'end',
    kind: 'paragraph',
    sectionId: null,
    sources: [source(2, 0, 0.1)],
  };
  stage.contents.push(continuation);
  assert.equal(contextIssues(stage)[0].code, 'DETACHED_CONTINUATION');
});
test('Quality checks reject corrupt math and empty headings while preserving legitimate Unicode', () => {
  const c = content();
  c.question.prompt = '$\u200b𝑙\u200b𝑖𝑐00 → ∞1121$';
  assert.match(transcriptionProblems(c).join(' '), /invisible/);
  c.question.prompt = 'α + β = 𝑥';
  assert.deepEqual(transcriptionProblems(c), []);
  c.question.prompt = String.raw`$\frac{a}{b$`;
  assert.match(transcriptionProblems(c).join(' '), /unbalanced/);
  c.question = null;
  c.kind = 'heading';
  assert.match(transcriptionProblems(c).join(' '), /empty/);
});
test('Quality defects retry only their range with field feedback; repeated defects block publication', async () => {
  const ranges = [range('title', [1], 'heading', null), range('q', [1], 'question', null)];
  let calls = [];
  const skill = {
    async run(_id, input) {
      const key = input.ranges[0].key;
      calls.push({ key, feedback: input.feedback });
      return {
        items: [
          {
            key,
            content:
              key === 'title'
                ? payload(calls.length === 1 ? '' : 'Actual title')
                : { ...payload(''), question: question('1') },
          },
        ],
        issues: [],
      };
    },
  };
  await extractRanges(
    skill,
    { ranges, excludedPending: [], feedback: '', answerMode: 'extract_visible' },
    [1],
    context,
  );
  assert.deepEqual(
    calls.map((c) => c.key),
    ['title', 'title', 'q'],
  );
  assert.match(calls[1].feedback, /Heading text is empty/);
  await assert.rejects(
    extractRanges(
      {
        async run() {
          return { items: [{ key: 'title', content: payload('') }], issues: [] };
        },
      },
      { ranges: [ranges[0]], excludedPending: [], feedback: '', answerMode: 'extract_visible' },
      [1],
      context,
    ),
    /three semantic attempts/,
  );
});

test('Explicit uncertainty remains reviewable, rather than being guessed or rejected as broken syntax', async () => {
  const { transcriptionIssues } =
    await import('../dist/app/modules/textbooks/domain/transcription-quality.js');
  const c = content();
  c.question.prompt = '无法辨认的符号【待校对】';
  assert.deepEqual(transcriptionProblems(c), []);
  assert.equal(transcriptionIssues([c])[0].severity, 'warning');
  const { contentProblems } = await import('../dist/app/modules/textbooks/domain/validation.js');
  c.question.prompt = '$\u200b𝑙\u200b𝑖𝑐00$';
  assert.deepEqual(contentProblems(c), []);
  assert.equal(transcriptionIssues([c])[0].severity, 'error');
});

test('Opening mathematical fragments remain visible but cannot silently imply a complete source', () => {
  const stage = document();
  stage.contents = [
    { ...content(), kind: 'paragraph', question: null, text: '$$\\lim_{n\\to\\infty} a_n = 0$$' },
  ];
  assert.equal(contextIssues(stage)[0].code, 'OPENING_CONTEXT_UNCERTAIN');
  stage.contents[0].text = '教材前言';
  assert.deepEqual(contextIssues(stage), []);
});

test('Resume reuses validated ranges from an interrupted page without publishing a partial document', async (t) => {
  const { fixture, run } = await import('./helpers.mjs');
  let fail = true;
  const calls = [];
  let plans = 0;
  const ranges = [
    { ...range('first', [1], 'question', null), sources: [source(1, 0.1, 0.3)] },
    { ...range('second', [1], 'question', null), sources: [source(1, 0.5, 0.8)] },
  ];
  const skills = {
    async run(id, input, schema) {
      if (id === 'textbook-structure-detect')
        return schema.parse({ sections: [], activeSectionId: null });
      if (id === 'cross-page-reconcile') {
        assert.equal(
          ++plans,
          1,
          'Resume must reuse the validated plan rather than redraw boundaries',
        );
        return schema.parse({
          complete: ranges.filter((r) => !input.processed?.some((c) => c.key === r.key)),
          pending: [],
          blankPages: [],
          orphanedStarts: [],
          reason: 'Independent questions',
        });
      }
      if (id === 'page-content-extract') {
        const key = input.ranges[0].key;
        calls.push(key);
        if (key === 'second' && fail) {
          fail = false;
          throw Error('Transient provider failure');
        }
        return schema.parse({
          items: [{ key, content: { ...payload(''), question: question(key) } }],
          issues: [],
        });
      }
      throw Error(id);
    },
  };
  const system = await fixture(t, skills, 1);
  const result = await run(system);
  assert.equal(result.job.status, 'failed');
  assert.equal(result.book.document.contents.length, 0);
  assert.deepEqual(
    result.job.stage.contents.map((c) => c.key),
    ['first'],
  );
  assert.equal(result.job.cursor, 1);
  assert.equal(result.job.pagePlan.page, 1);
  await system.jobs.resume('book', result.job.id);
  await system.jobs.wait(result.job.id);
  const final = await system.store.read('book');
  assert.deepEqual(
    final.document.contents.map((c) => c.key),
    ['first', 'second'],
  );
  assert.equal(calls.filter((c) => c === 'first').length, 1);
  assert.equal(final.jobs[0].pagePlan, null);
});
