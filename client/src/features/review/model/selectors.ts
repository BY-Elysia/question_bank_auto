import type { WorkspaceView } from '@/shared/contracts';
export function reviewState(view: WorkspaceView, preview: boolean, page: number, query: string) {
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
  return { document, contents, matches, pending, jobs, activeJob, editable, issues };
}
