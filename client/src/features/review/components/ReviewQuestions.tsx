import { useState } from 'react';
import { ContentBody } from '@/components/ContentBody';
import { Empty } from '@/components/common';
import type { ReviewController } from '../hooks/useReview';

/** Whole questions use the assembled document, independent of the selected source page. */
export function ReviewQuestions({ model }: { model: ReviewController }) {
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(10);
  const questions = model.document.contents.filter((c) => c.question);
  const matches = questions.filter((c) =>
    JSON.stringify(c.question).toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <p>按提取顺序展示完整题目，包含跨页题干、子题、选项及已有答案与解析。</p>
      <label className="search">
        <input
          aria-label="搜索完整题目"
          placeholder="搜索全部题目、答案或解析…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(10);
          }}
        />
      </label>
      {matches.slice(0, limit).map((c) => (
        <article className="content-card" key={c.id}>
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
          <footer>
            <button onClick={() => model.locate(c)}>查看内容块与修复</button>
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
