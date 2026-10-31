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
