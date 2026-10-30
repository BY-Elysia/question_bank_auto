import { reviewState } from '../model/selectors';
import { useState, useEffect, useRef } from 'react';
import type { Content, WorkspaceView } from '@/shared/contracts';
import { useAction } from '@/shared/hooks/useAsync';
import { reviewApi } from '../api/review';
export function useReview(view: WorkspaceView, onChange: () => void, preview: boolean) {
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
  const { document, contents, matches, pending, jobs, activeJob, editable, issues } = reviewState(
    view,
    preview,
    page,
    query,
  );
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
      await reviewApi.start(view.workspace.id, {
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
  const commandJob = (jobId: string, command: 'cancel' | 'resume') =>
    action.run(async () => {
      await reviewApi.command(view.workspace.id, jobId, command);
      onChange();
    });
  const decide = (id: string, decision: 'accept' | 'reject') => {
    void action.run(async () => {
      await reviewApi.decide(view.workspace.id, id, view.revision, decision);
      onChange();
    });
  };
  return {
    page,
    setPage,
    selected,
    setSelected,
    tab,
    setTab,
    query,
    setQuery,
    edit,
    setEdit,
    repair,
    setRepair,
    instruction,
    setInstruction,
    width,
    setWidth,
    panel,
    action,
    document,
    contents,
    matches,
    pending,
    jobs,
    activeJob,
    editable,
    issues,
    locate,
    job,
    commandJob,
    decide,
  };
}
export type ReviewController = ReturnType<typeof useReview>;
