import { Agent } from '@earendil-works/pi-agent-core';
import type { AgentMessage, StreamFn } from '@earendil-works/pi-agent-core';
import type { Model, Api, Message } from '@earendil-works/pi-ai';
import { streamSimple as chat } from '@earendil-works/pi-ai/api/openai-completions';
import { streamSimple as responses } from '@earendil-works/pi-ai/api/openai-responses';
import { streamSimple as anthropic } from '@earendil-works/pi-ai/api/anthropic-messages';
import type { AssistantToolRegistry } from '../../ports/tools.js';
import type { ModelSettingsSource } from '../../../../ai/ports/model-settings.js';
import type { AgentRuntime, RuntimeStep } from '../../ports/runtime.js';
import type { Interaction } from '../../domain/run.js';
export class PiRuntime implements AgentRuntime {
  constructor(
    private settings: ModelSettingsSource,
    private registry: AssistantToolRegistry,
  ) {}
  history(messages: { role: 'user' | 'assistant'; content: string }[]): unknown[] {
    return messages.map((m) =>
      m.role === 'user'
        ? { role: 'user', content: m.content, timestamp: Date.now() }
        : {
            role: 'assistant',
            content: [{ type: 'text', text: m.content }],
            api: 'openai-completions',
            provider: 'history',
            model: 'history',
            usage: {
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 0,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
            },
            stopReason: 'stop',
            timestamp: Date.now(),
          },
    );
  }
  async step(input: Parameters<AgentRuntime['step']>[0]): Promise<RuntimeStep> {
    const config = await this.settings.get();
    if (!config.apiKey || !config.baseUrl || !config.model) throw Error('请先配置助手模型');
    const api: Api =
      config.protocol === 'chat'
        ? 'openai-completions'
        : config.protocol === 'responses'
          ? 'openai-responses'
          : 'anthropic-messages';
    const model: Model<Api> = {
      id: config.model,
      name: config.model,
      api,
      provider: 'xiye',
      baseUrl:
        api === 'anthropic-messages' ? config.baseUrl.replace(/\/v1\/?$/, '') : config.baseUrl,
      reasoning: false,
      input: ['text', 'image'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128000,
      maxTokens: 8192,
    };
    const checkpoint = structuredClone(input.checkpoint) as Message[];
    for (const answer of input.answers)
      for (const m of checkpoint)
        if (m.role === 'toolResult' && m.toolCallId === answer.toolCallId)
          m.content = [
            {
              type: 'text',
              text: JSON.stringify({ status: answer.status, answer: answer.answer }),
            },
          ];
    // A provider cannot continue from an aborted/error assistant tail. The durable
    // UI transcript retains that partial text; replay starts from the last input.
    const tail = checkpoint.at(-1);
    if (tail?.role === 'assistant' && ['aborted', 'error', 'length'].includes(tail.stopReason))
      checkpoint.pop();
    const questions: Interaction[] = [];
    const deferred: import('../../ports/deferred-tasks.js').DeferredTask[] = [];
    const stream: StreamFn = (m, c, o) => {
      const opts = { ...o, apiKey: config.apiKey, maxTokens: 8192 };
      if (api === 'openai-completions') return chat(m as Model<'openai-completions'>, c, opts);
      if (api === 'openai-responses') return responses(m as Model<'openai-responses'>, c, opts);
      return anthropic(m as Model<'anthropic-messages'>, c, opts);
    };
    const agent = new Agent({
      initialState: {
        model,
        systemPrompt: input.system,
        messages: checkpoint as AgentMessage[],
        tools: this.registry.tools(input.execution).map((tool) => ({
          name: tool.name,
          label: tool.label,
          description: tool.description,
          parameters: tool.parameters,
          execute: async (callId, args, signal) => {
            const result = await tool.execute(callId, args, signal);
            if (result.deferred) deferred.push(result.deferred);
            if (result.interaction) questions.push(result.interaction);
            return {
              content: [
                { type: 'text' as const, text: result.text },
                ...(result.images ?? []).map((i) => ({ type: 'image' as const, ...i })),
              ],
              details: {},
              terminate: result.pause || !!result.deferred,
            };
          },
        })),
      },
      streamFn: stream,
      finishTurn: () => ({ action: 'end' }),
      toolExecution: 'sequential',
    });
    agent.subscribe((e) => {
      if (e.type === 'message_update' && e.assistantMessageEvent.type === 'text_delta')
        input.delta(e.assistantMessageEvent.delta);
    });
    const abort = () => agent.abort();
    input.signal.addEventListener('abort', abort, { once: true });
    try {
      input.signal.throwIfAborted();
      if (input.inputs.length)
        await agent.prompt(
          input.inputs.map((text) => ({
            role: 'user' as const,
            content: text,
            timestamp: Date.now(),
          })),
        );
      else await agent.continue();
      const last = [...agent.state.messages].reverse().find((m) => m.role === 'assistant');
      if (!last || last.role !== 'assistant') throw Error('模型未返回助手消息');
      const usage = {
        input_tokens: last.usage.input + last.usage.cacheRead + last.usage.cacheWrite,
        output_tokens: last.usage.output,
        total_tokens: last.usage.totalTokens,
        input_tokens_details: { cached_tokens: last.usage.cacheRead },
      };
      return {
        deferred,
        checkpoint: agent.state.messages,
        text: last.content
          .filter((c) => c.type === 'text')
          .map((c) => c.text)
          .join(''),
        interactions: questions,
        model: config.model,
        usage,
        stop:
          last.stopReason === 'aborted'
            ? 'aborted'
            : ['error', 'length'].includes(last.stopReason)
              ? 'error'
              : last.stopReason === 'toolUse'
                ? 'continue'
                : 'complete',
        error: last.stopReason === 'length' ? '模型输出达到长度上限' : last.errorMessage,
      };
    } finally {
      input.signal.removeEventListener('abort', abort);
    }
  }
}
