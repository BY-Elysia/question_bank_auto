import test from 'node:test';
import assert from 'node:assert/strict';
import { fillAnswers } from '../dist/app/modules/review/application/answer-workflow.js';
import { payload, question, answer, source, ScriptedSkills } from './helpers.mjs';
const context = { bookId: 'book', jobId: 'answer-test', signal: new AbortController().signal };
const leaf = (label, a) => {
  const { children, ...value } = question(label, a);
  return value;
};
const group = () => ({
  ...payload('Shared stem'),
  id: 'group',
  key: 'group',
  kind: 'question',
  sectionId: null,
  sources: [source(1), source(2)],
  question: {
    ...question('1'),
    type: 'group',
    children: [leaf('(1)', structuredClone(answer)), leaf('(2)', null)],
  },
});
test('GROUP answer completion only fills a missing child and preserves source evidence', async () => {
  const skills = new ScriptedSkills(),
    before = group();
  const result = await fillAnswers(skills, before, [1], [], context);
  assert.deepEqual(result.after.question.children[0].answer, before.question.children[0].answer);
  assert.equal(before.question.children[1].answer, null);
  assert.equal(result.after.question.children[1].answer.origin, 'ai_generated');
  assert.deepEqual(result.after.question.children[1].answer.sources, []);
  assert.deepEqual(skills.calls[0].input.targets, [1]);
});
test('Answer completion rejects non-target, duplicate and silently omitted generated answers', async () => {
  for (const targets of [[0], [1, 1], []]) {
    const skills = new ScriptedSkills();
    skills.output = () => ({
      answers: targets.map((childIndex) => ({ childIndex, text: '42', explanation: '' })),
      issues: [],
    });
    await assert.rejects(
      fillAnswers(skills, group(), [1], [], context),
      /non-target|Missing generated/,
    );
  }
});
test('Uncertain source matching blocks generation and unknown references are rejected', async () => {
  const content = group(),
    block = {
      ...payload('Appendix'),
      id: 'appendix',
      key: 'appendix',
      kind: 'answer',
      sectionId: null,
      sources: [source(3)],
    };
  const skills = new ScriptedSkills();
  skills.output = () => ({
    sourceIds: [],
    issues: [
      {
        code: 'AMBIGUOUS',
        message: 'Review source',
        page: 3,
        contentId: null,
        severity: 'warning',
      },
    ],
  });
  const result = await fillAnswers(skills, content, [1], [block], context);
  assert.equal(result.after, null);
  assert.equal(result.issues.length, 1);
  assert.equal(skills.calls.filter((c) => c.id === 'answer-generate').length, 0);
  skills.output = () => ({ sourceIds: ['unknown'], issues: [] });
  await assert.rejects(fillAnswers(skills, content, [1], [block], context), /unknown source/);
});
test('A clearly unrelated source answer is a normal miss and still allows AI completion', async () => {
  const skills = new ScriptedSkills(),
    original = skills.output.bind(skills);
  skills.output = (id, input) =>
    id === 'source-verify' ? { sourceIds: [], issues: [] } : original(id, input);
  const block = {
    ...payload('Exercise 2 answer'),
    id: 'appendix',
    key: 'appendix',
    kind: 'answer',
    sectionId: null,
    sources: [source(3)],
  };
  const result = await fillAnswers(skills, group(), [1], [block], context);
  assert.equal(result.after.question.children[1].answer.origin, 'ai_generated');
  assert.deepEqual(
    skills.calls.map((c) => c.id),
    ['source-verify', 'answer-generate'],
  );
});
test('existing source answers and newly generated answers acquire scoring in the same candidate', async () => {
  const skills = new ScriptedSkills();
  const before = group();
  const checkpoints = [];
  const result = await fillAnswers(skills, before, [0, 1], [], context, true, async (c) =>
    checkpoints.push(structuredClone(c)),
  );
  assert.deepEqual(result.after.question.children[0].answer, before.question.children[0].answer);
  assert.equal(result.after.question.children[0].grading.rubric.length, 3);
  assert.equal(result.after.question.children[1].grading.rubric.length, 3);
  assert.equal(checkpoints[0].question.children[0].grading.rubric.length, 3);
  assert.ok(skills.calls.every((c) => c.id === 'answer-generate'));
});
test('extract-visible mode completes grading for source answers but never invents a missing answer', async () => {
  const skills = new ScriptedSkills();
  const result = await fillAnswers(skills, group(), [0, 1], [], context, false);
  assert.equal(result.after.question.children[0].grading.rubric.length, 3);
  assert.equal(result.after.question.children[1].answer, null);
  assert.equal(skills.calls.length, 1);
});
test('Choice answer validation rejects invalid options for both single_choice and multiple_choice', async () => {
  const makeChoice = (type) => ({
    ...payload(''),
    id: `choice-${type}`,
    key: `choice-${type}`,
    kind: 'question',
    sectionId: null,
    sources: [source(1)],
    question: {
      ...question('1'),
      type,
      options: [
        { id: 'A', text: 'Option A' },
        { id: 'B', text: 'Option B' },
        { id: 'C', text: 'Option C' },
      ],
    },
  });
  const skillsWith = (text) => ({
    async run() {
      return {
        answers: [
          {
            childIndex: null,
            text,
            explanation: 'Choice reasoning',
            scoring: { defaultScore: 10, rubric: [] },
          },
        ],
        issues: [],
      };
    },
  });
  const invalidMulti = await fillAnswers(
    skillsWith('A, D'),
    makeChoice('multiple_choice'),
    [null],
    [],
    context,
  );
  assert.equal(invalidMulti.after, null);
  assert.equal(invalidMulti.issues[0].code, 'ANSWER_INVALID_OPTION');

  const invalidSingle = await fillAnswers(
    skillsWith('AB'),
    makeChoice('single_choice'),
    [null],
    [],
    context,
  );
  assert.equal(invalidSingle.after, null);
  assert.equal(invalidSingle.issues[0].code, 'ANSWER_INVALID_OPTION');

  const validMulti = await fillAnswers(
    skillsWith('A、C'),
    makeChoice('multiple_choice'),
    [null],
    [],
    context,
  );
  assert.equal(validMulti.after.question.answer.text, 'A、C');
  assert.equal(validMulti.issues.length, 0);
});
