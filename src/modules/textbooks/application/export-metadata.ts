import type { Book } from '../domain/book.js';
import { fail } from '../../../shared/errors.js';

/** Metadata required by the receiving question bank's publication contract. */
export function validateExportMetadata(book: Book): void {
  const metadata = book.extractionContext?.metadata;
  const missing = [
    !(metadata?.title || book.title)?.trim() && '教材名称',
    !metadata?.subject?.trim() && '学科',
    !metadata?.publisher?.trim() && '出版社',
  ].filter(Boolean);
  if (missing.length) fail(422, `请先在教材基础信息中补充${missing.join('、')}，再导出题库`);
}
