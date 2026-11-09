import { scoringFor } from './helpers.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { answerOutput } from '../dist/app/modules/review/application/answer-output.js';
import { fillAnswers } from '../dist/app/modules/review/application/answer-workflow.js';
import { StructuredOutputError } from '../dist/app/ai/ports/skills.js';
import { SkillRunner } from '../dist/app/ai/runtime/skill-runner.js';
import { fixture, run, question, payload, source } from './helpers.mjs';
const context = { bookId: 'book', jobId: 'test', signal: new AbortController().signal };
const envelope = String.raw`<<<ANSWER>>>
$\xi$ 存在
<<<EXPLANATION>>>
取 $F(x)=f(x)\sin x$，由罗尔定理 $F'(\xi)=0$。
<<<END>>>`;
test('Answer envelope accepts literal LaTeX and rejects padding, missing closure and duplicate sections', () => {
  const contract = answerOutput(2);
  const value = contract.parseText(envelope);
  assert.ok(value.explanation.includes('\\sin'));
  assert.equal(contract.decode(value).answers[0].childIndex, 2);
  for (const raw of [
    envelope.replace('<<<END>>>', ''),
    envelope + '\n<<<END>>>',
    envelope.replace('<<<EXPLANATION>>>', '<<<ANSWER>>>'),
    envelope + '\n'.repeat(30),
  ])
    assert.throws(() => contract.parseText(raw));
  assert.equal(
    contract.decode(contract.parseText('<<<ISSUE>>>\n导数符号与原图不一致。\n<<<END>>>')).answers
      .length,
    0,
  );
});
test('Answer requests use one bounded text call and always retain original output without images or credentials in trace', async (t) => {
  const s = await fixture(t);
  const records = [];
  let calls = 0;
  const runner = new SkillRunner(
    s.store,
    {
      async complete(request) {
        calls++;
        assert.equal(request.structuredOutput, undefined);
        assert.equal(request.maxOutputTokens, 4096);
        assert.ok(!request.system.includes('JSON Schema'));
        return { text: envelope, model: 'stub', usage: null, completionStatus: 'completed' };
      },
    },
    {
      async dataUrl() {
        return 'data:image/png;base64,abc';
      },
    },
    {
      async get() {
        return {
          id: 'answer-generate',
          version: '2',
          instructions: 'Use envelope',
          modelRole: 'reasoning',
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
  const { AnswerResult } =
    await import('../dist/app/ai/workflows/textbook-extraction/contracts.js');
  const r = await runner.run('answer-generate', {}, AnswerResult, [1], context, answerOutput(null));
  assert.equal(calls, 1);
  assert.equal(r.answers[0].childIndex, null);
  assert.equal(records[0].trace.rawOutput, envelope);
  assert.ok(!JSON.stringify(records).includes('base64'));
});
test('One leaf format failure does not discard completed leaves or prevent later targets', async () => {
  const q = {
    ...question('1'),
    type: 'group',
    children: [0, 1, 2].map((i) => {
      const { children, ...leaf } = question(String(i + 1));
      return leaf;
    }),
  };
  const c = {
    ...payload(''),
    id: 'c',
    key: 'c',
    kind: 'question',
    sectionId: null,
    sources: [source(1)],
    question: q,
  };
  const saved = [],
    calls = [];
  const result = await fillAnswers(
    {
      async run(_id, input) {
        const i = input.targets[0];
        calls.push(i);
        assert.equal(input.content.question.children.length, 0);
        assert.equal(input.sharedPrompt, q.prompt);
        if (i === 1) throw new StructuredOutputError('broken');
        return {
          answers: [{ childIndex: i, text: '42', explanation: 'Steps', scoring: scoringFor() }],
          issues: [],
        };
      },
    },
    c,
    [0, 1, 2],
    [],
    context,
    true,
    async (after) => saved.push(structuredClone(after)),
  );
  assert.deepEqual(calls, [0, 1, 2]);
  assert.equal(saved.length, 2);
  assert.equal(saved[0].question.children[0].answer.text, '42');
  assert.equal(result.after.question.children[1].answer, null);
  assert.equal(result.after.question.children[2].answer.text, '42');
  assert.equal(result.issues[0].code, 'ANSWER_FORMAT_FAILED');
});
test('Repeating answer job reuses pending candidates instead of paying to regenerate them', async (t) => {
  const s = await fixture(t);
  await run(s, { kind: 'parse', generateAnswers: true });
  const before = (await s.store.read('book')).proposals;
  await run(s, { kind: 'answers' });
  assert.deepEqual((await s.store.read('book')).proposals, before);
});
test('Old answer task upgrades to a new pinned run while retaining unchanged progress', async (t) => {
  const s = await fixture(t);
  await run(s);
  const job = await s.jobs.start('book', { kind: 'answers' });
  await s.jobs.wait(job.id);
  await s.store.update('book', (b) => {
    const j = b.jobs.find((x) => x.id === job.id);
    j.status = 'failed';
    j.answerWorkflowVersion = 1;
  });
  const before = await s.store.read('book');
  const resumed = await s.jobs.resume('book', job.id);
  await s.jobs.wait(resumed.id);
  const b = await s.store.read('book');
  assert.notEqual(resumed.id, job.id);
  assert.equal(b.jobs.find((j) => j.id === job.id).supersededBy, resumed.id);
  assert.deepEqual(b.proposals, before.proposals);
  assert.equal(resumed.answerWorkflowVersion, 3);
});
test('Editing a failed task input invalidates only that checkpoint on resume', async (t) => {
  const s = await fixture(t);
  await run(s);
  const { job } = await run(s, { kind: 'answers' });
  await s.store.update('book', (b) => {
    b.jobs.find((j) => j.id === job.id).status = 'failed';
  });
  const before = await s.store.read('book');
  const content = structuredClone(before.document.contents.find((c) => c.question));
  content.question.prompt += ' corrected condition';
  await s.review.edit('book', before.revision, content.id, content);
  const resumed = await s.jobs.resume('book', job.id);
  assert.notEqual(resumed.id, job.id);
  assert.ok(!resumed.processedIds.includes(content.id));
  assert.ok(resumed.processedIds.length > 0);
  await s.jobs.wait(resumed.id);
  assert.equal((await s.jobs.get('book', resumed.id)).status, 'needs_review');
});
test('Cancellation after a saved group leaf resumes only missing leaves', async (t) => {
  const s = await fixture(t);
  await run(s);
  const b = await s.store.read('book');
  const c = structuredClone(b.document.contents.find((c) => c.question));
  c.question = {
    ...question('1'),
    type: 'group',
    children: [0, 1, 2].map((i) => {
      const { children, ...leaf } = question(String(i + 1));
      return leaf;
    }),
  };
  await s.review.edit('book', b.revision, c.id, c);
  const original = s.skills.run.bind(s.skills),
    calls = [];
  let interrupt = true;
  s.skills.run = async (id, input, ...rest) => {
    if (id === 'answer-generate') {
      calls.push(input.targets[0]);
      if (interrupt && input.targets[0] === 1) throw new Error('Simulated process interruption');
    }
    return original(id, input, ...rest);
  };
  const { job } = await run(s, { kind: 'answers', contentIds: [c.id] });
  assert.equal(job.status, 'failed');
  const saved = (await s.store.read('book')).proposals.find((p) => p.contentId === c.id);
  assert.ok(saved.after.question.children[0].answer);
  interrupt = false;
  await s.jobs.resume('book', job.id);
  await s.jobs.wait(job.id);
  assert.deepEqual(calls, [0, 1, 1, 2]);
  const final = (await s.store.read('book')).proposals.filter((p) => p.contentId === c.id);
  assert.equal(final.length, 1);
  assert.equal(final[0].id, saved.id);
  assert.ok(final[0].after.question.children.every((q) => q.answer));
});

test('Derivation-first answers decode without guessed-answer anchoring; repeated draft corrections are rejected', () => {
  const c = answerOutput(2);
  const output = String.raw`<<<EXPLANATION>>>
洛必达法则给出 $\lim_{x\to0}\frac{1}{3(1+x^2)}=\frac{1}{3}$。
<<<ANSWER>>>
$\frac{1}{3}$
<<<END>>>`;
  assert.equal(c.decode(c.parseText(output)).answers[0].text, String.raw`$\frac{1}{3}$`);
  const draft = output.replace('洛必达法则', '不对，等下，我之前错记了，重新来。洛必达法则');
  assert.throws(() => c.parseText(draft), /self-correction/);
});
test('combined answer envelope requires three scoring points, while objective answers require NONE', () => {
  const raw =
    '<<<EXPLANATION>>>\n推导结果为2。\n<<<ANSWER>>>\n2\n<<<RUBRIC>>>\n3 | 根据已知条件建立计算式\n4 | 代入数值完成关键计算\n3 | 得到结果并验证条件成立\n<<<END>>>';
  const c = answerOutput(null, { required: true, defaultScore: 10 });
  const decoded = c.decode(c.parseText(raw));
  assert.equal(decoded.answers[0].scoring.rubric.length, 3);
  assert.throws(() => c.parseText(envelope));
  const objective = answerOutput(null, { required: false, defaultScore: 10 });
  assert.deepEqual(
    objective.decode(objective.parseText(raw.replace(/3 \|[\s\S]*?<<<END>>>/, 'NONE\n<<<END>>>')))
      .answers[0].scoring.rubric,
    [],
  );
});
