import { useRef, useEffect, type ReactNode } from 'react';
import { ArrowUp, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorNote } from '@/components/common';
import { AssistantMessage } from './AssistantMessage';
import { RunControls } from './RunControls';
import type { AssistantModel } from '../hooks/useAssistant';
/** Shared presentation only: each host owns context, permissions and resource lifecycle. */
export function ConversationView({
  m,
  embedded = false,
  afterMessages,
  error,
  sendBlocked = false,
}: {
  m: AssistantModel;
  embedded?: boolean;
  afterMessages?: ReactNode;
  error?: string;
  sendBlocked?: boolean;
}) {
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
    <>
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
            <h2>{embedded ? '这道题，需要怎样处理？' : '今天，想聊些什么？'}</h2>
            <p>从一个问题、一点灵感，或一道难题开始。</p>
            <div className="chat-suggestions">
              {(embedded
                ? ['核对这道题的公式，先说明问题', '根据原图修复这道题', '补全这道题缺失的答案']
                : ['帮我讲解一个数学概念', '一起梳理解题思路', '帮我制定学习计划']
              ).map((s) => (
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

          {m.messages
            .filter(
              (message) =>
                message.content ||
                message.status === 'pending' ||
                message.error ||
                message.citations?.length,
            )
            .map((message) => (
              <article className={`chat-message ${message.role}`} key={message.id}>
                <small>{message.role === 'user' ? '你' : 'AI 助手'}</small>
                <AssistantMessage message={message} conversationId={m.id!} />
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
        {afterMessages}
      </div>
      <div className="chat-composer-area">
        {m.activeRun && m.tool && (
          <p className="chat-tool-status" role="status">
            {(
              {
                run_question_action: '处理当前题目',
                read_question_page: '查看题目原图',
                undo_question_change: '撤销修改',
                list_question_changes: '读取修改记录',
                list_workspaces: '查看可用教材',
                get_workspace_outline: '读取教材目录',
                search_questions: '查询题目',
                get_question: '读取完整题目',
                get_source_excerpt: '读取来源',
              } as Record<string, string>
            )[m.tool.name] ?? '读取资料'}{' '}
            ·{' '}
            {m.tool.status === 'running'
              ? '进行中'
              : m.tool.status === 'failed'
                ? '未完成'
                : '已完成'}
          </p>
        )}
        <RunControls run={m.run} busy={m.action.busy} onCommand={m.command} onAnswer={m.answer} />
        <ErrorNote>{m.action.error || error || m.conversation.error || m.list.error}</ErrorNote>
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
                if (!m.action.busy && !sendBlocked && m.text.trim()) void m.send();
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
            <Button
              type="submit"
              aria-label="发送"
              disabled={m.action.busy || sendBlocked || !m.text.trim()}
            >
              <ArrowUp size={19} />
            </Button>
          </div>
        </form>
        <p className="chat-footnote">
          AI 可能出错，请核实重要信息。可读取选定教材，点击来源核对原文。
        </p>
      </div>
    </>
  );
}
