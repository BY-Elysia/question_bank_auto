import type { WorkspaceView } from '@/shared/contracts';
export function reviewState(view: WorkspaceView, preview: boolean, page: number) {
  const document = preview
    ? {
        ...view.document,
        contents: view.chapters.flatMap((c) => c.preview?.contents ?? []),
        sections: view.chapters.flatMap((c) => c.preview?.sections ?? []),
      }
    : view.document;
  const contents = document.contents.filter((c) => c.sources.some((s) => s.page === page));
  const pending = view.proposals.filter((p) => p.status === 'pending');
  // Keep historical findings in storage, but a later completed review of the
  // same content owns its current findings. Never clear on merely starting a run.
  const jobs = view.jobs
    .filter((job) => !job.supersededBy)
    .map((job, index, all) => ({
      ...job,
      issues: job.issues.filter(
        (issue) =>
          !issue.contentId ||
          !all
            .slice(index + 1)
            .some(
              (newer) =>
                newer.kind === job.kind &&
                newer.baseRevision === job.baseRevision &&
                newer.processedIds.includes(issue.contentId!),
            ),
      ),
    }));
  const activeJob = jobs.some((j) => ['running', 'queued'].includes(j.status));
  const editable = !preview && view.actions.review && !activeJob;
  const issues = [
    ...document.issues,
    ...jobs.filter((j) => j.baseRevision === view.revision).flatMap((j) => j.issues),
  ];
  return { document, contents, pending, jobs, activeJob, editable, issues };
}
