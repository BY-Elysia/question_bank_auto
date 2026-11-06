import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { extractionOutput } from '../dist/app/ai/workflows/textbook-extraction/output-contract.js';
import { ExtractResult } from '../dist/app/ai/workflows/textbook-extraction/contracts.js';
import { SkillRunner } from '../dist/app/ai/runtime/skill-runner.js';
import { fixture, range, question, source } from './helpers.mjs';
test('A narrow question contract retains all subquestions and source answers while the workflow assigns identity', () => {
  const contract = extractionOutput([range('q', [1])]);
  const q = question('3');
  q.type = 'group';
  q.children = [question('(1)'), question('(2)')].map(({ children, ...c }) => c);
  q.children[1].answer = {
    text: '原结论',
    explanation: '完整推导',
    sources: [{ page: 1, box: { left: 0, top: 0, right: 1000, bottom: 1000 } }],
  };
  const wire = contract.schema.parse({ question: q, issues: [] });
  const result = ExtractResult.parse(contract.decode(wire));
  assert.equal(result.items[0].key, 'q');
  assert.equal(result.items[0].content.text, '');
  assert.equal(result.items[0].content.question.children.length, 2);
  assert.equal(result.items[0].content.question.children[1].answer.origin, 'source');
  assert.equal(result.items[0].content.question.children[1].answer.review, 'pending');
  assert.ok(
    JSON.stringify(z.toJSONSchema(contract.schema)).length <
      JSON.stringify(z.toJSONSchema(ExtractResult)).length,
  );
  assert.throws(() => contract.schema.parse({ question: q, issues: [], items: [] }));
});
test('Text contracts do not ask the model to invent null question/table fields; complex batches retain the full contract', () => {
  const c = extractionOutput([range('h', [1], 'heading')]);
  assert.deepEqual(c.decode(c.schema.parse({ text: '习题5.4', issues: [] })).items[0].content, {
    text: '习题5.4',
    question: null,
    table: null,
    caption: null,
  });
  assert.equal(extractionOutput([range('table', [1], 'table')]), undefined);
  assert.equal(extractionOutput([range('a', [1]), range('b', [2])]), undefined);
});
test('Runner validates wire output, decodes it and revalidates the full business contract without relaxing retries', async (t) => {
  const system = await fixture(t);
  const records = [];
  let count = 0;
  const runner = new SkillRunner(
    system.store,
    {
      async complete(req) {
        count++;
        assert.equal(req.outputMode, 'text');
        assert.match(req.system, /顶层只输出 question/);
        return {
          text: JSON.stringify({ question: question('1'), issues: [] }),
          model: 'test',
          usage: null,
        };
      },
    },
    {
      async dataUrl() {
        throw Error('Unexpected image');
      },
    },
    {
      async get() {
        return {
          id: 'page-content-extract',
          version: 'test',
          instructions: 'Extract',
          modelRole: 'vision',
        };
      },
    },
    {
      async pin() {},
      async record(_b, _j, r) {
        records.push(r);
      },
    },
  );
  const result = await runner.run(
    'page-content-extract',
    {},
    ExtractResult,
    [],
    { bookId: 'book', jobId: 'wire', signal: new AbortController().signal },
    extractionOutput([range('q', [1])]),
  );
  assert.equal(result.items[0].key, 'q');
  assert.equal(count, 1);
  assert.equal(records[0].validationError, null);
});

test('Named integer coordinates round-trip without guessing invalid rectangles', async () => {
  const { spatialOutput, mapBoxes } =
    await import('../dist/app/ai/workflows/textbook-extraction/spatial-contract.js');
  const value = { sources: [{ page: 1, box: [0.15, 0.085, 0.79, 0.175] }] };
  assert.deepEqual(mapBoxes(mapBoxes(value, 'encode'), 'decode'), value);
  const c = spatialOutput('structure');
  assert.throws(
    () =>
      c.schema.parse({
        sections: [
          {
            id: 's',
            parentId: null,
            title: '节',
            level: 1,
            source: { page: 1, box: { left: 150, top: 850, right: 790, bottom: 175 } },
          },
        ],
        activeSectionId: 's',
      }),
    /top < bottom/,
  );
});
