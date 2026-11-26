import { useEffect, useState, useRef } from 'react';
import { subscribeRun } from '../api/assistant';

const TERMINAL_STATES = new Set(['completed', 'cancelled', 'failed', 'interrupted']);

export function useRunFeed(
  id: string | undefined,
  onChange: () => void,
  onMutation?: () => void,
  onSettled?: (runId: string) => void,
) {
  const [stream, setStream] = useState<Record<string, string>>({});
  const [tool, setTool] = useState<{ name: string; status: string } | null>(null);
  const update = useRef(onChange);
  update.current = onChange;
  const mutation = useRef(onMutation);
  mutation.current = onMutation;
  const settled = useRef(onSettled);
  settled.current = onSettled;
  useEffect(() => {
    setStream({});
    setTool(null);
    if (!id) return;
    let last = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let done = false;
    let close = () => {};
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      close();
      settled.current?.(id);
    };
    close = subscribeRun(
      id,
      (event) => {
        if (done || event.seq <= last) return;
        last = event.seq;
        if (event.type === 'message_delta') {
          const data = event.data as { messageId: string; text: string };
          setStream((s) => ({ ...s, [data.messageId]: data.text }));
        } else if (event.type === 'tool_status') {
          setTool(event.data as { name: string; status: string });
        } else {
          if (event.type === 'workspace_changed') mutation.current?.();
          const status = (event.data as { status?: string } | null)?.status ?? '';
          if (event.type === 'run_state' && TERMINAL_STATES.has(status)) {
            finish();
            update.current();
          } else {
            clearTimeout(timer);
            timer = setTimeout(() => update.current(), 100);
          }
        }
      },
      finish,
    );
    return () => {
      done = true;
      close();
      clearTimeout(timer);
    };
  }, [id]);
  return { stream, tool };
}
