import type { CatalogReader, QuestionIndex, AccessPolicy } from '../ports/catalog.js';
import type { CatalogQuestion, QuestionAddress, QuestionSearch } from '../domain/catalog.js';
import type { Book } from '../../textbooks/domain/book.js';
import { fail, DomainError } from '../../../shared/errors.js';
export class CatalogQuery {
  constructor(
    private reader: CatalogReader,
    private index: QuestionIndex,
    private access: AccessPolicy,
  ) {}
  async list(principal: string) {
    const result = [];
    for (const w of await this.reader.list()) {
      try {
        await this.access.assertWorkspace(principal, w.id);
        result.push(w);
      } catch (error) {
        if (!(error instanceof DomainError) || ![403, 404].includes(error.status)) throw error;
      }
    }
    return result;
  }
  async authorize(principal: string, ids: string[]) {
    for (const id of ids) await this.access.assertWorkspace(principal, id);
  }
  async read(principal: string, scope: string[], id: string) {
    if (!scope.includes(id)) fail(403, '工作区不在本次对话资料范围内');
    await this.access.assertWorkspace(principal, id);
    return this.reader.read(id);
  }
  async outline(principal: string, scope: string[], id: string) {
    const { workspace, book } = await this.read(principal, scope, id);
    return {
      workspace,
      revision: book.revision,
      processedPages: book.document.processedPages.length,
      questionCount: this.project(id, book).filter((q) => q.searchable).length,
      sections: book.document.sections,
    };
  }
  async search(principal: string, scope: string[], query: QuestionSearch) {
    const revisions: Record<string, number> = {};
    for (const id of scope) {
      const { book } = await this.read(principal, scope, id);
      revisions[id] = book.revision;
      this.index.sync(id, `${book.revision}:${book.updatedAt}`, this.project(id, book));
    }
    const result = this.index.search(scope, query);
    return {
      ...result,
      revisions,
      nextOffset:
        query.offset + result.items.length < result.total
          ? query.offset + result.items.length
          : null,
    };
  }
  async question(principal: string, scope: string[], address: QuestionAddress) {
    const { book } = await this.read(principal, scope, address.workspaceId);
    if (address.revision !== undefined && book.revision !== address.revision)
      fail(409, '教材已更新，请重新查询题目');
    const q = this.project(address.workspaceId, book).find(
      (q) => q.contentId === address.contentId && q.childIndex === address.childIndex,
    );
    if (!q) fail(404, '题目不存在');
    return q;
  }
  private project(id: string, book: Book): CatalogQuestion[] {
    const sections = new Map(book.document.sections.map((s) => [s.id, s]));
    const sectionPath = (id: string | null) => {
      const names: string[] = [],
        seen = new Set<string>();
      while (id && !seen.has(id)) {
        seen.add(id);
        const s = sections.get(id);
        if (!s) break;
        names.unshift(s.title);
        id = s.parentId;
      }
      return names.join(' / ');
    };
    return book.document.contents.flatMap((c) => {
      if (!c.question) return [];
      const root: CatalogQuestion = {
        workspaceId: id,
        contentId: c.id,
        childIndex: null,
        revision: book.revision,
        title: book.title,
        section: sectionPath(c.sectionId),
        label: c.question.label,
        parentPrompt: '',
        question: c.question,
        sources: c.sources,
        searchable: !c.question.children.length,
      };
      return [
        root,
        ...c.question.children.map((q, i) => ({
          ...root,
          childIndex: i,
          label: `${c.question!.label} / ${q.label}`,
          parentPrompt: c.question!.prompt,
          question: q,
          searchable: true,
        })),
      ];
    });
  }
  close() {
    this.index.close();
  }
}
