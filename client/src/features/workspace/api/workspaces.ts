import { request, write } from '@/shared/api/http';
import type { Workspace, Workspaces, WorkspaceView } from '@/shared/contracts';
const url = (id: string) => `/workspaces/${encodeURIComponent(id)}`;
export const workspaceApi = {
  list: (signal: AbortSignal) => request<Workspaces>('/workspaces', { signal }),
  get: (id: string, signal: AbortSignal) => request<WorkspaceView>(url(id), { signal }),
  command: (id: string, command: 'cancel' | 'resume') => write(url(id) + '/' + command),
  remove: (id: string) => write(url(id), undefined, 'DELETE'),
  revisions: (id: string) =>
    request<{ revision: number }[]>(`/textbooks/${encodeURIComponent(id)}/revisions`),
  restore: (id: string, expectedRevision: number, revision: number) =>
    write(`/textbooks/${encodeURIComponent(id)}/restore`, { expectedRevision, revision }),
  upload: (title: string, files: File[]) => {
    const isPdf = /\.pdf$/i.test(files[0].name);
    const body = isPdf ? files[0] : new FormData();
    if (body instanceof FormData) files.forEach((f) => body.append('images', f));
    return request<Workspace>(
      `/workspaces/${isPdf ? 'pdf' : 'images'}?title=${encodeURIComponent(title.trim())}`,
      {
        method: 'POST',
        body,
        headers: isPdf ? { 'Content-Type': 'application/pdf' } : undefined,
      },
    );
  },
};
