import test from 'node:test';
import assert from 'node:assert/strict';
import {
  numberComprehensiveExercises,
  isQuestionCategory,
} from '../dist/app/modules/textbooks/domain/exercise-numbering.js';
import { questionBankExport } from '../dist/app/modules/textbooks/application/question-bank-export.js';
import { QuestionBankExport } from '../dist/app/modules/textbooks/presentation/contracts.js';
import { questionProblems } from '../dist/app/modules/textbooks/domain/validation.js';
const leaf = (label, type = 'fill_blank') => ({
  label,
  type,
  prompt: '求 $x=$__________',
  options: [],
  answer: null,
  children: [],
});
const item = (label, i, sectionId = 'review') => ({
  id: `c${i}`,
  key: `r${i}`,
  kind: 'question',
  sectionId,
  sources: [{ page: 1, box: [0, i / 30, 1, (i + 1) / 30] }],
  text: '',
  caption: null,
  table: null,
  question: leaf(label),
});
const doc = () => ({
  sections: [
    {
      id: 'review',
      title: '综合练习题二',
      parentId: null,
      level: 1,
      source: { page: 1, box: [0, 0, 1, 0.01] },
    },
  ],
  contents: [
    ...Array.from({ length: 8 }, (_, i) => item(`(${i + 1})`, i + 1)),
    item('2', 9),
    item('3', 10),
  ],
  issues: [],
  processedPages: [1],
});
test('Category headings split into independent exercises, numbered without losing source labels', () => {
  const d = doc();
  numberComprehensiveExercises(d);
  assert.deepEqual(
    d.contents.map((c) => c.question.label),
    Array.from({ length: 10 }, (_, i) => String(i + 1)),
  );
  assert.equal(d.contents[8].question.sourceLabel, '2');
  numberComprehensiveExercises(d);
  assert.equal(d.contents[8].question.sourceLabel, '2');
  const q = { ...leaf('1', 'group'), prompt: '1.填空选择题', children: [leaf('(1)')] };
  assert.ok(questionProblems(q).some((s) => s.includes('Category')));
  q.prompt = '设同一函数 $f(x)$，求下列各量：';
  assert.deepEqual(questionProblems(q), []);
  assert.equal(isQuestionCategory('一、选择题'), true);
  assert.equal(isQuestionCategory('求下列函数的导数：'), false);
  const ordinary = item('7', 11, null);
  d.contents.push(ordinary);
  numberComprehensiveExercises(d);
  assert.equal(ordinary.question.label, '1');
  assert.equal(ordinary.question.sourceLabel, '7');
});
test('Reference-style export keeps choices separate, blanks as SHORT_ANSWER and genuine groups', () => {
  const d = doc();
  d.contents[0].question = {
    ...leaf('(1)', 'single_choice'),
    options: [
      { id: 'A', text: '$\\frac{1}{x}$' },
      { id: 'B', text: '$\\sqrt{x}$' },
    ],
    answer: {
      text: 'B',
      explanation: '原文解析',
      origin: 'source',
      review: 'pending',
      sources: [],
    },
  };
  d.contents[9].question = {
    ...leaf('3', 'group'),
    prompt: '共同条件',
    children: [leaf('(1)'), leaf('(2)')],
  };
  const book = { id: 'b', title: '教材', document: d, extractionContext: null };
  const out = questionBankExport(book);
  QuestionBankExport.parse(out);
  assert.equal(out.questions.length, 10);
  assert.equal(out.questions[0].nodeType, 'LEAF');
  assert.deepEqual(out.questions[0].correctOptionIds, ['B']);
  assert.equal(out.questions[0].options[0].text, '$\\frac{1}{x}$');
  assert.equal(out.questions[1].questionType, 'SHORT_ANSWER');
  assert.equal(out.questions[1].standardAnswer, null);
  assert.ok(out.questions[8].title.endsWith('第9题'));
  assert.equal(out.questions[9].nodeType, 'GROUP');
  assert.equal(out.questions[9].children.length, 2);
  assert.equal(d.contents[8].question.label, '2');
  d.contents[0].question.answer = null;
  assert.deepEqual(questionBankExport(book).questions[0].correctOptionIds, []);
});

test('Ordinary exercise categories share their parent sequence and inserted questions use document order', () => {
  const d = doc();
  d.sections = [
    { ...d.sections[0], id: 'choices', title: '一、选择题' },
    { ...d.sections[0], id: 'blanks', title: '二、填空题' },
  ];
  d.contents = [item('(1)', 1, 'choices'), item('(2)', 2, 'choices'), item('(1)', 3, 'blanks')];
  const inserted = item('99', 10, 'choices');
  d.contents.splice(1, 0, inserted);
  numberComprehensiveExercises(d);
  assert.deepEqual(
    d.contents.map((c) => c.question.label),
    ['1', '2', '3', '4'],
  );
  assert.equal(inserted.question.sourceLabel, '99');
});
