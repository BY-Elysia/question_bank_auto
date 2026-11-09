import { Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAssistant } from '../hooks/useAssistant';
import { useReviewBinding, type ReviewBinding } from '../hooks/useReviewBinding';
import { ConversationView } from './ConversationView';
import { ChangeCards } from './ChangeCards';
export function ReviewAssistantPanel({ embedded }: { embedded: ReviewBinding }) {
  const binding = useReviewBinding(embedded);
  const m = useAssistant({
    storageKey: `review-conversation:${embedded.workspaceId}`,
    prepare: binding.prepare,
    onMutation: binding.mutation,
    history: false,
  });
  return (
    <div className="assistant-page chat-workbench embedded-assistant">
      <section className="chat-main">
        <header className="chat-topbar">
          <div>
            <h1>教材 AI 助手</h1>
            <span className="chat-model-label">独立模型配置</span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            disabled={!!m.activeRun || m.action.busy}
            onClick={m.create}
          >
            新建对话
          </Button>
          <Button size="sm" variant="ghost" onClick={embedded.onClose}>
            收起助手
          </Button>
          <Button variant="ghost" size="sm" onClick={() => (location.hash = '/assistant/settings')}>
            <Settings2 size={15} />
            模型设置
          </Button>
        </header>
        <p className="review-agent-context">
          {m.activeRun
            ? '本轮目标已固定，切页不会改变正在处理的题目。'
            : embedded.contentId
              ? '已关联选中题目，可读取原图并按你的要求修改。'
              : '请点击一道题目，再向助手提出要求。'}
        </p>
        <ConversationView
          m={m}
          embedded
          error={binding.action.error || binding.changes.error}
          sendBlocked={!embedded.contentId && !m.activeRun}
          afterMessages={
            <ChangeCards
              changes={(binding.changes.data ?? []).filter(
                (c) => c.contentId === embedded.contentId,
              )}
              busy={binding.action.busy || !!m.activeRun}
              onUndo={binding.undo}
            />
          }
        />
      </section>
    </div>
  );
}
