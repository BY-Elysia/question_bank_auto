import type { Citation, Evidence, KnowledgeScope, ToolContext } from '../domain/knowledge.js';
export interface KnowledgeStore {
  scope(conversationId: string): KnowledgeScope;
  saveScope(conversationId: string, scope: KnowledgeScope): void;
  evidence(e: Evidence): void;
  getEvidence(id: string): Evidence | undefined;
  call(
    context: ToolContext,
    callId: string,
    name: string,
    status: string,
    args: unknown,
    result?: unknown,
  ): void;
  calls(runId: string): number;
  remove(conversationId: string): void;
  close(): void;
}
export interface KnowledgeLifecycle {
  prepare(
    conversationId: string,
  ): Promise<{ scope: KnowledgeScope; principalId: string; instructions: string }>;
  validate(context: ToolContext): Promise<void>;
  citations(context: ToolContext, text: string): Promise<{ text: string; citations: Citation[] }>;
  remove(conversationId: string): void;
}
