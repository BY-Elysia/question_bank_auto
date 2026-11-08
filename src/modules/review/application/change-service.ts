import type { BookRepository } from '../../textbooks/ports/book.repository.js';
import { validateDocument } from '../../textbooks/domain/validation.js';
import { fail } from '../../../shared/errors.js';
/** Per-content inverse operation. Unrelated later edits are preserved. */
export class ChangeService {
  constructor(private store: BookRepository) {}
  async list(id: string) {
    return (await this.store.read(id)).changes;
  }
  async undo(id: string, changeId: string, expected: number) {
    const previous = (await this.store.read(id)).changes.find((c) => c.id === changeId);
    if (previous?.undoneAt) return previous;
    const book = await this.store.update(
      id,
      (b) => {
        if (b.workflowLock || b.jobs.some((j) => ['queued', 'running'].includes(j.status)))
          fail(409, '请等待当前教材任务结束');
        if (b.revision !== expected) fail(409, '教材已更新，请刷新后重试');
        const change = b.changes.find((c) => c.id === changeId);
        if (!change) fail(404, '修改记录不存在');
        const index = b.document.contents.findIndex((c) => c.id === change.contentId);
        if (JSON.stringify(b.document.contents[index]) !== JSON.stringify(change.after))
          fail(409, '这道题后来又被修改，不能覆盖后续编辑');
        b.document.contents[index] = structuredClone(change.before);
        const errors = validateDocument(b.document, b.pages.length).filter(
          (i) => i.code !== 'UNPROCESSED_PAGE',
        );
        if (errors.length) fail(409, '当前教材结构不允许撤销此修改');
        change.undoneAt = new Date().toISOString();
      },
      true,
    );
    return book.changes.find((c) => c.id === changeId)!;
  }
}
