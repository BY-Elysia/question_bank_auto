import { useState, useCallback, useEffect, useRef } from 'react';
import { useAction, useResource } from '@/shared/hooks/useAsync';
import { knowledgeApi } from '../api/knowledge';
import { assistantApi } from '../api/assistant';
export function useKnowledge(
  id: string | null,
  select: (id: string) => void,
  setDraft: (id: string, text: string) => void,
) {
  const [open, setOpen] = useState(false),
    [chosen, setChosen] = useState<string[]>([]);
  const available = useResource(knowledgeApi.workspaces);
  const load = useCallback(
    (signal: AbortSignal) => (id ? knowledgeApi.scope(id, signal) : Promise.resolve(null)),
    [id],
  );
  const scope = useResource(load),
    action = useAction();
  useEffect(() => {
    setChosen(scope.data?.workspaceIds ?? []);
  }, [scope.data]);
  const started = useRef(false),
    mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    if (!started.current) {
      started.current = true;
      const raw = sessionStorage.getItem('assistant-question');
      if (raw) {
        sessionStorage.removeItem('assistant-question');
        void action.run(async () => {
          const focus = JSON.parse(raw);
          const c = await assistantApi.create();
          await knowledgeApi.save(c.id, [focus.workspaceId], focus);
          if (mounted.current) {
            select(c.id);
            setDraft(c.id, '请解释这道题，并引用教材来源。');
          }
        });
      }
    }
    return () => {
      mounted.current = false;
    };
  }, []);
  const save = () =>
    action.run(async () => {
      const current = id ?? (await assistantApi.create()).id;
      await knowledgeApi.save(current, chosen);
      select(current);
      scope.refresh();
      setOpen(false);
    });
  return { open, setOpen, chosen, setChosen, available, scope, action, save };
}
export function useCitation(conversationId: string, evidence: string) {
  const [page, setPage] = useState<number | null>(null);
  const load = useCallback(
    (signal: AbortSignal) => knowledgeApi.citation(conversationId, evidence, signal),
    [conversationId, evidence],
  );
  const resource = useResource(load);
  const selected = page ?? resource.data?.citation.sources[0]?.page;
  return {
    ...resource,
    page: selected,
    setPage,
    image:
      resource.data?.status !== 'deleted' && selected
        ? knowledgeApi.image(conversationId, evidence, selected)
        : null,
  };
}
