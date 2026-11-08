import { request, write } from '@/shared/api/http';
import type { Change } from '@/shared/contracts';
export const changesApi = {
  list: (workspace: string, signal?: AbortSignal) =>
    request<Change[]>(`/workspaces/${workspace}/changes`, { signal }),
  undo: (workspace: string, id: string, revision: number) =>
    write<Change>(`/workspaces/${workspace}/changes/${id}/undo`, { revision }),
};
