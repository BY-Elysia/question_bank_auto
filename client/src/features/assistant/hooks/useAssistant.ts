import { useRunFeed } from './useRunFeed';
import { useState, useCallback, useEffect } from 'react';
import { useAction, useResource } from '@/shared/hooks/useAsync';
import { assistantApi, type Conversation } from '../api/assistant';
const statePoll = (data: Awaited<ReturnType<typeof assistantApi.state>> | null | undefined) =>
  data?.runs.some((r) => ['queued', 'running'].includes(r.status)) ? 10000 : 0;
export function useAssistant() {
  const list = useResource(assistantApi.list, 5000),
    action = useAction();
  const [id, setId] = useState<string | null>(() =>
      sessionStorage.getItem('assistant-question')
        ? null
        : sessionStorage.getItem('assistant-conversation'),
    ),
    [drafts, setDrafts] = useState<Record<string, string>>({});
  const draftKey = id ?? 'new';
  const text = drafts[draftKey] ?? '';
  const setText = (value: string) => setDrafts((d) => ({ ...d, [draftKey]: value }));
  const stateLoader = useCallback(
    (signal: AbortSignal) => (id ? assistantApi.state(id, signal) : Promise.resolve(null)),
    [id],
  );
  const state = useResource(stateLoader, statePoll);
  const snapshot = state.data?.conversation.id === id ? state.data : undefined;
  const conversation = { ...state, data: snapshot?.conversation };
  const run = snapshot?.runs?.at(-1);
  const activeRun =
    run && ['queued', 'running', 'waiting_input'].includes(run.status) ? run : undefined;
  const [mode, setMode] = useState<'steer' | 'interrupt' | 'follow_up'>('steer');
  const refreshAll = () => {
    state.refresh();
    list.refresh();
  };
  const { stream, tool } = useRunFeed(activeRun?.id, refreshAll);
  const [older, setOlder] = useState<{
    id: string;
    messages: Conversation['messages'];
    nextCursor: string | null;
  }>();
  useEffect(() => {
    if (!id || !snapshot) return;
    const current = snapshot;
    setOlder((previous) => ({
      id,
      messages: [
        ...new Map(
          [...(previous?.id === id ? previous.messages : []), ...current.conversation.messages].map(
            (m) => [m.id, m],
          ),
        ).values(),
      ],
      nextCursor: previous?.id === id ? previous.nextCursor : current.nextCursor,
    }));
  }, [id, snapshot]);
  const nextCursor = older?.id === id ? older.nextCursor : snapshot?.nextCursor;
  const loadOlder = () =>
    action.run(async () => {
      if (!id || !nextCursor) return;
      const page = await assistantApi.messages(id, nextCursor);
      setOlder((previous) =>
        previous && previous.id !== id
          ? previous
          : {
              id,
              messages: [...page.messages, ...(previous?.id === id ? previous.messages : [])],
              nextCursor: page.nextCursor,
            },
      );
    });
  const combined = [
    ...(older?.id === id ? older.messages : []),
    ...(conversation.data?.messages ?? []),
  ];
  const messages = [...new Map(combined.map((m) => [m.id, m])).values()].map((m) => ({
    ...m,
    content: m.status === 'pending' ? (stream[m.id] ?? m.content) : m.content,
  }));
  const command = (name: 'cancel' | 'resume' | 'retry') =>
    action.run(async () => {
      if (run) await assistantApi.command(run.id, name);
      refreshAll();
    });
  const answer = (question: string, value: string) =>
    action.run(async () => {
      if (run) await assistantApi.answer(run.id, question, value);
      refreshAll();
    });
  const rename = (title: string) =>
    action.run(async () => {
      if (id) await assistantApi.rename(id, title);
      refreshAll();
    });
  const remove = () =>
    action.run(async () => {
      if (id) await assistantApi.remove(id);
      setId(null);
      sessionStorage.removeItem('assistant-conversation');
      refreshAll();
    });
  const select = (value: string) => {
    setId(value);
    sessionStorage.setItem('assistant-conversation', value);
  };
  const create = () =>
    action.run(async () => {
      const c = await assistantApi.create();
      select(c.id);
      list.refresh();
    });
  const send = () =>
    action.run(async () => {
      if (!text.trim()) return;
      let current = id;
      if (!current) {
        const c = await assistantApi.create();
        current = c.id;
        select(current);
      }
      const pendingQuestion = activeRun?.interactions.find((q) => q.status === 'pending');
      if (activeRun?.status === 'waiting_input' && mode === 'steer' && pendingQuestion)
        await assistantApi.answer(activeRun.id, pendingQuestion.id, text);
      else if (activeRun) await assistantApi.input(activeRun.id, text, mode, crypto.randomUUID());
      else await assistantApi.start(current, text, crypto.randomUUID());
      state.refresh();
      setDrafts((d) => (d[draftKey] === text ? { ...d, [draftKey]: '' } : d));

      list.refresh();
    });
  return {
    messages,
    tool,
    nextCursor,
    loadOlder,
    run,
    activeRun,
    mode,
    setMode,
    command,
    answer,
    rename,
    remove,
    list,
    action,
    id,
    select,
    adopt:(value:string)=>{if(!id)setDrafts(d=>({...d,[value]:d[value]??d.new??''}));select(value);},
    text,
    setText,
    setDraft: (key: string, value: string) => setDrafts((d) => ({ ...d, [key]: value })),
    conversation,
    create,
    send,
    pending: conversation.data?.messages.some((m) => m.status === 'pending') ?? false,
  };
}
