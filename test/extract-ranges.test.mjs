import test from 'node:test';
import assert from 'node:assert/strict';
import { extractRanges } from '../dist/app/ai/workflows/textbook-extraction/extract-ranges.js';
import { StructuredOutputError } from '../dist/app/ai/ports/skills.js';
import { range, payload, question } from './helpers.mjs';
const context = () => ({ bookId: 'book', jobId: 'job', signal: new AbortController().signal });
const input = () => ({
  ranges: [range('cross', [1, 2], 'paragraph'), range('next', [2], 'paragraph')],
  excludedPending: [range('tail', [2])],
  answerMode: 'extract_visible',
  feedback: '',
});
test('Malformed batches fall back to whole ranges, retaining cross-page evidence and excluding pending', async () => {
  const calls = [];
  const skills = {
    async run(_id, task, _schema, pages) {
      calls.push({ task, pages });
      if (task.ranges.length > 1) throw new StructuredOutputError('malformed JSON');
      return { items: [{ key: task.ranges[0].key, content: payload('source') }], issues: [] };
    },
  };
  const result = await extractRanges(skills, input(), [1, 2], context());
  assert.deepEqual(
    result.items.map((i) => i.key),
    ['cross', 'next'],
  );
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[1].pages, [1, 2]);
  assert.deepEqual(calls[2].pages, [2]);
  assert.deepEqual(calls[1].task.excludedPending, input().excludedPending);
});
test('Fallback never hides provider failures or wrong-range output', async () => {
  let calls = 0;
  await assert.rejects(
    extractRanges(
      {
        async run() {
          calls++;
          throw new Error('quota exceeded');
        },
      },
      input(),
      [1, 2],
      context(),
    ),
    /quota exceeded/,
  );
  assert.equal(calls, 1);
  await assert.rejects(
    extractRanges(
      {
        async run(_id, task) {
          if (task.ranges.length > 1) throw new StructuredOutputError('bad JSON');
          return { items: [{ key: 'tail', content: payload('wrong') }], issues: [] };
        },
      },
      input(),
      [1, 2],
      context(),
    ),
    /unexpected range/,
  );
});
test('A malformed single cross-page range fails without splitting or recursive retries', async () => {
  let calls = 0;
  const task = input();
  task.ranges = task.ranges.slice(0, 1);
  await assert.rejects(
    extractRanges(
      {
        async run() {
          calls++;
          throw new StructuredOutputError('bad JSON');
        },
      },
      task,
      [1, 2],
      context(),
    ),
    StructuredOutputError,
  );
  assert.equal(calls, 1);
});

test('Question batches preserve each complete question and request only its source pages', async () => {
  const calls = [];
  const task = input();
  task.ranges = [range('first', [1]), range('cross', [1, 2]), range('body', [2], 'paragraph')];
  const result = await extractRanges(
    {
      async run(_id, input, _schema, pages) {
        calls.push({ input, pages });
        return {
          items: input.ranges.map((r) => ({
            key: r.key,
            content: {
              ...payload(r.kind === 'question' ? '' : 'source'),
              question: r.kind === 'question' ? question(r.key) : null,
            },
          })),
          issues: [],
        };
      },
    },
    task,
    [1, 2],
    context(),
  );
  assert.deepEqual(
    calls.map((c) => c.input.ranges.map((r) => r.key)),
    [['first'], ['cross'], ['body']],
  );
  assert.deepEqual(
    calls.map((c) => c.pages),
    [[1], [1, 2], [2]],
  );
  assert.equal(result.items.length, 3);
});

test('Invalid group retries only that question and returns full source pages on retry', async () => {
  const calls = [];
  let bad = true;
  const task = input();
  task.ranges = [range('first', [1]), range('cross', [1, 2]), range('last', [2])];
  const result = await extractRanges(
    {
      async run(_id, input, _schema, pages) {
        const key = input.ranges[0].key;
        calls.push({ key, pages, feedback: input.feedback });
        const q = question(key);
        if (key === 'cross' && bad) {
          bad = false;
          q.type = 'group';
        }
        return { items: [{ key, content: { ...payload(''), question: q } }], issues: [] };
      },
    },
    task,
    [1, 2],
    context(),
  );
  assert.deepEqual(
    calls.map((c) => c.key),
    ['first', 'cross', 'cross', 'last'],
  );
  assert.match(calls[2].feedback, /Group has no children/);
  assert.deepEqual(calls[2].pages, [1, 2]);
  assert.equal(result.items.length, 3);
});
