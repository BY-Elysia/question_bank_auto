import { useEffect, useState, useRef } from 'react';
import { subscribeRun } from '../api/assistant';
export function useRunFeed(id: string | undefined, onChange: () => void, onMutation?: () => void) {
  const [stream, setStream] = useState<Record<string, string>>({});
  const [tool, setTool] = useState<{ name: string; status: string } | null>(null);
  const update = useRef(onChange);
  update.current = onChange;
  const mutation = useRef(onMutation);
  mutation.current = onMutation;
  useEffect(() => {
    setStream({});
    setTool(null);
    if (!id) return;
    let last = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const close = subscribeRun(id, (event) => {
      if (event.seq <= last) return;
      last = event.seq;
      if (event.type === 'message_delta') {
        const data = event.data as { messageId: string; text: string };
        setStream((s) => ({ ...s, [data.messageId]: data.text }));
      } else if (event.type === 'tool_status') {
        setTool(event.data as { name: string; status: string });
      } else {
        if (event.type === 'workspace_changed') mutation.current?.();
        clearTimeout(timer);
        timer = setTimeout(() => update.current(), 100);
      }
    });
    return () => {
      close();
      clearTimeout(timer);
    };
  }, [id]);
  return { stream, tool };
}
