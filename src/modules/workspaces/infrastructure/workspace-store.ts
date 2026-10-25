import fs from 'node:fs/promises';
import path from 'node:path';
import { Workspace } from '../domain/workspace.js';
import type { WorkspaceRepository } from '../ports/workspace.repository.js';
import { Id } from '../../textbooks/domain/content.js';
import { atomicJson } from '../../../shared/infrastructure/atomic-json.js';
import { fail } from '../../../shared/errors.js';
export class WorkspaceStore implements WorkspaceRepository {
  private locks = new Map<string, Promise<unknown>>();
  constructor(private root: string) {}
  private file(id: string) {
    if (!Id.safeParse(id).success) fail(400, 'Invalid workspace ID');
    return path.join(this.root, 'workspaces', `${id}.json`);
  }
  async init() {
    await fs.mkdir(path.join(this.root, 'workspaces'), { recursive: true });
  }
  async list() {
    const names = await fs.readdir(path.join(this.root, 'workspaces'));
    return Promise.all(
      names.filter((n) => n.endsWith('.json')).map((n) => this.read(n.slice(0, -5))),
    );
  }
  async read(id: string) {
    try {
      return Workspace.parse(JSON.parse(await fs.readFile(this.file(id), 'utf8')));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') fail(404, 'Workspace not found');
      throw e;
    }
  }
  private async locked<T>(id: string, fn: () => Promise<T>) {
    const prior = this.locks.get(id) ?? Promise.resolve();
    const next = prior.catch(() => {}).then(fn);
    this.locks.set(id, next);
    try {
      return await next;
    } finally {
      if (this.locks.get(id) === next) this.locks.delete(id);
    }
  }
  async create(input: Workspace) {
    await this.locked(input.id, async () => {
      try {
        await this.read(input.id);
        fail(409, 'Workspace exists');
      } catch (e) {
        if ((e as { status?: number }).status !== 404) throw e;
      }
      await atomicJson(this.file(input.id), Workspace.parse(input));
    });
  }
  async update(id: string, fn: (value: Workspace) => void) {
    return this.locked(id, async () => {
      const value = await this.read(id);
      fn(value);
      value.updatedAt = new Date().toISOString();
      await atomicJson(this.file(id), Workspace.parse(value));
      return value;
    });
  }
  async remove(id: string) {
    await this.locked(id, async () => {
      await fs.rm(this.file(id));
    });
  }
}
