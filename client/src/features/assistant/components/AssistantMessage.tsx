import { useState } from 'react';
import type { Conversation } from '@/shared/contracts';
import RichText from '@/components/RichText';
import { CitationDialog } from './CitationDialog';
export function AssistantMessage({
  message,
  conversationId,
}: {
  message: Conversation['messages'][number];
  conversationId: string;
}) {
  const [source, setSource] = useState<string | null>(null),
    citations = message.citations ?? [];
  const text = message.content.replace(/\[来源:([a-zA-Z0-9_-]+)\]/g, (_all, id: string) => {
    const i = citations.findIndex((c) => c.id === id);
    return i >= 0
      ? `[来源 ${i + 1}](#source/${id})`
      : message.status === 'pending'
        ? '[来源校验中]'
        : '[来源未验证]';
  });
  return (
    <>
      <RichText
        text={text}
        onSource={(id) => {
          if (citations.some((c) => c.id === id)) setSource(id);
        }}
      />
      {!!citations.length && (
        <div className="citation-links">
          {citations.map((c, i) => (
            <button key={c.id} onClick={() => setSource(c.id)}>
              <b>{i + 1}</b> {c.title} · {c.label}
              <small>
                第 {[...new Set(c.sources.map((s) => s.page))].join('、')} 页
                {c.answerOrigin === 'ai_generated'
                  ? ' · AI 生成答案'
                  : c.answerOrigin === 'human'
                    ? ' · 人工修改答案'
                    : ''}
                {c.answerReview === 'pending' ? ' · 待确认' : ''}
              </small>
            </button>
          ))}
        </div>
      )}
      {source && (
        <CitationDialog
          conversationId={conversationId}
          id={source}
          onClose={() => setSource(null)}
        />
      )}
    </>
  );
}
