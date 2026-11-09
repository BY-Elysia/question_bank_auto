import type { ToolContext } from '../domain/knowledge.js';
import type { Interaction } from '../domain/run.js';
export interface RuntimeStep {
  deferred?: import('./deferred-tasks.js').DeferredTask[];
  checkpoint: unknown[];
  text: string;
  interactions: Interaction[];
  model: string;
  usage: unknown;
  stop: 'complete' | 'continue' | 'aborted' | 'error';
  error?: string;
}
/** Provider and framework objects remain opaque outside the runtime adapter. */
export interface AgentRuntime {
  step(input: {
    execution?: ToolContext;
    system: string;
    checkpoint: unknown[];
    inputs: string[];
    answers: Interaction[];
    signal: AbortSignal;
    delta: (text: string) => void;
  }): Promise<RuntimeStep>;
  history(messages: { role: 'user' | 'assistant'; content: string }[]): unknown[];
}
