import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { AssistantToolRegistry, AssistantTool } from '../../ports/tools.js';
const Question = z.object({
  question: z.string().min(1).max(2000),
  options: z.array(z.string().max(500)).max(6).default([]),
  kind: z.enum(['clarification', 'confirmation']).default('clarification'),
});
/** P0 exposes only an interaction tool. Future data tools enter through the registry. */
export class InteractionTools implements AssistantToolRegistry {
  tools(): AssistantTool[] {
    return [
      {
        name: 'request_user_input',
        label: '询问用户',
        description:
          '当缺少必要信息或需要用户确认具体方案时提出问题并等待回答。不要为普通回答反复要求确认。',
        parameters: z.toJSONSchema(Question),
        async execute(callId, args) {
          return {
            text: 'Waiting for user response',
            interaction: {
              ...Question.parse(args),
              id: randomUUID(),
              toolCallId: callId,
              status: 'pending',
              answer: null,
            },
            pause: true,
          };
        },
      },
    ];
  }
}
