import type { Document, Issue, Content, Question, Leaf } from './content.js';
export function questionProblems(question: Question | Leaf): string[] {
  const problems: string[] = [];
  const children = 'children' in question ? question.children : [];
  if (question.type === 'group' && !children.length) problems.push('Group has no children');
  if (question.type !== 'group' && children.length) problems.push('Only group can have children');
  if (!question.prompt.trim() && !children.length) problems.push('Empty question prompt');
  const ids = question.options.map((option) => option.id);
  if (new Set(ids).size !== ids.length) problems.push('Duplicate option IDs');
  if (['single_choice', 'multiple_choice'].includes(question.type) && question.options.length < 2)
    problems.push('Choice question lacks options');
  if (question.answer?.origin === 'source' && !question.answer.sources.length)
    problems.push('Source answer lacks evidence');
  const numbers = children
    .map((c) => c.label.match(/^[(（]?(\d+)[)）.、]?$/)?.[1])
    .map((n) => (n === undefined ? null : Number(n)));
  if (numbers.length && numbers.every((n) => n !== null) && numbers.some((n, i) => n !== i + 1))
    problems.push('Subquestion numbering is incomplete');
  for (const child of children) problems.push(...questionProblems(child));
  return problems;
}
export function contentProblems(content: Content): string[] {
  const problems: string[] = [];
  if (['question', 'example'].includes(content.kind) && !content.question)
    problems.push('Question/example payload is missing');
  if (!['question', 'example'].includes(content.kind) && content.question)
    problems.push('Unexpected question payload');
  if (content.kind === 'table' && !content.table?.length) problems.push('Empty table');
  if (content.question) problems.push(...questionProblems(content.question));
  return problems;
}
export function validateDocument(document: Document, pageCount: number): Issue[] {
  const issues: Issue[] = [];
  const add = (
    code: string,
    message: string,
    page: number | null = null,
    contentId: string | null = null,
  ) => issues.push({ code, message, page, contentId, severity: 'error' });
  if (
    new Set(document.processedPages).size !== document.processedPages.length ||
    document.processedPages.some((p) => p < 1 || p > pageCount)
  )
    add('INVALID_PAGE_COVERAGE', 'Invalid processed page list');
  const sections = new Map(document.sections.map((s) => [s.id, s]));
  if (sections.size !== document.sections.length) add('DUPLICATE_SECTION', 'Duplicate section IDs');
  for (const section of document.sections) {
    if (
      section.parentId &&
      sections.has(section.parentId) &&
      sections.get(section.parentId)!.level >= section.level
    )
      add('INVALID_HIERARCHY', 'Parent level must precede child level');
    if (section.source.page > pageCount) add('INVALID_PAGE', 'Section source out of bounds');
    const seen = new Set([section.id]);
    let parent = section.parentId;
    while (parent) {
      if (seen.has(parent) || !sections.has(parent)) {
        add('INVALID_HIERARCHY', 'Missing or cyclic parent');
        break;
      }
      seen.add(parent);
      parent = sections.get(parent)!.parentId;
    }
  }
  const ids = new Set<string>(),
    keys = new Set<string>();
  for (const item of document.contents) {
    if (ids.has(item.id) || keys.has(item.key))
      add('DUPLICATE_CONTENT', 'Duplicate content identity', null, item.id);
    ids.add(item.id);
    keys.add(item.key);
    if (item.sectionId && !sections.has(item.sectionId))
      add('INVALID_SECTION', 'Unknown content section', null, item.id);
    for (const source of item.sources)
      if (source.page > pageCount)
        add('INVALID_PAGE', 'Content source out of bounds', source.page, item.id);
    for (const q of item.question ? [item.question, ...item.question.children] : [])
      for (const source of q.answer?.sources ?? [])
        if (source.page > pageCount)
          add('INVALID_PAGE', 'Answer source out of bounds', source.page, item.id);
    for (const problem of contentProblems(item))
      add('INVALID_CONTENT', problem, item.sources[0]?.page ?? null, item.id);
  }
  for (let page = 1; page <= pageCount; page++)
    if (!document.processedPages.includes(page))
      add('UNPROCESSED_PAGE', 'Page has not been parsed', page);
  return issues;
}
