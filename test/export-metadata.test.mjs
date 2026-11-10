import test from 'node:test';
import assert from 'node:assert/strict';
import { validateExportMetadata } from '../dist/app/modules/textbooks/application/export-metadata.js';
import { ExportPreparation } from '../dist/app/modules/textbooks/application/export-preparation.js';
import { ExportService } from '../dist/app/modules/textbooks/application/export.service.js';

test('All question bank export entry points reject incomplete publication metadata', async () => {
  const book = {
    id: 'stable',
    title: '教材',
    extractionContext: { metadata: { subject: '数学', publisher: ' ' } },
  };
  assert.throws(() => validateExportMetadata(book), /出版社/);
  const store = { read: async () => book };
  await assert.rejects(new ExportPreparation(store).prepare('stable'), /出版社/);
  const service = new ExportService(
    store,
    { ensure: () => assert.fail('must validate before image work') },
    {},
  );
  await assert.rejects(service.questionBank('stable'), /出版社/);
  await assert.rejects(service.zip('stable'), /出版社/);
  book.extractionContext.metadata.publisher = '真实出版社';
  assert.doesNotThrow(() => validateExportMetadata(book));
});
