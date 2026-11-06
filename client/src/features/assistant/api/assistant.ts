import { request, write } from '@/shared/api/http';
import type { Conversation } from '@/shared/contracts';
export type { Conversation };
export const assistantApi = {
  list: (signal?: AbortSignal) =>
    request<{ id: string; title: string; pending: boolean }[]>('/assistant/conversations', {
      signal,
    }),
  create: () => write<Conversation>('/assistant/conversations'),
  get: (id: string, signal?: AbortSignal) =>
    request<Conversation>(`/assistant/conversations/${id}`, { signal }),
  send: (id: string, text: string) =>
    write<Conversation>(`/assistant/conversations/${id}/messages`, { text }),
};
