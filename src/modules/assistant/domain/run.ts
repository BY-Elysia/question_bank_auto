import { KnowledgeScope } from './knowledge.js';
import { z } from 'zod';
export const RunInput = z.object({
  id: z.string(),
  text: z.string(),
  mode: z.enum(['steer', 'interrupt', 'follow_up']),
  status: z.enum(['queued', 'applied']),
  at: z.string(),
});
export const Interaction = z.object({
  id: z.string(),
  toolCallId: z.string(),
  question: z.string(),
  options: z.array(z.string()),
  kind: z.enum(['clarification', 'confirmation']),
  status: z.enum(['pending', 'answered', 'cancelled']),
  answer: z.string().nullable(),
});
export const AssistantRun = z.object({
  execution: z
    .object({
      conversationId: z.string(),
      runId: z.string(),
      principalId: z.string(),
      scope: KnowledgeScope,
    })
    .optional(),
  id: z.string(),
  conversationId: z.string(),
  requestId: z.string(),
  status: z.enum([
    'queued',
    'running',
    'waiting_input',
    'completed',
    'cancelled',
    'failed',
    'interrupted',
  ]),
  createdAt: z.string(),
  updatedAt: z.string(),
  error: z.string().nullable(),
  attempt: z.number(),
  parentRunId: z.string().nullable(),
  inputs: z.array(RunInput),
  interactions: z.array(Interaction),
  checkpoint: z.array(z.unknown()),
  messageId: z.string().nullable(),
  usage: z.array(z.unknown()),
  system: z.string(),
  skillVersion: z.string(),
  instructionHash: z.string(),
});
export type AssistantRun = z.infer<typeof AssistantRun>;
export type Interaction = z.infer<typeof Interaction>;
export interface RunEvent {
  seq: number;
  runId: string;
  type: string;
  data: unknown;
  at: string;
}
export const StartRun = z.object({
  text: z.string().trim().min(1).max(20000),
  requestId: z.string().min(1).max(100),
});
export const InputCommand = StartRun.extend({ mode: z.enum(['steer', 'interrupt', 'follow_up']) });
export const InteractionAnswer = z.object({ answer: z.string().trim().min(1).max(20000) });

export const AssistantRunView = AssistantRun.omit({ checkpoint: true, system: true });
export type AssistantRunView = z.infer<typeof AssistantRunView>;
