import type { z } from 'zod';
import type {
  WorkspaceList,
  WorkspaceViewResponse,
} from '../../../src/modules/workspaces/presentation/contracts';
export type {
  Content,
  Document,
  Source,
  Question,
} from '../../../src/modules/textbooks/domain/content';
export type { Proposal } from '../../../src/modules/textbooks/domain/book';
export type {
  ExtractionSettings,
  Workspace,
} from '../../../src/modules/workspaces/domain/workspace';
export type Workspaces = z.infer<typeof WorkspaceList>;
export type WorkspaceView = z.infer<typeof WorkspaceViewResponse>;
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch('/api' + url, options);
  if (!response.ok) {
    let detail = '请求失败';
    try {
      const problem = await response.json();
      detail = typeof problem.detail === 'string' ? problem.detail : JSON.stringify(problem.detail);
    } catch {}
    throw new ApiError(
      response.status,
      response.status === 409 ? '当前状态已变化，请刷新后重试。' + detail : detail,
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}
export function write<T>(url: string, body?: unknown, method = 'POST') {
  return request<T>(url, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
}
export const workspaceUrl = (id: string) => `/workspaces/${encodeURIComponent(id)}`;
export const bookUrl = (id: string) => `/textbooks/${encodeURIComponent(id)}`;
export const navigate = (id?: string) => {
  window.location.hash = id ? `/workspace/${id}` : '/';
};
