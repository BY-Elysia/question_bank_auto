import { RunControls } from './RunControls';
import { useState, useRef, useEffect } from 'react';
import {
  ArrowUp,
  MessageSquare,
  Plus,
  Settings2,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
} from 'lucide-react';
import { useAssistant } from '../hooks/useAssistant';
import { Button } from '@/components/ui/button';
import { ErrorNote } from '@/components/common';
import RichText from '@/components/RichText';
export default function AssistantPage() {
  const m = useAssistant();
  const [history, setHistory] = useState(false);
  const [rename, setRename] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const scroll = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  useEffect(() => {
    follow.current = true;
  }, [m.id]);
  useEffect(() => {
    if (follow.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [m.conversation.data, m.messages.at(-1)?.content]);
  const empty = !m.messages.length;
  return (
    <div className={`assistant-page chat-workbench ${history ? 'history-open' : ''}`}>
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
              setHistory(false);
            }}
          >
            <MessageSquare size={15} />
            <span>{c.title}</span>
            {c.pending && <i className="chat-pending-dot" />}
          </button>
        ))}
        {!m.list.loading && !m.list.data?.length && <p className="muted">你的对话会保存在这里。</p>}
      </aside>
      <section className="chat-main">
        <header className="chat-topbar">
          <div>
            <button
              className="chat-history-toggle"
              aria-label="切换对话历史"
              onClick={() => setHistory((v) => !v)}
            >
              {history ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
            </button>
            <h1>AI 助手</h1>
            <span className="chat-model-label">独立模型配置</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => (location.hash = '/assistant/settings')}>
            <Settings2 size={15} />
            模型设置
          </Button>
        </header>
        <div
          ref={scroll}
          className={`chat-messages ${empty ? 'chat-empty' : ''}`}
          aria-live="polite"
          onScroll={() => {
            const el = scroll.current;
            if (el) follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
          }}
        >
          {empty && (
            <div className="chat-welcome">
              <div className="chat-orb">
                <Sparkles size={28} />
              </div>
              <h2>今天，想聊些什么？</h2>
              <p>从一个问题、一点灵感，或一道难题开始。</p>
              <div className="chat-suggestions">
                {['帮我讲解一个数学概念', '一起梳理解题思路', '帮我制定学习计划'].map((s) => (
                  <button key={s} onClick={() => m.setText(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="chat-thread">
            {m.nextCursor && (
              <Button variant="ghost" onClick={m.loadOlder} disabled={m.action.busy}>
                显示更早消息
              </Button>
            )}

            {m.messages.map((message) => (
              <article className={`chat-message ${message.role}`} key={message.id}>
                <small>{message.role === 'user' ? '你' : 'AI 助手'}</small>
                <RichText text={message.content} />
                {message.status === 'pending' && (
                  <p className="chat-thinking">
                    <span />
                    <span />
                    <span />
                    <span className="sr-only">正在回复… 切换页面不影响生成。</span>
                  </p>
                )}
                <ErrorNote>{message.error}</ErrorNote>
              </article>
            ))}
          </div>
        </div>
        <div className="chat-composer-area">
          <RunControls run={m.run} busy={m.action.busy} onCommand={m.command} onAnswer={m.answer} />
          <ErrorNote>{m.action.error || m.conversation.error || m.list.error}</ErrorNote>
          <form
            className="chat-composer"
            onSubmit={(e) => {
              e.preventDefault();
              void m.send();
            }}
          >
            <textarea
              aria-label="消息"
              placeholder="向 AI 助手发送消息…"
              rows={3}
              maxLength={20000}
              value={m.text}
              onChange={(e) => m.setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  if (!m.action.busy && m.text.trim()) void m.send();
                }
              }}
            />
            <div className="chat-composer-footer">
              {m.activeRun ? (
                <select
                  aria-label="发送方式"
                  value={m.mode}
                  onChange={(e) => m.setMode(e.target.value as typeof m.mode)}
                >
                  <option value="steer">
                    {m.activeRun.status === 'waiting_input' ? '回答当前问题' : '插话 · 优先处理'}
                  </option>
                  <option value="interrupt">打断并改向</option>
                  <option value="follow_up">完成后追加</option>
                </select>
              ) : (
                <span>Enter 发送 · Shift + Enter 换行</span>
              )}
              <Button type="submit" aria-label="发送" disabled={m.action.busy || !m.text.trim()}>
                <ArrowUp size={19} />
              </Button>
            </div>
          </form>
          <p className="chat-footnote">AI 可能出错，请核实重要信息。当前对话不访问教材或数据库。</p>
        </div>
      </section>
    </div>
  );
}
