import { kindNames } from '@/lib/labels';
import { Pencil, Sparkles, ShieldCheck } from 'lucide-react';
import { ContentBody } from '@/components/ContentBody';
import { Empty } from '@/components/common';
import type { ReviewController } from '../hooks/useReview';
export function ReviewContentList({
  model,
  preview,
}: {
  model: ReviewController;
  preview: boolean;
}) {
  const {
    matches,
    selected,
    locate,
    setPage,
    setSelected,
    editable,
    action,
    setEdit,
    setRepair,
    setInstruction,
    job,
  } = model;
  return (
    <>
      {matches.map((c) => (
        <article
          id={`content-${c.id}`}
          className={`content-card ${selected === c.id ? 'selected' : ''}`}
          key={c.id}
        >
          <div className="content-card-header">
            <button onClick={() => locate(c)}>
              <span>{kindNames[c.kind]}</span>
              <strong>
                {c.question?.label
                  ? /^\d+$/.test(c.question.label)
                    ? `第 ${c.question.label} 题`
                    : c.question.label
                  : '内容块'}
              </strong>
            </button>
            <div>
              {c.sources
                .map((s) => s.page)
                .filter((v, i, a) => a.indexOf(v) === i)
                .map((n) => (
                  <button
                    key={n}
                    className="page-reference"
                    onClick={() => {
                      setPage(n);
                      setSelected(c.id);
                    }}
                  >
                    P.{n}
                  </button>
                ))}
            </div>
          </div>
          <ContentBody content={c} />
          {!preview && (
            <footer>
              <button disabled={!editable || action.busy} onClick={() => setEdit(c)}>
                <Pencil size={13} />
                编辑
              </button>
              <button
                disabled={!editable || action.busy}
                onClick={() => {
                  setRepair(c);
                  setInstruction('');
                }}
              >
                <Sparkles size={13} />
                AI 修复
              </button>
              <button disabled={!editable || action.busy} onClick={() => job('verify', c)}>
                <ShieldCheck size={13} />
                核对
              </button>
            </footer>
          )}
        </article>
      ))}
      {!matches.length && <Empty title="此页暂无匹配内容">可切换页面或等待提取结果。</Empty>}
    </>
  );
}
