import type { KnowledgeLifecycle } from '../../ports/knowledge.js';
import { DomainError } from '../../../../shared/errors.js';
import { randomUUID } from 'node:crypto';
import type { HarnessStore } from '../../ports/harness-store.js';
import type { AgentRuntime } from '../../ports/runtime.js';
import type { RunRecords } from '../../../../ai/ports/skill-catalog.js';
/** Executes durable steps; each model/tool boundary is an atomic checkpoint. */
export class HarnessDriver {
  readonly active = new Map<
    string,
    { abort: AbortController; promise: Promise<void>; reason: string }
  >();
  constructor(
    private store: HarnessStore,
    private runtime: AgentRuntime,
    private records: RunRecords,
    private knowledge?: KnowledgeLifecycle,
  ) {}
  launch(id: string) {
    if (this.active.has(id)) return;
    const handle = { abort: new AbortController(), promise: Promise.resolve(), reason: '' };
    this.active.set(id, handle);
    handle.promise = new Promise<void>((r) => setImmediate(r))
      .then(() => this.execute(id, handle))
      .catch((error) => console.error('Assistant checkpoint failure', error))
      .finally(() => this.active.delete(id));
  }
  interrupt(id: string, reason: string) {
    const handle = this.active.get(id);
    if (handle && !['cancel', 'shutdown'].includes(handle.reason)) {
      handle.reason = reason;
      handle.abort.abort(reason);
    }
    return handle?.promise;
  }
  async wait(id: string) {
    await this.active.get(id)?.promise;
  }
  async shutdown() {
    for (const h of this.active.values()) {
      h.reason = 'shutdown';
      h.abort.abort();
    }
    await Promise.allSettled([...this.active.values()].map((h) => h.promise));
  }
  private async execute(id: string, handle: { abort: AbortController; reason: string }) {
    const sessionId = this.store.findRun(id);
    try {
      for (let turn = 0; turn < 64; turn++) {
        let messageId = '',
          streamed = '';
        const run = this.store.update(sessionId, (s, emit) => {
          const r = s.runs.find((x) => x.id === id)!;
          if (!['queued', 'running'].includes(r.status)) return null;
          if (r.attempt >= 64) throw Error('达到运行轮次上限');
          const priority = r.inputs.filter((x) => x.status === 'queued' && x.mode !== 'follow_up');
          const selected = priority.length
            ? priority
            : r.inputs.filter((x) => x.status === 'queued');
          for (const item of selected) {
            item.status = 'applied';
            s.conversation.messages.push({
              id: randomUUID(),
              role: 'user',
              content: item.text,
              status: 'complete',
              error: null,
            });
          }
          r.checkpoint.push(
            ...this.runtime.history(selected.map((x) => ({ role: 'user', content: x.text }))),
          );
          r.status = 'running';
          r.attempt++;
          r.messageId = messageId = randomUUID();
          s.conversation.messages.push({
            id: messageId,
            role: 'assistant',
            content: '',
            status: 'pending',
            error: null,
          });
          emit(id, 'run_state', { status: r.status });
          return structuredClone(r);
        });
        if (!run) return;
        if (run.execution) await this.knowledge?.validate(run.execution);
        let pending = '',
          timer: ReturnType<typeof setTimeout> | undefined;
        const flush = () => {
          clearTimeout(timer);
          timer = undefined;
          if (!pending) return;
          const delta = pending;
          pending = '';
          this.store.appendText(sessionId, id, messageId, delta);
        };
        let result;
        try {
          result = await this.runtime.step({
            execution: run.execution ? { ...run.execution, step: run.attempt } : undefined,
            system: run.system,
            checkpoint: run.checkpoint,
            inputs: [],
            answers: run.interactions.filter((x) => x.status !== 'pending'),
            signal: AbortSignal.any([handle.abort.signal, AbortSignal.timeout(180000)]),
            delta: (text) => {
              streamed += text;
              pending += text;
              if (!timer) timer = setTimeout(flush, 60);
            },
          });
        } finally {
          flush();
        }

        const citationResult =
          run.execution && this.knowledge
            ? await this.knowledge.citations(run.execution, result.text || streamed)
            : { text: result.text || streamed, citations: [] };
        const next = this.store.update(sessionId, (s, emit) => {
          const r = s.runs.find((x) => x.id === id)!,
            m = s.conversation.messages.find((x) => x.id === messageId)!;
          r.checkpoint = result.checkpoint;
          r.usage.push(result.usage);
          m.content = [citationResult.text, ...result.interactions.map((q) => q.question)]
            .filter(Boolean)
            .join('\n\n');
          m.citations = citationResult.citations;
          const aborted = handle.abort.signal.aborted || result.stop === 'aborted';
          m.status = aborted || result.stop === 'error' ? 'failed' : 'complete';
          m.error = aborted
            ? '生成已中断，已保留输出'
            : result.stop === 'error'
              ? '模型生成失败，请重试'
              : null;
          r.interactions.push(...result.interactions);
          if (handle.reason === 'shutdown') r.status = 'interrupted';
          else if (handle.reason === 'cancel') r.status = 'cancelled';
          else if (result.stop === 'error') {
            r.status = 'failed';
            r.error = '模型生成失败，请检查模型配置或重试';
          } else if (r.interactions.some((q) => q.status === 'pending')) r.status = 'waiting_input';
          else if (
            handle.reason === 'interrupt' ||
            r.inputs.some((x) => x.status === 'queued') ||
            result.stop === 'continue'
          )
            r.status = 'running';
          else r.status = aborted ? 'interrupted' : 'completed';
          if (r.status === 'cancelled')
            for (const q of r.interactions) if (q.status === 'pending') q.status = 'cancelled';
          emit(id, 'run_state', { status: r.status });
          return r.status;
        });
        await this.records
          .record('assistant', sessionId, {
            id: messageId,
            skill: 'assistant-chat',
            version: run.skillVersion,
            instructionHash: run.instructionHash,
            model: result.model,
            usage: result.usage,
            at: new Date().toISOString(),
            attempt: run.attempt,
            completionStatus:
              result.stop === 'error' || result.stop === 'aborted' ? 'incomplete' : 'completed',
            trace: {
              system: run.system,
              input: run.checkpoint,
              pages: [],
              rawOutput: JSON.stringify(result.checkpoint),
            },
          })
          .catch(() => console.error('Assistant usage mirror failed; run retains usage'));
        if (next !== 'running') return;
        handle.abort = new AbortController();
        handle.reason = '';
      }
      throw Error('达到本次运行的轮次上限');
    } catch (error) {
      this.store.update(sessionId, (s, emit) => {
        const r = s.runs.find((x) => x.id === id)!;
        r.status =
          handle.reason === 'cancel'
            ? 'cancelled'
            : handle.reason === 'shutdown'
              ? 'interrupted'
              : 'failed';
        r.error = error instanceof DomainError ? error.message : '生成中断或失败，可从检查点继续';
        for (const m of s.conversation.messages)
          if (m.status === 'pending') {
            m.status = 'failed';
            m.error = r.error;
          }
        emit(id, 'run_state', { status: r.status });
      });
      // An immediate steer can abort a provider before its first event. Persisted
      // user input remains queued and can be resumed without losing the request.
      if (handle.reason === 'interrupt') {
        this.store.update(sessionId, (s, e) => {
          s.runs.find((x) => x.id === id)!.status = 'queued';
          e(id, 'run_state', { status: 'queued' });
        });
        handle.abort = new AbortController();
        handle.reason = '';
        await this.execute(id, handle);
      }
    }
  }
}
