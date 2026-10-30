import { uploadProblem } from '../model/upload';
import { useState } from 'react';
import { useAction } from '@/shared/hooks/useAsync';
import { workspaceApi } from '../api/workspaces';
export function useUpload(onOpenChange: (open: boolean) => void, onCreated: (id: string) => void) {
  const [files, setFiles] = useState<File[]>([]),
    [title, setTitle] = useState(''),
    [hover, setHover] = useState(false);
  const action = useAction();
  function choose(list: FileList | File[] | null) {
    if (!list) return;
    const next = Array.from(list);
    action.setError('');
    if (!next.length) return;
    const problem = uploadProblem(next);
    if (problem) {
      action.setError(problem);
      return;
    }
    setFiles(next);
    if (!title) setTitle(next[0].name.replace(/\.[^.]+$/, ''));
  }
  async function submit() {
    if (!title.trim() || !files.length) return;
    await action.run(async () => {
      const w = await workspaceApi.upload(title, files);
      setFiles([]);
      setTitle('');
      onOpenChange(false);
      onCreated(w.id);
    });
  }
  function move(i: number, delta: number) {
    setFiles((current) => {
      const copy = [...current];
      [copy[i], copy[i + delta]] = [copy[i + delta], copy[i]];
      return copy;
    });
  }
  return { files, setFiles, title, setTitle, hover, setHover, action, choose, submit, move };
}
