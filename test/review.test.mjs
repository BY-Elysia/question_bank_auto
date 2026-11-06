import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, run, ScriptedSkills, source, payload } from './helpers.mjs';

test('Missing answers create reviewable proposals and never overwrite visible answers', async (t) => {
  const system = await fixture(t);
  let { book, job } = await run(system, { kind: 'parse', generateAnswers: true });
  assert.equal(job.status, 'needs_review');
  assert.equal(book.proposals.length, 1);
  const p = book.proposals[0];
  assert.equal(p.contentId, 'c_q1');
  assert.equal(p.after.question.answer.origin, 'ai_generated');
  assert.equal(book.document.contents.find((c) => c.key === 'q1').question.answer, null);
  book = await system.review.decide('book', p.id, book.revision, 'accept');
  assert.equal(
    book.document.contents.find((c) => c.key === 'q1').question.answer.review,
    'accepted',
  );
  assert.equal(book.document.contents.find((c) => c.key === 'q2').question.answer.origin, 'source');
  const second = await run(system, { kind: 'answers' });
  assert.equal(second.book.proposals.length, 1);
});
test('Answer lookup uses a book-end source before considering generation', async (t) => {
  const skills = new ScriptedSkills();
  const original = skills.output.bind(skills);
  skills.output = (id, input) =>
    id === 'source-verify' && input.mode === 'answer_lookup'
      ? { sourceIds: ['answer_block'], issues: [] }
      : id === 'source-verify' && input.mode === 'answer_extract'
        ? {
            answers: [
              {
                childIndex: null,
                text: 'Source 99',
                explanation: 'Appendix',
                sourceIds: ['answer_block'],
              },
            ],
            issues: [],
          }
        : original(id, input);
  const system = await fixture(t, skills);
  await run(system);
  await system.store.update(
    'book',
    (book) =>
      book.document.contents.push({
        ...payload('Q1 answer 99'),
        id: 'answer_block',
        key: 'answer_block',
        kind: 'answer',
        sectionId: null,
        sources: [source(3)],
      }),
    true,
  );
  const { book } = await run(system, { kind: 'answers' });
  assert.equal(book.proposals[0].after.question.answer.origin, 'source');
  assert.equal(book.proposals[0].after.question.answer.sources[0].page, 3);
  assert.equal(skills.calls.filter((c) => c.id === 'answer-generate').length, 0);
});
test('Repair changes remain proposals; stale edit and stale proposal are rejected', async (t) => {
  const system = await fixture(t);
  await run(system);
  let { book } = await run(system, {
    kind: 'repair',
    contentIds: ['c_p1'],
    instruction: 'Correct the OCR',
  });
  assert.equal(book.proposals.length, 1);
  assert.equal(book.document.contents.find((c) => c.id === 'c_p1').text, 'Body text');
  const content = { ...book.document.contents.find((c) => c.id === 'c_p1'), text: 'Human text' };
  book = await system.review.edit('book', book.revision, content.id, content);
  await assert.rejects(
    system.review.edit('book', book.revision - 1, content.id, content),
    /Revision conflict/,
  );
  await assert.rejects(
    system.review.decide('book', book.proposals[0].id, book.revision, 'accept'),
    /stale/,
  );
});
test('Unrelated proposals can be accepted in sequence and revisions can restore content', async (t) => {
  const system = await fixture(t);
  await run(system);
  let { book } = await run(system, {
    kind: 'repair',
    contentIds: ['c_p1', 'c_p3'],
    instruction: 'Correct',
  });
  for (const proposal of book.proposals)
    book = await system.review.decide('book', proposal.id, book.revision, 'accept');
  assert.equal(book.revision, 3);
  assert.equal(book.document.contents.find((c) => c.id === 'c_p3').text, 'Corrected text');
  book = await system.review.restore('book', book.revision, 1);
  assert.equal(book.revision, 4);
  assert.equal(book.document.contents.find((c) => c.id === 'c_p3').text, 'Body text');
});
test('Human answer edits record human origin and versioned source state persists', async (t) => {
  const system = await fixture(t);
  let { book } = await run(system);
  const content = structuredClone(book.document.contents.find((c) => c.id === 'c_q2'));
  content.question.answer.text = 'Human correction';
  book = await system.review.edit('book', book.revision, content.id, content);
  assert.equal(book.document.contents.find((c) => c.id === 'c_q2').question.answer.origin, 'human');
});
