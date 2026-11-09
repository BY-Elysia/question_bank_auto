import { useState, useEffect } from 'react';
import { ContentBody } from '@/components/ContentBody';
import { Empty } from '@/components/common';
import type { ReviewController } from '../hooks/useReview';

/** Whole questions use the assembled document, scoped to the selected section, independent of the source page. */
export function ReviewQuestions({ model }: { model: ReviewController }) {
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(10);
  const questions = model.questions;
  const matches = questions.filter((c) =>
    JSON.stringify(c.question).toLowerCase().includes(query.toLowerCase()),
  );
  useEffect(() => {
    if (!model.selected) return;
    const index = questions.findIndex((c) => c.id === model.selected);
    if (index >= 0) {
      setQuery('');
      setLimit((n) => Math.max(n, index + 1));
    }
  }, [model.selected, questions.length]);
  // Source navigation can target a question beyond the first rendered batch.
  // Reveal it after the expanded list has actually committed to the DOM.
  useEffect(() => {
    if (!model.selected) return;
    const element = document.getElementById(`content-${model.selected}`);
    const container = element?.closest('.result-scroll');
    if (element && container) {
      const item = element.getBoundingClientRect(),
        bounds = container.getBoundingClientRect();
      if (item.top < bounds.top || item.bottom > bounds.bottom)
        container.scrollTo({ top: container.scrollTop + item.top - bounds.top - 12 });
    }
  }, [model.selected, limit, query]);
  useEffect(() => {
    if (!model.selected) model.panel.current?.querySelector('.result-scroll')?.scrollTo({ top: 0 });
  }, []);
  return (
    <>
      <p>
        {model.activeSection ? `当前小节：${model.activeSection.title}。` : '全部题目。'}
        按提取顺序展示，保留完整跨页内容、选项与解答。
      </p>
      <label className="search">
        <input
          aria-label="搜索完整题目"
          placeholder={
            model.activeSection ? '搜索本节题目、答案或解析…' : '搜索全部题目、答案或解析…'
          }
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(10);
          }}
        />
      </label>
      {matches.slice(0, limit).map((c) => (
        <article
          id={`content-${c.id}`}
          className={`content-card ${model.selected === c.id ? 'selected' : ''}`}
          key={c.id}
        >
          <div className="content-card-header">
            <strong>{c.question!.label ? `题目 ${c.question!.label}` : '题目'}</strong>
            <div>
              {[...new Set(c.sources.map((s) => s.page))].map((page) => (
                <button
                  key={page}
                  className="page-reference"
                  aria-label={`查看题目 ${c.question!.label || c.id} 第 ${page} 页原图`}
                  onClick={() => {
                    model.setPage(page);
                    model.setSelected(c.id);
                  }}
                >
                  P.{page}
                </button>
              ))}
            </div>
          </div>
          <ContentBody content={c} />
          <footer className="question-actions">
            <button onClick={() => model.askAssistant(c)}>向助手提问</button>
            <button
              disabled={!model.editable || model.action.busy}
              onClick={() => model.setEdit(c)}
            >
              编辑题目
            </button>
            <button
              disabled={!model.editable || model.action.busy}
              onClick={() => {
                model.setRepair(c);
                model.setInstruction('');
              }}
            >
              AI 修复
            </button>
            <button
              disabled={!model.editable || model.action.busy}
              onClick={() => model.job('verify', c)}
            >
              核对本题
            </button>
            <button
              disabled={!model.editable || model.action.busy}
              onClick={() => model.job('answers', c)}
            >
              补全本题答案
            </button>
            <button
              disabled={!model.editable || model.action.busy}
              onClick={() => model.setInsertion({ anchor: c, position: 'before' })}
            >
              上方添加题目
            </button>
            <button
              disabled={!model.editable || model.action.busy}
              onClick={() => model.setInsertion({ anchor: c, position: 'after' })}
            >
              下方添加题目
            </button>
          </footer>
        </article>
      ))}
      {!matches.length && <Empty title="暂无匹配题目">等待题目提取完成，或调整搜索条件。</Empty>}
      {matches.length > limit && (
        <button className="page-reference" onClick={() => setLimit((n) => n + 10)}>
          加载更多题目（已显示 {limit} / {matches.length}）
        </button>
      )}
    </>
  );
}
