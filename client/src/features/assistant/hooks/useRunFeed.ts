import { useEffect, useState, useRef } from 'react';
import { subscribeRun } from '../api/assistant';
export function useRunFeed(id: string | undefined, onChange: () => void) {
  const [stream, setStream] = useState<Record<string, string>>({});
  const update = useRef(onChange);
  update.current = onChange;
  useEffect(() => {
    setStream({});
    if (!id) return;
    let last = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const close = subscribeRun(id, (event) => {
      if (event.seq <= last) return;
      last = event.seq;
      if (event.type === 'message_delta') {
        const data = event.data as { messageId: string; text: string };
        setStream((s) => ({ ...s, [data.messageId]: data.text }));
      } else {
        clearTimeout(timer);
        timer = setTimeout(() => update.current(), 100);
      }
    });
    return () => {
      close();
      clearTimeout(timer);
    };
  }, [id]);
  return stream;
}
