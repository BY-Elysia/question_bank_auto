import { request, write } from '@/shared/api/http';
import type { Conversation, AssistantRunView } from '@/shared/contracts';
export type { Conversation, AssistantRunView };
export const assistantApi = {
  list: (signal?: AbortSignal) =>
    request<{ id: string; title: string; pending: boolean }[]>('/assistant/conversations', {
      signal,
    }),
  create: () => write<Conversation>('/assistant/conversations'),
  get: (id: string, signal?: AbortSignal) =>
    request<Conversation>(`/assistant/conversations/${id}`, { signal }),
  state: (id: string, signal?: AbortSignal) =>
    request<{ conversation: Conversation; runs: AssistantRunView[]; nextCursor: string | null }>(
      `/assistant/conversations/${id}/state`,
      { signal },
    ),
  messages: (id: string, cursor: string) =>
    request<{ messages: Conversation['messages']; nextCursor: string | null }>(
      `/assistant/conversations/${id}/messages?cursor=${encodeURIComponent(cursor)}&limit=50`,
    ),
  start: (id: string, text: string, requestId: string) =>
    write<AssistantRunView>(`/assistant/conversations/${id}/runs`, { text, requestId }),
  input: (id: string, text: string, mode: string, requestId: string) =>
    write<AssistantRunView>(`/assistant/runs/${id}/inputs`, { text, mode, requestId }),
  command: (id: string, command: 'cancel' | 'resume' | 'retry') =>
    write<AssistantRunView>(`/assistant/runs/${id}/${command}`),
  answer: (id: string, question: string, answer: string) =>
    write<AssistantRunView>(`/assistant/runs/${id}/interactions/${question}/responses`, { answer }),
  rename: (id: string, title: string) =>
    write<Conversation>(`/assistant/conversations/${id}`, { title }, 'PATCH'),
  remove: (id: string) => write(`/assistant/conversations/${id}`, undefined, 'DELETE'),
  send: (id: string, text: string) =>
    write<Conversation>(`/assistant/conversations/${id}/messages`, { text }),
};

export function subscribeRun(
  id: string,
  onEvent: (event: import('@/shared/contracts').RunEvent) => void,
) {
  const source = new EventSource(`/api/assistant/runs/${encodeURIComponent(id)}/events`);
  source.onmessage = (e) => onEvent(JSON.parse(e.data));
  return () => source.close();
}
