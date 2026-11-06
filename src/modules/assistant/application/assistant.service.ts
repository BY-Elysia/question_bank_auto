import { BackgroundTasks } from '../../../shared/concurrency/background-tasks.js';
import { AssistantReply } from './assistant-reply.js';
import { randomUUID } from 'node:crypto';
import type { ConversationRepository } from '../ports/conversation.repository.js';
import type { AssistantContextPort } from '../ports/context.js';
import type { ModelClient } from '../../../ai/ports/model-client.js';
import type { SkillCatalog, RunRecords } from '../../../ai/ports/skill-catalog.js';
import { fail } from '../../../shared/errors.js';
export class AssistantService {
  private running = new BackgroundTasks();
  private reply: AssistantReply;
  constructor(
    private store: ConversationRepository,
    model: ModelClient,
    context: AssistantContextPort,
    catalog: SkillCatalog,
    records: RunRecords,
  ) {
    this.reply = new AssistantReply(model, context, catalog, records);
  }
  async recover() {
    for (const c of await this.store.list())
      if (c.messages.some((m) => m.status === 'pending'))
        await this.store.update(c.id, (v) => {
          for (const m of v.messages)
            if (m.status === 'pending') {
              m.status = 'failed';
              m.error = '服务重启，请重新发送。';
            }
        });
  }
  async list() {
    return (await this.store.list())
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(({ messages, ...c }) => ({
        ...c,
        pending: messages.some((m) => m.status === 'pending'),
      }));
  }
  get(id: string) {
    return this.store.get(id);
  }
  async create() {
    const c = {
      id: randomUUID(),
      title: '新对话',
      updatedAt: new Date().toISOString(),
      messages: [],
    };
    await this.store.create(c);
    return c;
  }
  async send(id: string, text: string) {
    const responseId = randomUUID();
    const value = await this.store.update(id, (c) => {
      if (c.messages.some((m) => m.status === 'pending')) fail(409, '此对话正在生成回复');
      if (c.messages.length >= 200) fail(400, '此对话已达上限，请新建对话');
      if (!c.messages.length) c.title = text.slice(0, 60);
      c.messages.push(
        { id: randomUUID(), role: 'user', content: text, status: 'complete', error: null },
        { id: responseId, role: 'assistant', content: '', status: 'pending', error: null },
      );
    });
    this.running.start(id, async (signal) => {
      try {
        const result = await this.reply.execute(value, text, responseId, signal);
        await this.store.update(id, (c) => {
          const m = c.messages.find((m) => m.id === responseId)!;
          m.content = result.text;
          m.status = result.completionStatus === 'incomplete' ? 'failed' : 'complete';
          m.error = m.status === 'failed' ? '回复未完整生成，请重新发送。' : null;
        });
      } catch {
        await this.store.update(id, (c) => {
          const m = c.messages.find((m) => m.id === responseId)!;
          m.status = 'failed';
          m.error = '生成失败，请检查模型配置后重新发送。';
        });
      }
    });
    return value;
  }
  async wait(id: string) {
    await this.running.wait(id);
  }
  async shutdown() {
    await this.running.shutdown();
  }
}
