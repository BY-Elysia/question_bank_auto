import { conversationContext } from '../../domain/conversation-context.js';
import { randomUUID, createHash } from 'node:crypto';
import { fail } from '../../../../shared/errors.js';
import type { HarnessStore } from '../../ports/harness-store.js';
import type { AgentRuntime } from '../../ports/runtime.js';
import type { SkillCatalog, RunRecords } from '../../../../ai/ports/skill-catalog.js';
import type { AssistantContextPort } from '../../ports/context.js';
import type { AssistantRun } from '../../domain/run.js';
import { HarnessDriver } from './driver.js';
const busy = (r: Pick<AssistantRun, 'status'>) =>
  ['queued', 'running', 'waiting_input'].includes(r.status);
export class HarnessService {
  private driver: HarnessDriver;
  constructor(
    private store: HarnessStore,
    private runtime: AgentRuntime,
    private catalog: SkillCatalog,
    records: RunRecords,
    private context: AssistantContextPort,
  ) {
    this.driver = new HarnessDriver(store, runtime, records);
  }
  async recover() {
    for (const c of this.store.list())
      this.store.update(c.id, (s, emit) => {
        for (const r of s.runs)
          if (['queued', 'running'].includes(r.status)) {
            r.status = 'interrupted';
            emit(r.id, 'run_state', { status: r.status });
          }
        for (const m of s.conversation.messages)
          if (m.status === 'pending') {
            m.status = 'failed';
            m.error = '服务重启，可以继续任务';
          }
      });
  }
  async list() {
    return this.store.list();
  }
  async get(id: string) {
    return this.store.get(id).conversation;
  }
  view(id: string) {
    const s = this.store.snapshot(id);
    return { ...s, runs: s.runs.map((r) => this.publicRun(r)) };
  }
  private publicRun(r: AssistantRun) {
    const { checkpoint, system, ...view } = r;
    void checkpoint;
    void system;
    return view;
  }
  run(id: string) {
    return this.publicRun(this.store.get(this.store.findRun(id)).runs.find((r) => r.id === id)!);
  }
  events(id: string, after: number) {
    this.store.findRun(id);
    return this.store.events(id, after);
  }
  async create() {
    const c = {
      id: randomUUID(),
      title: '新对话',
      updatedAt: new Date().toISOString(),
      messages: [],
    };
    this.store.create(c);
    return c;
  }
  rename(id: string, title: string) {
    return this.store.update(id, (s) => {
      s.conversation.title = title;
      return s.conversation;
    });
  }
  async remove(id: string) {
    const s = this.store.get(id);
    if (s.runs.some(busy)) fail(409, '请先停止当前任务');
    for (const r of s.runs) await this.driver.wait(r.id);
    this.store.remove(id);
  }
  messages(id: string, after: string | undefined, limit: number) {
    return this.store.messages(id, after, limit);
  }
  async start(id: string, text: string, requestId: string, parentRunId: string | null = null) {
    const existing = this.store.get(id).runs.find((r) => r.requestId === requestId);
    if (existing) {
      if (existing.inputs[0]?.text !== text) fail(409, '幂等键已用于其他输入');
      return this.publicRun(existing);
    }
    const skill = await this.catalog.get('assistant-chat');
    const references = await this.context.resolve({
      conversationId: id,
      text,
      signal: AbortSignal.timeout(15000),
    });
    const runId = this.store.update(id, (s, emit) => {
      const duplicate = s.runs.find((r) => r.requestId === requestId);
      if (duplicate) {
        if (duplicate.inputs[0]?.text !== text) fail(409, '幂等键已用于其他输入');
        return duplicate.id;
      }
      if (s.runs.some(busy)) fail(409, '此对话已有活动任务，请插话或停止');
      if (!s.conversation.messages.length) s.conversation.title = text.slice(0, 60);
      const now = new Date().toISOString();
      const r: AssistantRun = {
        id: randomUUID(),
        conversationId: id,
        requestId,
        status: 'queued',
        createdAt: now,
        updatedAt: now,
        error: null,
        attempt: 0,
        parentRunId,
        inputs: [{ id: requestId, text, mode: 'steer', status: 'queued', at: now }],
        interactions: [],
        checkpoint: this.runtime.history(conversationContext(s.conversation)),
        messageId: null,
        usage: [],
        system:
          skill.instructions +
          '\n必要信息缺失时使用 request_user_input；收到用户答复后继续原任务。' +
          (references.references.length
            ? '\n参考资料：' + JSON.stringify(references.references)
            : ''),
        skillVersion: skill.version,
        instructionHash: createHash('sha256').update(skill.instructions).digest('hex'),
      };
      s.runs.push(r);
      emit(r.id, 'run_state', { status: r.status });
      return r.id;
    });
    this.driver.launch(runId);
    return this.run(runId);
  }
  async send(id: string, text: string) {
    await this.start(id, text, randomUUID());
    // Preserve the legacy endpoint's pending-message response without awaiting generation.
    await new Promise<void>((resolve) => setImmediate(resolve));
    return this.get(id);
  }
  async input(
    id: string,
    text: string,
    requestId: string,
    mode: 'steer' | 'interrupt' | 'follow_up',
  ) {
    let accepted = false,
      redirectWaiting = false;
    const session = this.store.findRun(id);
    this.store.update(session, (s, emit) => {
      const r = s.runs.find((x) => x.id === id)!;
      const existing = r.inputs.find((x) => x.id === requestId);
      if (existing) {
        if (existing.text !== text || existing.mode !== mode) fail(409, '幂等键已用于其他输入');
        return;
      }
      if (!busy(r)) fail(409, '任务已结束');
      accepted = true;
      if (r.status === 'waiting_input' && mode === 'interrupt') {
        redirectWaiting = true;
        for (const q of r.interactions) if (q.status === 'pending') q.status = 'cancelled';
        r.status = 'queued';
      }
      r.inputs.push({ id: requestId, text, mode, status: 'queued', at: new Date().toISOString() });
      emit(id, 'input_queued', { requestId, mode });
    });
    if (redirectWaiting) {
      await this.driver.wait(id);
      this.driver.launch(id);
    } else if (accepted && mode === 'interrupt') void this.driver.interrupt(id, 'interrupt');
    return this.run(id);
  }
  async answer(id: string, interactionId: string, answer: string) {
    const session = this.store.findRun(id);
    let ready = false;
    this.store.update(session, (s, emit) => {
      const r = s.runs.find((x) => x.id === id)!,
        q = r.interactions.find((x) => x.id === interactionId);
      if (!q) fail(404, '问题不存在');
      if (q.status === 'answered') {
        if (q.answer !== answer) fail(409, '问题已经回答');
        return;
      }
      if (r.status !== 'waiting_input' || q.status !== 'pending') fail(409, '问题已失效');
      q.answer = answer;
      q.status = 'answered';
      s.conversation.messages.push({
        id: randomUUID(),
        role: 'user',
        content: answer,
        status: 'complete',
        error: null,
      });
      ready = !r.interactions.some((x) => x.status === 'pending');
      if (ready) r.status = 'queued';
      emit(id, 'interaction_answered', { interactionId });
    });
    if (ready) {
      await this.driver.wait(id);
      this.driver.launch(id);
    }
    return this.run(id);
  }
  async cancel(id: string) {
    await this.driver.interrupt(id, 'cancel');
    this.store.update(this.store.findRun(id), (s, emit) => {
      const r = s.runs.find((x) => x.id === id)!;
      if (busy(r) || r.status === 'interrupted') {
        r.status = 'cancelled';
        for (const q of r.interactions) if (q.status === 'pending') q.status = 'cancelled';
        emit(id, 'run_state', { status: r.status });
      }
    });
    return this.run(id);
  }
  async resume(id: string) {
    await this.driver.wait(id);
    this.store.update(this.store.findRun(id), (s, emit) => {
      const r = s.runs.find((x) => x.id === id)!;
      if (!['failed', 'interrupted'].includes(r.status)) fail(409, '当前任务不可恢复');
      r.status = r.interactions.some((x) => x.status === 'pending') ? 'waiting_input' : 'queued';
      r.error = null;
      emit(id, 'run_state', { status: r.status });
    });
    if (this.run(id).status === 'queued') this.driver.launch(id);
    return this.run(id);
  }
  async retry(id: string) {
    const r = this.run(id);
    if (busy(r)) fail(409, '请先停止当前任务');
    return this.start(r.conversationId, r.inputs[0]!.text, randomUUID(), id);
  }
  async wait(id: string) {
    const s = this.store.get(id);
    for (const r of s.runs) await this.driver.wait(r.id);
  }
  async shutdown() {
    await this.driver.shutdown();
    this.store.close();
  }
}
