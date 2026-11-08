import { insertQuestion } from '../api/insertion';
import { reviewState } from '../model/selectors';
import { useState, useRef, useEffect } from 'react';
import type { Content, WorkspaceView } from '@/shared/contracts';
import { useAction } from '@/shared/hooks/useAsync';
import { reviewApi } from '../api/review';
export function useReview(view: WorkspaceView, onChange: () => void, preview: boolean) {
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [page, setPage] = useState(1),
    [selected, setSelected] = useState<string | null>(null),
    [tab, setTab] = useState('questions'),
    [insertion, setInsertion] = useState<{ anchor: Content; position: 'before' | 'after' } | null>(
      null,
    ),
    [edit, setEdit] = useState<Content | null>(null),
    [repair, setRepair] = useState<Content | null>(null),
    [instruction, setInstruction] = useState(''),
    [width, setWidth] = useState(52);
  const panel = useRef<HTMLDivElement>(null);
  const action = useAction();
  const { document, contents, pending, jobs, activeJob, editable, issues } = reviewState(
    view,
    preview,
    page,
  );
  useEffect(() => {
    const applySource = () => {
      const raw = sessionStorage.getItem('review-source');
      if (!raw) return;
      try {
        const target = JSON.parse(raw);
        if (target.workspaceId !== view.workspace.id) return;
        sessionStorage.removeItem('review-source');
        if (target.revision !== view.revision) return;
        const c = view.document.contents.find((c) => c.id === target.contentId);
        if (c) {
          setSelected(c.id);
          setPage(target.page ?? c.sources[0].page);
          setTab('questions');
        }
      } catch {
        sessionStorage.removeItem('review-source');
      }
    };
    applySource();
    window.addEventListener('review-source-selected', applySource);
    return () => window.removeEventListener('review-source-selected', applySource);
  }, [view.workspace.id, view.revision]);
  function locate(c: Content) {
    setSelected(c.id);
    if (!c.sources.some((s) => s.page === page)) setPage(c.sources[0].page);
    setTab('questions');
  }
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
      if (command === 'resume' && view.actions.resume && jobId === view.workspace.answersJobId)
        await reviewApi.resumeWorkspace(view.workspace.id);
      else await reviewApi.command(view.workspace.id, jobId, command);
      onChange();
    });
  const decide = (id: string, decision: 'accept' | 'reject') => {
    void action.run(async () => {
      await reviewApi.decide(view.workspace.id, id, view.revision, decision);
      onChange();
    });
  };
  const insert = (file: File) =>
    action.run(async () => {
      if (!insertion) return;
      await insertQuestion(
        view.workspace.id,
        insertion.anchor.id,
        insertion.position,
        view.revision,
        file,
      );
      setInsertion(null);
      onChange();
    });
  return {
    assistantOpen,
    setAssistantOpen,
    askAssistant: (c: Content) => {
      locate(c);
      setAssistantOpen(true);
    },
    insertion,
    setInsertion,
    insert,
    page,
    setPage,
    selected,
    setSelected,
    tab,
    setTab,
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
