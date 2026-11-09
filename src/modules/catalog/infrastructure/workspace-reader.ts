import type { CatalogReader, AccessPolicy } from '../ports/catalog.js';
import type { WorkspaceRepository } from '../../workspaces/ports/workspace.repository.js';
import type { BookRepository } from '../../textbooks/ports/book.repository.js';
import { fail } from '../../../shared/errors.js';
export class WorkspaceCatalogReader implements CatalogReader {
  constructor(
    private workspaces: Pick<WorkspaceRepository, 'list' | 'read'>,
    private books: Pick<BookRepository, 'read'>,
  ) {}
  async list() {
    return (await this.workspaces.list())
      .filter((w) => w.status !== 'deleting')
      .map(({ id, title, status, totalPages }) => ({ id, title, status, totalPages }));
  }
  async read(id: string) {
    const workspace = await this.workspaces.read(id);
    if (workspace.status === 'deleting') fail(404, '工作区不可用');
    return { workspace, book: await this.books.read(id) };
  }
}
/** The existing login gate authenticates a single account. Replace this adapter with ACLs for multi-user deployments. */
export class SingleAccountCatalogAccess implements AccessPolicy {
  constructor(
    private principal: string,
    private workspaces: Pick<WorkspaceRepository, 'read'>,
  ) {}
  async assertWorkspace(principal: string, id: string) {
    if (principal !== this.principal) fail(403, '无权访问资料');
    const w = await this.workspaces.read(id);
    if (w.status === 'deleting') fail(404, '工作区不可用');
  }
}
