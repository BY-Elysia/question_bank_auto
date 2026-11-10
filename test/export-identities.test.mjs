import { withGrading } from './grading-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { questionBankExport } from '../dist/app/modules/textbooks/application/question-bank-export.js';
const section = (id, parentId, title) => ({
  id,
  parentId,
  title,
  level: parentId ? 2 : 1,
  source: { page: 1, box: [0, 0, 1, 1] },
});
const question = (id, sectionId, children = []) => ({
  id,
  kind: 'question',
  sectionId,
  sources: [],
  question: {
    type: 'calculation',
    label: '99',
    prompt: '$x^2$',
    options: [],
    answer: null,
    children,
  },
});
const book = (sections, contents) =>
  withGrading({
    id: 'internal-book',
    title: '教材',
    document: { sections, contents },
  });
test('Reference export uses chapter/section ordinals, sequential questions and child IDs without changing stored identities', () => {
  const b = book(
    [
      section('hash3', null, '第三章 导数'),
      section('hash1', 'hash3', '第一节 习题3.1'),
      section('hash2', 'hash3', '第二节 导数'),
      section('review', 'hash3', '第三章 综合练习题'),
    ],
    [
      question('uuid-a', 'hash1', [question('unused', null).question]),
      question('uuid-b', 'hash1'),
      question('uuid-c', 'review'),
    ],
  );
  const before = structuredClone(b),
    out = questionBankExport(b);
  assert.deepEqual(
    out.chapters.map((s) => [s.chapterId, s.parentId, s.orderNo]),
    [
      ['ch_3', null, 3],
      ['ch_3_1', 'ch_3', 1],
      ['ch_3_2', 'ch_3', 2],
      ['ch_3_3', 'ch_3', 3],
    ],
  );
  assert.deepEqual(
    out.questions.map((q) => q.questionId),
    ['q_3_1_1', 'q_3_1_2', 'q_3_3_1'],
  );
  assert.equal(out.questions[0].children[0].questionId, 'q_3_1_1_1');
  assert.equal(out.questions[0].children[0].chapterId, 'ch_3_1');
  assert.equal('nodeType' in out.questions[0].children[0], false);
  assert.deepEqual(b, before);
  assert.deepEqual(questionBankExport(b), out);
});
test('Category headings share the section sequence while unlabeled and duplicate-number chapters stay unique', () => {
  const b = book(
    [
      section('r', null, '第十二章'),
      section('s', 'r', '第一节'),
      section('choice', 's', '一、选择题'),
      section('blank', 's', '二、填空题'),
      section('s2', 'r', '第一节 重复'),
      section('s3', 'r', '第二节'),
    ],
    [question('a', 'choice'), question('b', 'blank'), question('c', 's2'), question('d', null)],
  );
  const out = questionBankExport(b);
  assert.deepEqual(
    out.questions.slice(0, 2).map((q) => q.questionId),
    ['q_12_1_1', 'q_12_1_2'],
  );
  assert.equal(new Set(out.chapters.map((s) => s.chapterId)).size, out.chapters.length);
  assert.ok(out.questions.every((q) => out.chapters.some((s) => s.chapterId === q.chapterId)));
  assert.deepEqual(
    out.chapters.map((s) => s.chapterId),
    ['ch_12', 'ch_12_1', 'ch_12_3', 'ch_12_2', 'ch_0'],
  );
});
test('Questions directly under a chapter cannot collide with subsection questions or their children', () => {
  const b = book(
    [section('c', null, '第三章'), section('s', 'c', '第一节')],
    [question('root', 'c', [question('unused', null).question]), question('nested', 's')],
  );
  const out = questionBankExport(b),
    ids = out.questions.flatMap((q) => [
      q.questionId,
      ...(q.children ?? []).map((c) => c.questionId),
    ]);
  assert.equal(new Set(ids).size, ids.length);
});
test('Export rejects dangling or cyclic chapter references rather than emitting broken foreign keys', () => {
  for (const sections of [
    [section('a', 'missing', '节')],
    [section('a', 'b', '节'), section('b', 'a', '节')],
  ])
    assert.throws(
      () => questionBankExport(book(sections, [])),
      (e) => e.status === 422,
    );
});

test('Receiving bank keeps fill blanks distinct and derives stable missing textbook identity', () => {
  const b = book([section('s', null, '第一章')], [question('a', 's'), question('b', 's')]);
  b.extractionContext = {
    metadata: { textbookId: '  ', title: '教材', subject: '数学', publisher: '出版社' },
  };
  b.document.contents[0].question.type = 'fill_blank';
  b.document.contents[1].question.type = 'short_answer';
  // Type is part of the grading fingerprint; regenerate the test fixture accordingly.
  const out = questionBankExport(withGrading(b));
  assert.equal(out.textbook.textbookId, b.id);
  assert.equal(out.questions[0].questionType, 'FILL_BLANK');
  assert.deepEqual(out.questions[0].rubric, []);
  assert.equal(out.questions[1].questionType, 'SHORT_ANSWER');
  assert.equal(out.questions[1].rubric.length, 3);
});
