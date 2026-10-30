import type { WorkspaceView } from '@/shared/contracts';
export function workspaceState(view?: WorkspaceView) {
  const w = view?.workspace,
    active = ['preparing', 'extracting'].includes(w?.status ?? ''),
    runningJob = view?.jobs.some((j) => ['queued', 'running'].includes(j.status)),
    canExport = !!view?.actions.export && !runningJob,
    step =
      w?.status === 'preparing'
        ? 0
        : w?.status === 'ready'
          ? 1
          : active || view?.actions.resume
            ? 2
            : 3;
  return { active, runningJob, canExport, step };
}
