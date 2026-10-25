import { createHash } from 'node:crypto';
import { Document, type Source } from '../../textbooks/domain/content.js';
import type { Workspace } from '../domain/workspace.js';
import type { Book } from '../../textbooks/domain/book.js';
import { validateDocument } from '../../textbooks/domain/validation.js';
export function projectChapter(chapter: Workspace['chapters'][number], document: Document) {
  const result: Document = { sections: [], contents: [], issues: [], processedPages: [] };
  const id = (value: string) =>
    `${chapter.id}_${createHash('sha256').update(value).digest('hex').slice(0, 24)}`;
  const page = (number: number) => {
    const mapped = chapter.pages[number - 1];
    if (!mapped) throw new Error('Chapter result references an unknown image');
    return mapped;
  };
  const source = (s: Source) => ({ ...s, page: page(s.page) });
  result.sections.push(
    ...document.sections.map((s) => ({
      ...s,
      id: id(s.id),
      parentId: s.parentId ? id(s.parentId) : null,
      source: source(s.source),
    })),
  );
  result.contents.push(
    ...document.contents.map((c) => ({
      ...c,
      id: id(c.id),
      key: id(c.key),
      sectionId: c.sectionId ? id(c.sectionId) : null,
      sources: c.sources.map(source),
      question: c.question
        ? {
            ...c.question,
            answer: c.question.answer
              ? { ...c.question.answer, sources: c.question.answer.sources.map(source) }
              : null,
            children: c.question.children.map((q) => ({
              ...q,
              answer: q.answer ? { ...q.answer, sources: q.answer.sources.map(source) } : null,
            })),
          }
        : null,
    })),
  );
  result.processedPages.push(...document.processedPages.map(page));
  result.issues.push(
    ...document.issues.map((i) => ({
      ...i,
      page: i.page === null ? null : page(i.page),
      contentId: i.contentId ? id(i.contentId) : null,
    })),
  );

  return Document.parse(result);
}
export function mergeChapters(chapters: Workspace['chapters'], books: Book[], total: number) {
  const result: Document = { sections: [], contents: [], issues: [], processedPages: [] };
  for (const [index, chapter] of chapters.entries()) {
    const document = projectChapter(chapter, books[index]!.document);
    result.sections.push(...document.sections);
    result.contents.push(...document.contents);
    result.issues.push(...document.issues);
    result.processedPages.push(...document.processedPages);
    if (!document.sections.length)
      result.issues.push({
        code: 'CHAPTER_NAME_UNRESOLVED',
        severity: 'warning',
        page: chapter.pages[0]!,
        contentId: null,
        message: 'No chapter title could be read from this group; review its source images',
      });
  }
  result.processedPages.sort((a, b) => a - b);
  result.contents.sort(
    (a, b) =>
      a.sources[0]!.page - b.sources[0]!.page || a.sources[0]!.box[1] - b.sources[0]!.box[1],
  );
  const invalid = validateDocument(result, total);
  if (invalid.length) throw new Error(`Invalid merged chapter document: ${invalid[0]!.message}`);
  return Document.parse(result);
}
