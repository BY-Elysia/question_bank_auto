import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceAnswerCoverageIssues } from '../dist/app/modules/textbooks/domain/content-quality.js';
import { source, payload, question, answer } from './helpers.mjs';

test('Partially transcribed group answers require review without inventing missing source answers', () => {
  const leaf = (label, value) => {
    const { children, ...q } = question(label, value);
    return q;
  };
  const content = {
    ...payload(''),
    id: 'c_q5',
    key: 'q5',
    kind: 'question',
    sectionId: null,
    sources: [source(4)],
    question: {
      ...question('5'),
      type: 'group',
      children: [leaf('(1)', answer), leaf('(2)', null)],
    },
  };
  const issues = sourceAnswerCoverageIssues([content]);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].code, 'PARTIAL_SOURCE_ANSWERS');
  assert.equal(issues[0].page, 4);
  assert.equal(issues[0].severity, 'warning');
  assert.match(issues[0].message, /\(2\)/);
  assert.equal(content.question.children[1].answer, null);
  content.question.children[1].answer = { ...answer, text: '', explanation: 'Source proof only' };
  assert.deepEqual(sourceAnswerCoverageIssues([content]), []);
  for (const child of content.question.children) child.answer = null;
  assert.deepEqual(sourceAnswerCoverageIssues([content]), []);
});
