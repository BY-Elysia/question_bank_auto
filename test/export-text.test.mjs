import test from 'node:test';
import assert from 'node:assert/strict';
import { exportText, exportAnswer } from '../dist/app/modules/textbooks/application/export-text.js';
import { questionBankExport } from '../dist/app/modules/textbooks/application/question-bank-export.js';
import { QuestionBankExport } from '../dist/app/modules/textbooks/presentation/contracts.js';
import { withGrading } from './grading-fixture.mjs';

test('v1.1 text preserves inequalities through an HTML-first consumer without mutating source', () => {
  for (const text of [
    String.raw`当$0<x<\pi$时，$\frac{\sin x}{x}>\cos x$`,
    String.raw`$$0<x<1$$`,
    String.raw`\(x<y\) 与 \[a>b\]`,
    '当0<x<1时，y>0',
  ]) {
    const result = exportText(text);
    assert.equal(/<\/?[a-z][\s\S]*>/i.test(result), false);
    assert.equal(result.replace(/<[^>]+>/g, ''), result);
    assert.ok(result.includes('\\lt') || result.includes('\\gt'));
    assert.equal(exportText(result), result);
  }
});

test('complete answer survives text/media-only persistence', () => {
  const answer = { text: '得证', explanation: String.raw`证明：$0<x<1$，故$x^2<x$。` };
  const out = exportAnswer(answer);
  const persisted = { text: out.text, media: out.media };
  assert.ok(persisted.text.includes('得证'));
  assert.ok(persisted.text.includes('证明：'));
  assert.ok(persisted.text.includes('x^2'));
  assert.deepEqual(Object.keys(out), ['text', 'media']);
  assert.equal(answer.explanation, String.raw`证明：$0<x<1$，故$x^2<x$。`);
  assert.equal(exportAnswer({ text: '同一内容', explanation: '同一内容' }).text, '同一内容');
});

test('export adapter covers stems, children, options, answers and grading criteria', () => {
  const leaf = {
    type: 'proof',
    prompt: '$0<x<1$',
    label: '1',
    options: [],
    answer: { text: '得证', explanation: '$x^2<x$' },
    children: [],
  };
  const book = withGrading({
    id: 'book',
    title: '书',
    document: {
      sections: [],
      contents: [
        {
          id: 'q',
          kind: 'question',
          sources: [],
          question: { ...leaf, prompt: '证明 $x>0$：', children: [leaf] },
        },
      ],
    },
  });
  book.document.contents[0].question.children[0].grading.rubric[0].criteria =
    '正确分析条件 $0<x<1$';
  const before = structuredClone(book);
  const q = questionBankExport(book).questions[0];
  assert.ok(q.stem.text.includes('\\gt'));
  assert.equal('standardAnswer' in q, false);
  assert.ok(q.children[0].prompt.text.includes('\\lt'));
  assert.ok(q.children[0].standardAnswer.text.includes('x^2'));
  assert.ok(q.children[0].rubric[0].criteria.includes('\\lt'));
  assert.deepEqual(book, before);
  const choice = withGrading({
    id: 'book',
    title: '书',
    document: {
      sections: [],
      contents: [
        {
          id: 'q',
          kind: 'question',
          sources: [],
          question: {
            ...leaf,
            type: 'single_choice',
            answer: { text: 'A', explanation: '$x>0$' },
            options: [{ id: 'A', text: '$x>0$' }],
          },
        },
      ],
    },
  });
  const payload = questionBankExport(choice);
  assert.equal(QuestionBankExport.safeParse(payload).success, true);
  assert.equal(
    QuestionBankExport.safeParse({ ...payload, documentType: 'textbook' }).success,
    false,
  );
  assert.deepEqual(Object.keys(payload).sort(), ['chapters', 'questions', 'textbook', 'version']);
  assert.deepEqual(Object.keys(payload.textbook).sort(), [
    'publisher',
    'subject',
    'textbookId',
    'title',
  ]);
  const exported = payload.questions[0];
  assert.equal('allowPartial' in exported, false);
  assert.equal('explanation' in exported.standardAnswer, false);
  assert.ok(exported.options[0].text.includes('\\gt'));
  assert.deepEqual(exported.correctOptionIds, ['A']);
  choice.document.contents[0].question.type = 'multiple_choice';
  const multi = questionBankExport(choice);
  assert.equal(multi.questions[0].questionType, 'MULTI_CHOICE');
  assert.equal(QuestionBankExport.safeParse(multi).success, true);
});
