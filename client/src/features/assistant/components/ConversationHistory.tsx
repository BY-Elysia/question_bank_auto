import { useState } from 'react';
import { Plus, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AssistantModel } from '../hooks/useAssistant';
export function ConversationHistory({ m, onSelect }: { m: AssistantModel; onSelect: () => void }) {
  const [rename, setRename] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  return (
    <aside className="chat-history" aria-label="对话历史">
      <Button variant="outline" onClick={m.create} disabled={m.action.busy}>
        <Plus size={16} />
        新建对话
      </Button>
      {m.id && (
        <div className="conversation-management">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setRename(m.conversation.data?.title ?? '');
              setEditingTitle((v) => !v);
            }}
          >
            重命名
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={m.action.busy || !!m.activeRun}
            onClick={() => {
              if (window.confirm('删除当前对话及其消息？')) void m.remove();
            }}
          >
            删除对话
          </Button>
          {editingTitle && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void m.rename(rename).then((ok) => {
                  if (ok) setEditingTitle(false);
                });
              }}
            >
              <input
                aria-label="对话名称"
                value={rename}
                onChange={(e) => setRename(e.target.value)}
                maxLength={100}
              />
              <Button size="sm" disabled={!rename.trim()}>
                保存名称
              </Button>
            </form>
          )}
        </div>
      )}
      <span className="chat-history-label">最近对话</span>
      {m.list.data?.map((c) => (
        <button
          className={`nav-item ${c.id === m.id ? 'active' : ''}`}
          key={c.id}
          onClick={() => {
            m.select(c.id);
            onSelect();
          }}
        >
          <MessageSquare size={15} />
          <span>{c.title}</span>
          {c.pending && <i className="chat-pending-dot" />}
        </button>
      ))}
      {!m.list.loading && !m.list.data?.length && <p className="muted">你的对话会保存在这里。</p>}
    </aside>
  );
}
