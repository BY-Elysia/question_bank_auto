import type { Workspace } from '../domain/workspace.js';
export interface WorkspaceRepository {
  init(): Promise<void>;
  list(): Promise<Workspace[]>;
  read(id: string): Promise<Workspace>;
  create(workspace: Workspace): Promise<void>;
  update(id: string, change: (workspace: Workspace) => void): Promise<Workspace>;
  remove(id: string): Promise<void>;
}
