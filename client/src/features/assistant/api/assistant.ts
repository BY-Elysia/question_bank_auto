import { request, write } from '@/shared/api/http';
import type { Conversation } from '@/shared/contracts';
export type { Conversation };
export const assistantApi = {
  list: () =>
    request<{ id: string; title: string; pending: boolean }[]>('/assistant/conversations'),
  create: () => write<Conversation>('/assistant/conversations'),
  get: (id: string) => request<Conversation>(`/assistant/conversations/${id}`),
  send: (id: string, text: string) =>
    write<Conversation>(`/assistant/conversations/${id}/messages`, { text }),
};
