import { lazy, Suspense } from 'react';
import { Button } from '@/components/ui/button';
const AssistantPanel = lazy(() =>
  import('@/features/assistant').then((m) => ({ default: m.AssistantPanel })),
);
import { InsertQuestionDialog } from './InsertQuestionDialog';
import { ReviewQuestions } from './ReviewQuestions';
import { ReviewJobs } from './ReviewJobs';
import { RepairDialog } from './RepairDialog';
import { ReviewIssues } from './ReviewIssues';
import { ReviewCandidates } from './ReviewCandidates';
import { FileText, Layers3 } from 'lucide-react';
import { ErrorNote } from '@/components/common';
import type { WorkspaceView } from '@/shared/contracts';
import { useReview } from '../hooks/useReview';
import { PageCanvas } from './PageCanvas';
import { EditDialog } from './EditDialog';
export function Review({
  view,
  onChange,
  preview = false,
}: {
  view: WorkspaceView;
  onChange: () => void;
  preview?: boolean;
}) {
  const model = useReview(view, onChange, preview);
  const {
    page,
    setPage,
    selected,
    setSelected,
    tab,
    setTab,
    edit,
    setEdit,
    width,
    setWidth,
    panel,
    action,
    document,
    contents,
    pending,
    issues,
    locate,
    decide,
  } = model;
  return (
    <div className="review">
      <div className="review-heading">
        <div>
          <h2>{preview ? '提取预览' : '每一处细节，都可以核对。'}</h2>
          <p>
            {preview
              ? '阶段预览会持续更新，全部章节完成后统一发布。'
              : '点击题目联动原图，核对来源，确认修改。'}
          </p>
        </div>
      </div>
      {!preview && (
        <Button
          variant="outline"
          className="open-review-assistant"
          onClick={() => model.setAssistantOpen(true)}
        >
          打开教材助手
        </Button>
      )}
      {model.assistantOpen && !preview && (
        <aside className="review-agent-drawer" aria-label="教材助手面板">
          <Suspense fallback={<p>正在打开助手…</p>}>
            <AssistantPanel
              embedded={{
                workspaceId: view.workspace.id,
                contentId: selected,
                revision: view.revision,
                page,
                onChange,
                onClose: () => model.setAssistantOpen(false),
              }}
            />
          </Suspense>
        </aside>
      )}
      <ErrorNote>{action.error}</ErrorNote>
      <ReviewJobs model={model} canReview={view.actions.review} />
      <div className="review-layout">
        <aside className="chapter-tree">
          <div>
            <Layers3 size={15} />
            教材目录
          </div>
          <button className="tree-summary" onClick={() => setPage(1)}>
            <FileText size={15} />
            {view.pages.length} 页 · {document.contents.filter((c) => c.question).length} 道题
          </button>
          {document.sections.map((s) => (
            <button
              key={s.id}
              style={{ paddingLeft: 12 + Math.min(s.level - 1, 3) * 10 }}
              className={s.source.page === page ? 'selected' : ''}
              onClick={() => setPage(s.source.page)}
            >
              <span>{s.title}</span>
              <small>{s.source.page}</small>
            </button>
          ))}
          {!document.sections.length && <p>识别出的章节会显示在这里。</p>}
        </aside>
        <div
          className="comparison"
          ref={panel}
          style={{ '--canvas-width': `${width}%` } as React.CSSProperties}
        >
          <PageCanvas
            pages={view.pages}
            page={page}
            setPage={setPage}
            contents={contents.filter((c) => c.question)}
            selected={selected}
            onSelect={locate}
          />
          <div
            className="resize-handle"
            role="separator"
            aria-label="调整原图与内容面板宽度"
            aria-orientation="vertical"
            aria-valuenow={width}
            aria-valuemin={30}
            aria-valuemax={70}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                e.preventDefault();
                setWidth((v) => Math.max(30, Math.min(70, v + (e.key === 'ArrowLeft' ? -2 : 2))));
              }
            }}
            onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
            onPointerMove={(e) => {
              if (!e.currentTarget.hasPointerCapture(e.pointerId) || !panel.current) return;
              const rect = panel.current.getBoundingClientRect();
              setWidth(Math.max(30, Math.min(70, ((e.clientX - rect.left) / rect.width) * 100)));
            }}
            onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
          >
            <i />
          </div>
          <section className="results-panel">
            <div className="result-tabs">
              {[
                ['questions', '完整题目', document.contents.filter((c) => c.question).length],
                ['proposals', '待审候选', pending.length],
                ['issues', '问题记录', issues.length],
              ].map(([key, label, count]) => (
                <button
                  key={key}
                  className={tab === key ? 'selected' : ''}
                  onClick={() => setTab(String(key))}
                >
                  {label}
                  <span>{count}</span>
                </button>
              ))}
            </div>
            <div className="result-scroll">
              {tab === 'questions' && <ReviewQuestions model={model} />}
              {tab === 'proposals' && (
                <ReviewCandidates
                  pending={pending}
                  disabled={!model.editable || action.busy}
                  onLocate={locate}
                  onDecision={decide}
                />
              )}
              {tab === 'issues' && (
                <ReviewIssues
                  issues={issues}
                  onLocate={(page, contentId) => {
                    setPage(page);
                    setSelected(contentId);
                    setTab('questions');
                  }}
                />
              )}
            </div>
          </section>
        </div>
      </div>
      {edit && (
        <EditDialog
          key={edit.id}
          id={view.workspace.id}
          content={edit}
          revision={view.revision}
          onClose={() => setEdit(null)}
          onSaved={onChange}
        />
      )}
      <RepairDialog model={model} />
      {model.insertion && <InsertQuestionDialog model={model} />}
    </div>
  );
}
