import test from 'node:test';
import assert from 'node:assert/strict';
import { extractRanges } from '../dist/app/ai/workflows/textbook-extraction/extract-ranges.js';
import { StructuredOutputError } from '../dist/app/ai/ports/skills.js';
import { range, payload } from './helpers.mjs';
const context = () => ({ bookId: 'book', jobId: 'job', signal: new AbortController().signal });
const input = () => ({
  ranges: [range('cross', [1, 2]), range('next', [2])],
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
