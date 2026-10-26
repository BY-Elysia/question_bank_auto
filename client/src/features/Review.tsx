import { kindNames } from '@/lib/labels';
import { ReviewIssues } from './ReviewIssues';
import { ReviewCandidates } from './ReviewCandidates';
import { useEffect, useRef, useState } from 'react';
import { FileText, Layers3, Pencil, Search, ShieldCheck, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { ContentBody } from '@/components/ContentBody';
import { Empty, ErrorNote, Status } from '@/components/common';
import { type Content, type WorkspaceView, bookUrl, write } from '@/lib/api';
import { useAction } from '@/lib/hooks';
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
  const [page, setPage] = useState(1),
    [selected, setSelected] = useState<string | null>(null),
    [tab, setTab] = useState('content'),
    [query, setQuery] = useState(''),
    [edit, setEdit] = useState<Content | null>(null),
    [repair, setRepair] = useState<Content | null>(null),
    [instruction, setInstruction] = useState(''),
    [width, setWidth] = useState(52);
  const panel = useRef<HTMLDivElement>(null);
  const action = useAction();
  const document = preview
    ? {
        ...view.document,
        contents: view.chapters.flatMap((c) => c.preview?.contents ?? []),
        sections: view.chapters.flatMap((c) => c.preview?.sections ?? []),
      }
    : view.document;
  const contents = document.contents.filter((c) => c.sources.some((s) => s.page === page));
  const matches = contents.filter((c) =>
    (c.question?.prompt ?? c.text).toLowerCase().includes(query.toLowerCase()),
  );
  const pending = view.proposals.filter((p) => p.status === 'pending');
  const jobs = view.jobs;
  const activeJob = jobs.some((j) => ['running', 'queued'].includes(j.status));
  const editable = !preview && view.actions.review && !activeJob;
  const issues = [
    ...document.issues,
    ...jobs.filter((j) => j.baseRevision === view.revision).flatMap((j) => j.issues),
  ];
  function locate(c: Content) {
    setSelected(c.id);
    if (!c.sources.some((s) => s.page === page)) setPage(c.sources[0].page);
    setTab('content');
  }
  useEffect(() => {
    if (selected) {
      const element = window.document.getElementById(`content-${selected}`);
      const container = element?.closest('.result-scroll');
      if (element && container) {
        const item = element.getBoundingClientRect(),
          bounds = container.getBoundingClientRect();
        if (item.top < bounds.top || item.bottom > bounds.bottom)
          container.scrollTo({ top: container.scrollTop + item.top - bounds.top - 12 });
      }
    }
  }, [selected, page, tab]);
  async function job(kind: 'verify' | 'repair' | 'answers', content?: Content) {
    await action.run(async () => {
      await write(bookUrl(view.workspace.id) + '/jobs', {
        kind,
        ...(content ? { contentIds: [content.id] } : {}),
        ...(kind === 'repair' ? { instruction } : {}),
        cache: view.workspace.settings?.cache ?? 'prefix',
      });
      setRepair(null);
      setInstruction('');
      onChange();
    });
  }
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
        {!preview && (
          <div className="review-actions">
            <Button
              variant="outline"
              disabled={!editable || action.busy}
              onClick={() => job('verify')}
            >
              <ShieldCheck size={15} />
              核对全书
            </Button>
            <Button
              variant="outline"
              disabled={!editable || action.busy}
              onClick={() => job('answers')}
            >
              <Sparkles size={15} />
              补全缺失答案
            </Button>
          </div>
        )}
      </div>
      <ErrorNote>{action.error}</ErrorNote>
      {jobs
        .filter((j) =>
          ['running', 'queued', 'failed', 'interrupted', 'cancelled'].includes(j.status),
        )
        .map((j) => (
          <div className="job-notice" key={j.id}>
            <Status status={j.status} />
            <span>
              {
                { verify: '原文核对', repair: '内容修复', answers: '答案补全', parse: '题目提取' }[
                  j.kind
                ]
              }
              {j.error ? ` · ${j.error}` : ''}
            </span>
            {['running', 'queued'].includes(j.status) ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={action.busy}
                onClick={() =>
                  action.run(async () => {
                    await write(bookUrl(view.workspace.id) + `/jobs/${j.id}/cancel`);
                    onChange();
                  })
                }
              >
                取消任务
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                disabled={action.busy || activeJob || !view.actions.review}
                onClick={() =>
                  action.run(async () => {
                    await write(bookUrl(view.workspace.id) + `/jobs/${j.id}/resume`);
                    onChange();
                  })
                }
              >
                恢复任务
              </Button>
            )}
          </div>
        ))}
      <div className="review-layout">
        <aside className="chapter-tree">
          <div>
            <Layers3 size={15} />
            教材目录
          </div>
          <button className="tree-summary" onClick={() => setPage(1)}>
            <FileText size={15} />
            {view.pages.length} 页 · {document.contents.length} 个内容块
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
            contents={contents}
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
                ['content', '提取结果', document.contents.length],
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
              {tab === 'content' && (
                <>
                  <label className="search">
                    <Search size={14} />
                    <input
                      aria-label="搜索当前页内容"
                      placeholder="搜索当前页内容…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
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
                            {c.question?.label ? `第 ${c.question.label} 题` : '内容块'}
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
                          <button
                            disabled={!editable || action.busy}
                            onClick={() => job('verify', c)}
                          >
                            <ShieldCheck size={13} />
                            核对
                          </button>
                        </footer>
                      )}
                    </article>
                  ))}
                  {!matches.length && (
                    <Empty title="此页暂无匹配内容">可切换页面或等待提取结果。</Empty>
                  )}
                </>
              )}
              {tab === 'proposals' && (
                <ReviewCandidates
                  pending={pending}
                  disabled={!editable || action.busy}
                  onLocate={locate}
                  onDecision={(id, decision) => {
                    void action.run(async () => {
                      await write(bookUrl(view.workspace.id) + `/proposals/${id}/decision`, {
                        expectedRevision: view.revision,
                        decision,
                      });
                      onChange();
                    });
                  }}
                />
              )}
              {tab === 'issues' && (
                <ReviewIssues
                  issues={issues}
                  onLocate={(page, contentId) => {
                    setPage(page);
                    setSelected(contentId);
                    setTab('content');
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
      <Dialog
        open={!!repair}
        onOpenChange={(v) => {
          if (!v && !action.busy) setRepair(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>对照原图，修复内容</DialogTitle>
            <DialogDescription>说明需要修正的内容，AI 将生成候选供你审核。</DialogDescription>
          </DialogHeader>
          <label className="field">
            修复要求
            <textarea
              rows={5}
              value={instruction}
              maxLength={8000}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="例如：修正第二个小问中的公式，保留其他内容"
            />
          </label>
          <ErrorNote>{action.error}</ErrorNote>
          <Button
            disabled={!instruction.trim() || action.busy}
            onClick={() => repair && job('repair', repair)}
          >
            {action.busy ? '提交中…' : '生成修复候选'}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
