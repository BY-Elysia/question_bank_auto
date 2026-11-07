import type { AgentRuntime } from '../../ports/runtime.js';
import type { ModelClient } from '../../../../ai/ports/model-client.js';
/** Adapter for explicitly injected non-streaming clients (including deterministic tests). */
export class CompleteRuntime implements AgentRuntime {
  constructor(private client: ModelClient) {}
  history(messages: { role: 'user' | 'assistant'; content: string }[]) {
    return messages;
  }
  async step(input: Parameters<AgentRuntime['step']>[0]) {
    const messages = input.checkpoint as { role: 'user' | 'assistant'; content: string }[];
    const r = await this.client.complete({
      system: input.system,
      input: {},
      messages,
      images: [],
      role: 'reasoning',
      cache: 'off',
      outputMode: 'text',
      signal: input.signal,
    });
    input.delta(r.text);
    return {
      checkpoint: [...messages, { role: 'assistant', content: r.text }],
      text: r.text,
      interactions: [],
      model: r.model,
      usage: r.usage,
      stop: r.completionStatus === 'incomplete' ? ('error' as const) : ('complete' as const),
    };
  }
}
