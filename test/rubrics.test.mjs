import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, run, ScriptedSkills } from './helpers.mjs';
import {
  gradingBasis,
  currentGrading,
  scoringTargets,
  scoringReadiness,
  Scoring,
} from '../dist/app/modules/textbooks/domain/grading.js';
import { rubricOutput } from '../dist/app/modules/review/application/rubric-output.js';
import { questionBankExport } from '../dist/app/modules/textbooks/application/question-bank-export.js';
test('rubric text protocol preserves formulas and separates semantic issues from format failures', () => {
  const contract = rubricOutput(10);
  const scoring = contract.parseText(
    "<<<RUBRIC>>>\n3 | 写出导数 $f'(x)=2x$ 并令其等于零\n4 | 解得驻点 $x=0$ 并完成极值判定\n3 | 写出本题极值并验证成立\n<<<END>>>",
  );
  assert.equal(scoring.rubric.length, 3);
  assert.equal(scoring.rubric[1].rubricItemKey, 'key_2');
  assert.throws(() => contract.parseText('<<<RUBRIC>>>\n4 | 写出导数并求出正确驻点\n<<<END>>>'));
  assert.deepEqual(
    contract.decode(contract.parseText('<<<ISSUE>>>\n题设条件与给定答案矛盾\n<<<END>>>')),
    { issue: '题设条件与给定答案矛盾' },
  );
  assert.equal(
    Scoring.safeParse({
      ...scoring,
      rubric: [scoring.rubric[0], { ...scoring.rubric[1], rubricItemKey: 'key_1' }],
    }).success,
    false,
  );
});
test('export preflight coalesces jobs, persists scoring, and invalidates only changed evidence', async (t) => {
  const s = await fixture(t);
  await run(s);
  assert.throws(() => questionBankExport({}), /./);
  const [a, b] = await Promise.all([
    s.exportPreparation.prepare('book'),
    s.exportPreparation.prepare('book'),
  ]);
  assert.equal(a.jobId, b.jobId);
  await s.jobs.wait(a.jobId);
  const book = await s.store.read('book');
  assert.equal(book.jobs.at(-1).status, 'completed');
  assert.deepEqual(scoringReadiness(book.document), { total: 2, missing: 0 });
  assert.equal((await s.exportPreparation.prepare('book')).ready, true);
  const target = scoringTargets(book.document)[0];
  const basis = gradingBasis(target.leaf);
  target.leaf.label = 'different display number';
  assert.equal(gradingBasis(target.leaf), basis);
  target.leaf.prompt += ' corrected';
  assert.equal(currentGrading(target.leaf), false);
  assert.throws(() => questionBankExport(book), /得分点/);
});
test('failed rubric work keeps checkpoints, resumes without regenerating completed leaves', async (t) => {
  const skills = new ScriptedSkills();
  let count = 0;
  const original = skills.run.bind(skills);
  skills.run = async (...args) => {
    if (args[0] === 'rubric-generate') {
      count++;
      if (count === 2) {
        await new Promise((r) => setTimeout(r, 80));
        throw Error('provider unavailable');
      }
    }
    return original(...args);
  };
  const s = await fixture(t, skills);
  await run(s);
  const initial = await s.store.read('book');
  const prep = await s.exportPreparation.prepare('book');
  await s.jobs.wait(prep.jobId);
  const failed = await s.store.read('book');
  assert.equal(failed.jobs.at(-1).status, 'failed');
  assert.deepEqual(failed.document, initial.document);
  assert.equal(scoringReadiness(failed.jobs.at(-1).stage).missing, 1);
  const resumed = await s.exportPreparation.prepare('book');
  assert.equal(resumed.jobId, prep.jobId);
  await s.jobs.wait(resumed.jobId);
  const finished = await s.store.read('book');
  assert.equal(finished.jobs.at(-1).status, 'completed');
  assert.equal(count, 3);
  assert.equal(finished.revision, initial.revision + 1);
  assert.equal(scoringReadiness(finished.document).missing, 0);
});
test('shared stems invalidate child scoring without scoring the group twice', async (t) => {
  const s = await fixture(t);
  await run(s);
  await s.store.update('book', (book) => {
    const q = book.document.contents.find((c) => c.question).question;
    const { children, ...leaf } = q;
    q.children = [
      { ...structuredClone(leaf), label: '(1)' },
      { ...structuredClone(leaf), label: '(2)' },
    ];
    q.prompt = '共享条件 x > 0';
  });
  const prep = await s.exportPreparation.prepare('book');
  await s.jobs.wait(prep.jobId);
  const book = await s.store.read('book');
  assert.equal(scoringReadiness(book.document).total, 3);
  const group = book.document.contents.find((c) => c.question).question;
  assert.equal(group.grading, undefined);
  assert.equal(currentGrading(group.children[0], group.prompt), true);
  group.prompt += '，且 x < 2';
  assert.equal(currentGrading(group.children[0], group.prompt), false);
});

test('score allocation reconciles model arithmetic without losing criteria or changing valid scores', async () => {
  const { allocateScores } =
    await import('../dist/app/modules/textbooks/domain/score-allocation.js');
  assert.deepEqual(allocateScores([1, 2, 3, 2, 2, 1], 10), [1, 2, 2, 2, 2, 1]);
  assert.deepEqual(allocateScores([4, 4, 2], 10), [4, 4, 2]);
  assert.deepEqual(allocateScores([1, 1, 1], 10), [4, 3, 3]);
  assert.throws(() => allocateScores([0, 10], 10));
  assert.throws(() => allocateScores(Array(11).fill(1), 10));
  for (let n = 1; n <= 10; n++) {
    const r = allocateScores(
      Array.from({ length: n }, (_, i) => i + 1),
      10,
    );
    assert.equal(
      r.reduce((a, b) => a + b, 0),
      10,
    );
    assert.ok(r.every((x) => x >= 1 && Number.isInteger(x)));
  }
});
test('objective questions export empty rubrics without model calls, including grouped children', async (t) => {
  const s = await fixture(t);
  await run(s);
  await s.store.update('book', (b) => {
    for (const c of b.document.contents) {
      if (!c.question) continue;
      c.question.type = 'fill_blank';
    }
  });
  const calls = s.skills.calls.length;
  assert.equal((await s.exportPreparation.prepare('book')).ready, true);
  assert.equal(s.skills.calls.length, calls);
  const book = await s.store.read('book');
  for (const q of questionBankExport(book).questions) assert.deepEqual(q.rubric, []);
  const q = book.document.contents.find((c) => c.question).question;
  const { children, ...leaf } = q;
  for (const type of ['single_choice', 'multiple_choice', 'fill_blank']) {
    q.children = [{ ...leaf, type, grading: undefined }];
    q.type = 'group';
    assert.equal(scoringReadiness(book.document).missing, 0);
    assert.deepEqual(questionBankExport(book).questions[0].children[0].rubric, []);
  }
});
