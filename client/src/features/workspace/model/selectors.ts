import type { WorkspaceView, Workspaces } from '@/shared/contracts';
export function workspacePollInterval(view?: WorkspaceView) {
  return !view ||
    ['preparing', 'extracting', 'deleting'].includes(view.workspace.status) ||
    view.jobs.some((job) => ['queued', 'running'].includes(job.status))
    ? 2000
    : 30000;
}
export function dashboardPollInterval(items?: Workspaces) {
  return items?.some((item) => ['preparing', 'extracting', 'deleting'].includes(item.status))
    ? 6000
    : 30000;
}
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
