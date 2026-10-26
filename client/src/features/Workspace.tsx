import { useState } from 'react';
import { ArrowLeft, Download, History, Pause, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Steps, Status, ErrorNote, Loading } from '@/components/common';
import { useAction, useResource } from '@/lib/hooks';
import { type WorkspaceView, workspaceUrl, bookUrl, navigate, write, request } from '@/lib/api';
import { Configure } from './Configure';
import { Processing } from './Processing';
import { Review } from './Review';
export function WorkspacePage({ id }: { id: string }) {
  const {
    data: view,
    error,
    loading,
    refresh,
  } = useResource<WorkspaceView>(workspaceUrl(id), 2000);
  const action = useAction();
  const [confirm, setConfirm] = useState(false),
    [history, setHistory] = useState<number[] | null>(null),
    [revision, setRevision] = useState(0),
    [preview, setPreview] = useState(false);
  if (loading && !view) return <Loading />;
  if (!view)
    return (
      <div className="workspace-page">
        <ErrorNote>{error}</ErrorNote>
        <Button onClick={refresh}>重试</Button>
        <Button variant="ghost" onClick={() => navigate()}>
          返回工作区
        </Button>
      </div>
    );
  const w = view.workspace,
    active = ['preparing', 'extracting'].includes(w.status),
    runningJob = view.jobs.some((j) => ['queued', 'running'].includes(j.status)),
    canExport = view.actions.export && !runningJob,
    step =
      w.status === 'preparing'
        ? 0
        : w.status === 'ready'
          ? 1
          : active || view.actions.resume
            ? 2
            : 3;
  async function command(name: string) {
    await action.run(async () => {
      await write(workspaceUrl(id) + '/' + name);
      refresh();
    });
  }
  async function download(url: string, extension: string) {
    await action.run(async () => {
      const response = await fetch(url);
      if (!response.ok) throw new Error('导出失败，请刷新后重试。');
      const blob = await response.blob(),
        link = document.createElement('a'),
        objectUrl = URL.createObjectURL(blob);
      link.href = objectUrl;
      link.download = `${w.title.replace(/[\\/:*?"<>|]/g, '_')}.${extension}`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
    });
  }
  return (
    <div className="workspace-page">
      <button className="back-link" onClick={() => navigate()}>
        <ArrowLeft size={14} />
        全部工作区
      </button>
      <div className="workspace-heading">
        <div>
          <div className="eyebrow">TEXTBOOK WORKSPACE</div>
          <h1>{w.title}</h1>
          <p>
            {w.sourceKind === 'pdf' ? 'PDF 教材' : '图片教材'} · {w.totalPages} 页{' '}
            <span className="mono">REV.{String(view.revision).padStart(2, '0')}</span>
          </p>
        </div>
        <div className="workspace-tools">
          <Status status={w.status} />
          {view.actions.cancel && (
            <Button variant="outline" disabled={action.busy} onClick={() => command('cancel')}>
              <Pause size={14} />
              暂停处理
            </Button>
          )}
          {view.actions.resume && (
            <Button disabled={action.busy} onClick={() => command('resume')}>
              <RotateCcw size={14} />
              恢复处理
            </Button>
          )}
          {canExport && (
            <>
              <Button
                variant="outline"
                disabled={action.busy}
                onClick={() =>
                  action.run(async () => {
                    const list = await request<{ revision: number }[]>(bookUrl(id) + '/revisions');
                    setHistory(list.map((r) => r.revision));
                    setRevision(view.revision);
                  })
                }
              >
                <History size={15} />
                历史
              </Button>
              <Button
                variant="outline"
                disabled={action.busy}
                onClick={() => download(view.exportJsonUrl, 'json')}
              >
                <Download size={15} />
                JSON
              </Button>
              <Button disabled={action.busy} onClick={() => download(view.exportZipUrl, 'zip')}>
                <Download size={15} />
                导出资料包
              </Button>
            </>
          )}
          {view.actions.delete && (
            <Button
              variant="ghost"
              size="icon"
              disabled={action.busy || runningJob}
              aria-label="删除工作区"
              onClick={() => setConfirm(true)}
            >
              <Trash2 size={16} />
            </Button>
          )}
        </div>
      </div>
      <Steps step={step} />
      <ErrorNote>{error || action.error}</ErrorNote>
      {w.error && (
        <div className="error-note" role="alert">
          {w.error}
        </div>
      )}
      {w.status === 'ready' && <Configure view={view} onDone={refresh} />}
      {active && <Processing view={view} />}
      {(active || view.actions.resume) && !!view.chapters.length && (
        <div className="preview-toggle">
          <Button variant="outline" onClick={() => setPreview((v) => !v)}>
            {preview ? '收起' : '查看'}已提取内容预览
          </Button>
        </div>
      )}
      {preview && (active || view.actions.resume) && (
        <Review view={view} onChange={refresh} preview />
      )}
      {!active && !view.actions.resume && view.revision > 0 && (
        <Review view={view} onChange={refresh} />
      )}
      {w.status === 'deleting' && <Loading />}
      <Dialog
        open={confirm}
        onOpenChange={(v) => {
          if (!action.busy) setConfirm(v);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除这个工作区？</DialogTitle>
            <DialogDescription>
              将删除「{w.title}」的原图、提取结果、章节任务与修复记录。此操作无法撤销。
            </DialogDescription>
          </DialogHeader>
          <ErrorNote>{action.error}</ErrorNote>
          <div className="dialog-actions">
            <Button variant="outline" onClick={() => setConfirm(false)}>
              保留工作区
            </Button>
            <Button
              variant="destructive"
              disabled={action.busy}
              onClick={() =>
                action.run(async () => {
                  await write(workspaceUrl(id), undefined, 'DELETE');
                  navigate();
                })
              }
            >
              确认删除
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={history !== null}
        onOpenChange={(v) => {
          if (!v && !action.busy) setHistory(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>文档版本</DialogTitle>
            <DialogDescription>恢复旧版会创建新的修订，不会抹去历史记录。</DialogDescription>
          </DialogHeader>
          <label className="field">
            选择要恢复的版本
            <select value={revision} onChange={(e) => setRevision(Number(e.target.value))}>
              {history?.map((r) => (
                <option key={r} value={r}>
                  修订 {r}
                  {r === view.revision ? ' · 当前版本' : ''}
                </option>
              ))}
            </select>
          </label>
          <ErrorNote>{action.error}</ErrorNote>
          <Button
            disabled={revision === view.revision || action.busy}
            onClick={() =>
              action.run(async () => {
                await write(bookUrl(id) + '/restore', {
                  expectedRevision: view.revision,
                  revision,
                });
                setHistory(null);
                refresh();
              })
            }
          >
            恢复为新修订
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
