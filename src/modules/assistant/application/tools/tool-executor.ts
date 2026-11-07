import { z } from 'zod';
import type { AssistantTool } from '../../ports/tools.js';
import type { ToolContext } from '../../domain/knowledge.js';
import { DomainError, fail } from '../../../../shared/errors.js';
export interface ReadToolPolicy {
  validate(c: ToolContext): Promise<void>;
  calls(c: ToolContext): number;
  record(
    c: ToolContext,
    id: string,
    name: string,
    status: string,
    args: unknown,
    result?: unknown,
  ): void;
}
export class ReadToolExecutor {
  constructor(private policy: ReadToolPolicy) {}
  define<T extends z.ZodType>(
    context: ToolContext,
    d: {
      name: string;
      label: string;
      description: string;
      schema: T;
      execute: (args: z.infer<T>, c: ToolContext, signal: AbortSignal) => Promise<unknown>;
    },
  ): AssistantTool {
    return {
      name: d.name,
      label: d.label,
      description: d.description,
      parameters: z.toJSONSchema(d.schema),
      execute: async (id, args, signal) => {
        const combined = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(15000)]);
        try {
          combined.throwIfAborted();
          const input = d.schema.parse(args);
          await this.policy.validate(context);
          if (this.policy.calls(context) >= 48)
            fail(429, '本次资料查询已达到调用上限，请缩小问题范围');
          combined.throwIfAborted();
          this.policy.record(context, id, d.name, 'running', input);
          const result = await d.execute(input, context, combined);
          combined.throwIfAborted();
          await this.policy.validate(context);
          const text = JSON.stringify({ ok: true, data: result });
          if (text.length > 60000) fail(413, '查询结果过大，请缩小范围或读取单个子题');
          this.policy.record(context, id, d.name, 'completed', input, result);
          return { text, pause: false };
        } catch (error) {
          const message =
            error instanceof DomainError
              ? error.message
              : error instanceof z.ZodError
                ? '工具参数格式不正确'
                : combined.aborted
                  ? '工具调用已取消'
                  : '查询失败，请缩小范围后重试';
          this.policy.record(context, id, d.name, 'failed', args, { error: message });
          return { text: JSON.stringify({ ok: false, error: message }), pause: false };
        }
      },
    };
  }
}
