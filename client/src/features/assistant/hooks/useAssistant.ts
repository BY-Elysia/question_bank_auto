import { useRunFeed } from './useRunFeed';
import { useState, useCallback, useEffect } from 'react';
import { useAction, useResource } from '@/shared/hooks/useAsync';
import { assistantApi, type Conversation } from '../api/assistant';
const statePoll = (data: Awaited<ReturnType<typeof assistantApi.state>> | null | undefined) =>
  data?.runs.some((r) => ['queued', 'running'].includes(r.status)) ? 10000 : 0;

function randomId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
export function useAssistant(
  options: {
    history?: boolean;
    storageKey?: string;
    prepare?: (id: string) => Promise<unknown>;
    onMutation?: () => void;
  } = {},
) {
  const storageKey = options.storageKey ?? 'assistant-conversation';
  const historyEnabled = options.history !== false;
  const loadHistory = useCallback(
    (signal: AbortSignal) => (historyEnabled ? assistantApi.list(signal) : Promise.resolve([])),
    [historyEnabled],
  );
  const list = useResource(loadHistory, historyEnabled ? 5000 : 0),
    action = useAction(),
    cancelAction = useAction();
  const [id, setId] = useState<string | null>(() =>
      !options.storageKey && sessionStorage.getItem('assistant-question')
        ? null
        : sessionStorage.getItem(storageKey),
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
  const [retainedFeed, setRetainedFeed] = useState<{ convId: string; runId: string }>();
  useEffect(() => {
    if (id && activeRun) setRetainedFeed({ convId: id, runId: activeRun.id });
  }, [id, activeRun?.id]);
  const refreshAll = () => {
    state.refresh();
    list.refresh();
  };
  const onSettled = useCallback((doneId: string) => {
    setRetainedFeed((current) => (current?.runId === doneId ? undefined : current));
  }, []);
  const feedId =
    activeRun?.id ?? (id && retainedFeed?.convId === id ? retainedFeed.runId : undefined);
  const { stream, tool } = useRunFeed(feedId, refreshAll, options.onMutation, onSettled);
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
    (name === 'cancel' ? cancelAction : action).run(async () => {
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
      sessionStorage.removeItem(storageKey);
      refreshAll();
    });
  const select = (value: string) => {
    setId(value);
    sessionStorage.setItem(storageKey, value);
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
      if (activeRun?.status === 'waiting_input') {
        if (mode !== 'interrupt' && pendingQuestion)
          await assistantApi.answer(activeRun.id, pendingQuestion.id, text);
        else await assistantApi.input(activeRun.id, text, 'interrupt', randomId());
      } else if (activeRun) await assistantApi.input(activeRun.id, text, mode, randomId());
      else {
        await options.prepare?.(current);
        await assistantApi.start(current, text, randomId());
      }
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
    cancelling: cancelAction.busy,
    cancelError: cancelAction.error,
    id,
    select,
    adopt: (value: string) => {
      if (!id) setDrafts((d) => ({ ...d, [value]: d[value] ?? d.new ?? '' }));
      select(value);
    },
    text,
    setText,
    setDraft: (key: string, value: string) => setDrafts((d) => ({ ...d, [key]: value })),
    conversation,
    create,
    send,
    pending: conversation.data?.messages.some((m) => m.status === 'pending') ?? false,
  };
}

export type AssistantModel = ReturnType<typeof useAssistant>;
