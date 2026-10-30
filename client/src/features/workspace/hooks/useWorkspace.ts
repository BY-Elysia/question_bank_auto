import { workspaceState } from '../model/selectors';
import { useCallback, useState } from 'react';
import { useResource, useAction } from '@/shared/hooks/useAsync';
import { workspaceApi } from '../api/workspaces';
import { navigate } from '@/shared/navigation';
import { downloadFile } from '@/shared/api/download';
export function useWorkspace(id: string) {
  const loadWorkspace = useCallback((signal: AbortSignal) => workspaceApi.get(id, signal), [id]);
  const { data: view, error, loading, refresh } = useResource(loadWorkspace, 2000);
  const action = useAction();
  const [confirm, setConfirm] = useState(false),
    [history, setHistory] = useState<number[] | null>(null),
    [revision, setRevision] = useState(0),
    [preview, setPreview] = useState(false);
  const w = view?.workspace;
  const { active, runningJob, canExport, step } = workspaceState(view);
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
    command,
    download,
    openHistory,
    remove,
    restore,
  };
}
