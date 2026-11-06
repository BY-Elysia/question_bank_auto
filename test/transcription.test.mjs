import test from 'node:test';
import assert from 'node:assert/strict';
import { auditTranscription } from '../dist/app/modules/review/application/transcription-audit.js';
import { missingAnswer } from '../dist/app/modules/review/application/review-workflow.js';
import { providerSchema } from '../dist/app/ai/providers/structured-format.js';
import { source, payload, question } from './helpers.mjs';
const content = {
  ...payload('Actual extracted proof'),
  id: 'c_proof',
  key: 'proof',
  kind: 'paragraph',
  sectionId: null,
  sources: [source(1)],
};
const context = { bookId: 'book', jobId: 'job', signal: new AbortController().signal };
test('Source proof without a separate answer.text still counts as an existing answer', () => {
  const q = question('1', {
    text: '',
    explanation: 'Visible original proof',
    origin: 'source',
    review: 'pending',
    sources: [source(1)],
  });
  assert.equal(missingAnswer(q), false);
  q.answer.explanation = '  ';
  assert.equal(missingAnswer(q), true);
});
test('Audit omissions cannot be hidden behind an empty issues array', async () => {
  const issues = await auditTranscription(
    {
      async run(_id, input, schema) {
        if (input.mode === 'source_transcribe')
          return schema.parse({ blocks: [{ page: 1, text: 'Original intermediate equation' }] });
        assert.equal(input.mode, 'transcription_audit');
        return schema.parse({
          checks: [
            {
              page: 1,
              sourceText: 'Original intermediate equation',
              extractedText: '',
              verdict: 'omitted',
            },
          ],
        });
      },
    },
    content,
    [1],
    context,
  );
  assert.equal(issues[0].code, 'SOURCE_TRANSCRIPTION_OMISSION');
  assert.equal(issues[0].severity, 'error');
});
test('Audit cannot claim a match with invented extracted evidence or reference another page', async () => {
  const fake = (page) => ({
    async run(_id, input, schema) {
      if (input.mode === 'source_transcribe')
        return schema.parse({ blocks: [{ page: 1, text: 'Original' }] });
      return schema.parse({
        checks: [
          { page, sourceText: 'Original', extractedText: 'Invented quote', verdict: 'matched' },
        ],
      });
    },
  });
  assert.equal(
    (await auditTranscription(fake(1), content, [1], context))[0].code,
    'AUDIT_EVIDENCE_UNSUPPORTED',
  );
  await assert.rejects(auditTranscription(fake(2), content, [1], context), /unrelated page/);
});
test('Provider schema keeps required shape while local validation owns numeric and tuple bounds', () => {
  const schema = providerSchema({
    type: 'object',
    properties: {
      box: {
        type: 'array',
        prefixItems: Array.from({ length: 4 }, () => ({ type: 'number', minimum: 0, maximum: 1 })),
        minItems: 4,
        maxItems: 4,
      },
      optional: { type: 'array', items: { type: 'string' }, default: [] },
    },
    required: ['box'],
  });
  assert.deepEqual(schema.required, ['box', 'optional']);
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.properties.box, { type: 'array', items: { type: 'number' } });
});

test('A cross-page source audit cannot silently skip a requested page', async () => {
  const skills = {
    async run(_id, _input, schema) {
      return schema.parse({ blocks: [{ page: 1, text: 'Only first page' }] });
    },
  };
  await assert.rejects(
    auditTranscription(skills, content, [1, 2], context),
    /omitted a requested page/,
  );
});
