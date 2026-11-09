import type { Conversation } from '../domain/conversation.js';
import type { AssistantRun, RunEvent } from '../domain/run.js';
export interface HarnessSession {
  conversation: Conversation;
  runs: AssistantRun[];
}
export interface HarnessStore {
  create(c: Conversation): void;
  list(): { id: string; title: string; updatedAt: string; pending: boolean }[];
  get(id: string): HarnessSession;
  snapshot(id: string): HarnessSession & { nextCursor: string | null };
  messages(
    id: string,
    cursor: string | undefined,
    limit: number,
  ): { messages: Conversation['messages']; nextCursor: string | null };
  appendText(session: string, runId: string, messageId: string, delta: string): void;
  update<T>(
    id: string,
    change: (s: HarnessSession, emit: (runId: string, type: string, data: unknown) => void) => T,
  ): T;
  findRun(id: string): string;
  events(runId: string, after: number): RunEvent[];
  remove(id: string): void;
  close(): void;
}
