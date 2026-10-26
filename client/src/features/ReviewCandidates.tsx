import { Check, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Empty } from '@/components/common';
import { ContentBody } from '@/components/ContentBody';
import type { Content, Proposal } from '@/lib/api';
export function ReviewCandidates({
  pending,
  disabled,
  onDecision,
  onLocate,
}: {
  pending: Proposal[];
  disabled: boolean;
  onDecision: (id: string, decision: 'accept' | 'reject') => void;
  onLocate: (content: Content) => void;
}) {
  if (!pending.length)
    return (
      <Empty title="没有待审候选">AI 修复和补全答案会先出现在这里，确认后才写入正式内容。</Empty>
    );
  return pending.map((p) => (
    <article key={p.id} className="proposal-card">
      <div className="soft-tag">
        <Sparkles size={13} />
        待确认修改
      </div>
      <p>
        {p.reason === 'answers' ? '补全缺失答案' : p.reason === 'repair' ? '修复内容' : p.reason}
      </p>
      <details>
        <summary>查看修改前内容</summary>
        <ContentBody content={p.before} />
      </details>
      <div className="proposal-after">
        <span>修改后</span>
        <ContentBody content={p.after} />
      </div>
      <footer>
        <Button size="sm" disabled={disabled} onClick={() => onDecision(p.id, 'accept')}>
          <Check size={14} />
          接受
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => onDecision(p.id, 'reject')}
        >
          <X size={14} />
          拒绝
        </Button>
        <button className="text-link" onClick={() => onLocate(p.before)}>
          定位原文
        </button>
      </footer>
    </article>
  ));
}
