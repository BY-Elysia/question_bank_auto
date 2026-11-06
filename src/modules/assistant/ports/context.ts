/** Future database/RAG adapters implement this read boundary; no database access today. */
export interface AssistantContextPort {
  resolve(input: {
    conversationId: string;
    text: string;
    signal: AbortSignal;
  }): Promise<{ references: string[] }>;
}
export class EmptyAssistantContext implements AssistantContextPort {
  async resolve() {
    return { references: [] };
  }
}
