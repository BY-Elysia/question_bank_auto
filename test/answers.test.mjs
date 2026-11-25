import test from 'node:test';
import assert from 'node:assert/strict';
import { StructuredOutputError } from '../dist/app/ai/ports/skills.js';
import { fillAnswers } from '../dist/app/modules/review/application/answer-workflow.js';
import { payload, question, answer, source, ScriptedSkills, fixture, run } from './helpers.mjs';
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
test('Extracted source answers are checkpointed even when issues exist or rubric generation fails', async (t) => {
  const block = {
    ...payload('Appendix answer'),
    id: 'appendix',
    key: 'appendix',
    kind: 'answer',
    sectionId: null,
    sources: [source(3)],
  };
  const skills = new ScriptedSkills(),
    checkpoints = [];
  skills.output = (id, input) => {
    if (id === 'source-verify' && input.mode === 'answer_lookup')
      return { sourceIds: [block.id], issues: [] };
    if (id === 'source-verify' && input.mode === 'answer_extract')
      return {
        answers: [
          {
            childIndex: 1,
            text: '6',
            explanation: 'Printed appendix proof',
            sourceIds: [block.id],
          },
        ],
        issues: [
          {
            code: 'CHECK_TAIL',
            message: 'Check minor notation',
            page: 3,
            contentId: null,
            severity: 'warning',
          },
        ],
      };
    throw new Error(`Unexpected call: ${id}`);
  };
  const filled = await fillAnswers(skills, group(), [1], [block], context, true, async (c) =>
    checkpoints.push(structuredClone(c)),
  );
  assert.equal(checkpoints.length, 1);
  assert.equal(checkpoints[0].question.children[1].answer.text, '6');
  assert.equal(filled.after.question.children[1].answer.origin, 'source');

  const s = await fixture(t);
  await run(s);
  const current = await s.store.read('book');
  const qContent = current.document.contents.find((c) => c.question && !c.question.answer);
  await s.store.update(
    'book',
    (b) => {
      b.document.contents.push({
        ...payload('Printed answer'),
        id: 'ans-block',
        key: 'ans-block',
        kind: 'answer',
        sectionId: null,
        sources: [source(2)],
      });
    },
    true,
  );
  const original = s.skills.run.bind(s.skills);
  s.skills.run = async (id, input, ...rest) => {
    if (id === 'source-verify' && input.mode === 'answer_lookup')
      return { sourceIds: ['ans-block'], issues: [] };
    if (id === 'source-verify' && input.mode === 'answer_extract')
      return {
        answers: [
          {
            childIndex: null,
            text: '9',
            explanation: 'Printed solution',
            sourceIds: ['ans-block'],
          },
        ],
        issues: [],
      };
    if (id === 'answer-generate') throw new StructuredOutputError('rubric formatting failed');
    return original(id, input, ...rest);
  };
  const { job } = await run(s, { kind: 'answers', contentIds: [qContent.id] });
  assert.equal(job.status, 'needs_review');
  const proposal = (await s.store.read('book')).proposals.find(
    (p) => p.contentId === qContent.id && p.status === 'pending',
  );
  assert.ok(proposal);
  assert.equal(proposal.after.question.answer.text, '9');
  assert.equal(proposal.after.question.answer.origin, 'source');
});
