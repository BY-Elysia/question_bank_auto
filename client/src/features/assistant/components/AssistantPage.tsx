import { useAssistant } from '../hooks/useAssistant';
import { Button } from '@/components/ui/button';
import { ErrorNote } from '@/components/common';
import RichText from '@/components/RichText';
export default function AssistantPage() {
  const m = useAssistant();
  return (
    <div className="workspace-page assistant-page">
      <h1>AI 助手</h1>
      <p className="muted">普通对话 · 当前不读取或修改工作区、数据库。</p>
      <div className="assistant-layout">
        <aside className="panel">
          <Button onClick={m.create} disabled={m.action.busy}>
            新建对话
          </Button>
          {m.list.data?.map((c) => (
            <button
              className={`nav-item ${c.id === m.id ? 'active' : ''}`}
              key={c.id}
              onClick={() => m.select(c.id)}
            >
              {c.title}
              {c.pending ? ' · 生成中' : ''}
            </button>
          ))}
        </aside>
        <section className="panel">
          <div className="chat-messages" aria-live="polite">
            {m.conversation.data?.messages.map((message) => (
              <article className={`chat-message ${message.role}`} key={message.id}>
                <small>{message.role === 'user' ? '你' : 'AI 助手'}</small>
                <RichText text={message.content} />
                {message.status === 'pending' && <p>正在回复… 切换页面不影响生成。</p>}
                <ErrorNote>{message.error}</ErrorNote>
              </article>
            ))}
          </div>
          <ErrorNote>{m.action.error || m.conversation.error || m.list.error}</ErrorNote>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void m.send();
            }}
          >
            <label className="field">
              消息
              <textarea
                aria-label="消息"
                rows={4}
                maxLength={20000}
                value={m.text}
                onChange={(e) => m.setText(e.target.value)}
              />
            </label>
            <Button type="submit" disabled={m.action.busy || m.pending || !m.text.trim()}>
              发送
            </Button>
          </form>
        </section>
      </div>
    </div>
  );
}
