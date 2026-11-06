import { workspaceState, workspacePollInterval } from '../model/selectors';
import { useCallback, useState, useEffect } from 'react';
import { useResource, useAction } from '@/shared/hooks/useAsync';
import { workspaceApi } from '../api/workspaces';
import { navigate } from '@/shared/navigation';
import { downloadFile } from '@/shared/api/download';
export function useWorkspace(id: string) {
  const [preview, setPreview] = useState(false);
  const loadWorkspace = useCallback(
    (signal: AbortSignal) => workspaceApi.get(id, signal, preview),
    [id, preview],
  );
  const { data: view, error, loading, refresh } = useResource(loadWorkspace, workspacePollInterval);
  const action = useAction();
  const [confirm, setConfirm] = useState(false),
    [history, setHistory] = useState<number[] | null>(null),
    [revision, setRevision] = useState(0);
  const w = view?.workspace;
  const { active, runningJob, canExport, step, extractionComplete, answerFailed } =
    workspaceState(view);
  // Start the visible source image while the math/review chunk downloads.
  // Only completed workspaces need this; upload/configuration stay lightweight.
  useEffect(() => {
    if (!extractionComplete || !view?.pages[0]) return;
    const link = document.createElement('link');
    link.rel = 'preload'; link.as = 'image';
    link.href = view.pages[0].previewUrl || view.pages[0].imageUrl;
    link.fetchPriority = 'high';
    document.head.appendChild(link);
    return () => link.remove();
  }, [extractionComplete, id]);
  async function command(name: 'cancel' | 'resume') {
    await action.run(async () => {
      await workspaceApi.command(id, name);
      refresh();
    });
  }
  async function download(url: string, extension: string) {
    await action.run(async () => {
      await downloadFile(url, `${(w?.title ?? '教材').replace(/[\\/:*?"<>|]/g, '_')}.${extension}`);
    });
  }
  const openHistory = () =>
    action.run(async () => {
      const list = await workspaceApi.revisions(id);
      setHistory(list.map((r) => r.revision));
      setRevision(view!.revision);
    });
  const remove = () =>
    action.run(async () => {
      await workspaceApi.remove(id);
      navigate();
    });
  const restore = () =>
    action.run(async () => {
      await workspaceApi.restore(id, view!.revision, revision);
      setHistory(null);
      refresh();
    });
  return {
    view,
    error,
    loading,
    refresh,
    action,
    confirm,
    setConfirm,
    history,
    setHistory,
    revision,
    setRevision,
    preview,
    setPreview,
    active,
    runningJob,
    canExport,
    step,
    extractionComplete,
    answerFailed,
    command,
    download,
    openHistory,
    remove,
    restore,
  };
}
