import { useState } from 'react';
import type { AssistantRunView, Interaction } from '@/shared/contracts';
import { Button } from '@/components/ui/button';
function QuestionCard({
  question,
  busy,
  onAnswer,
}: {
  question: Interaction;
  busy: boolean;
  onAnswer: (id: string, value: string) => void;
}) {
  const [value, setValue] = useState('');
  return (
    <section className="interaction-card">
      <strong>{question.kind === 'confirmation' ? '等待确认' : '需要你补充信息'}</strong>
      <p>{question.question}</p>
      <div className="chat-suggestions">
        {question.options.map((o) => (
          <button disabled={busy} key={o} onClick={() => onAnswer(question.id, o)}>
            {o}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) onAnswer(question.id, value);
        }}
      >
        <input
          aria-label="回答助手问题"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="也可以输入你的要求…"
        />
        <Button disabled={busy || !value.trim()}>回答并继续</Button>
      </form>
    </section>
  );
}
export function RunControls({
  run,
  busy,
  onCommand,
  onAnswer,
}: {
  run: AssistantRunView | undefined;
  busy: boolean;
  onCommand: (name: 'cancel' | 'resume' | 'retry') => void;
  onAnswer: (id: string, value: string) => void;
}) {
  if (!run) return null;
  const active = ['running', 'queued', 'waiting_input'].includes(run.status);
  const labels = {
    queued: '准备执行',
    running: '正在处理',
    waiting_input: '等待你的回答',
    completed: '已完成',
    cancelled: '已停止',
    failed: '执行失败',
    interrupted: '执行中断',
  };
  return (
    <div className="run-controls">
      {!!run.deferred?.length && active && (
        <p role="status">教材任务正在后台处理，完成后会自动更新题目。</p>
      )}
      <div className="run-status">
        <span>{labels[run.status]}</span>
        {active && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onCommand('cancel')}>
            停止生成
          </Button>
        )}
        {['failed', 'interrupted'].includes(run.status) && (
          <Button size="sm" disabled={busy} onClick={() => onCommand('resume')}>
            继续任务
          </Button>
        )}
        {['failed', 'interrupted', 'cancelled', 'completed'].includes(run.status) && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => onCommand('retry')}>
            重新生成
          </Button>
        )}
      </div>
      {run.inputs
        .filter((x) => x.status === 'queued')
        .map((x) => (
          <p className="queued-input" key={x.id}>
            {x.mode === 'follow_up' ? '排队追加' : '插话待处理'}：{x.text}
          </p>
        ))}
      {run.interactions
        .filter((q) => q.status === 'pending')
        .map((q) => (
          <QuestionCard key={q.id} question={q} busy={busy} onAnswer={onAnswer} />
        ))}
    </div>
  );
}
