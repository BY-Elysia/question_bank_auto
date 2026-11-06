import { useState, useCallback } from 'react';
import { useAction, useResource } from '@/shared/hooks/useAsync';
import { assistantApi, type Conversation } from '../api/assistant';
const chatPoll = (data: Conversation | null | undefined) =>
  data?.messages.some((m) => m.status === 'pending') ? 2000 : 0;
export function useAssistant() {
  const list = useResource(assistantApi.list, 5000),
    action = useAction();
  const [id, setId] = useState<string | null>(() =>
      sessionStorage.getItem('assistant-conversation'),
    ),
    [text, setText] = useState('');
  const fetch = useCallback(() => (id ? assistantApi.get(id) : Promise.resolve(null)), [id]);
  const conversation = useResource(fetch, chatPoll);
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
      await assistantApi.send(current, text);
      setText('');
      conversation.refresh();
      list.refresh();
    });
  return {
    list,
    action,
    id,
    select,
    text,
    setText,
    conversation,
    create,
    send,
    pending: conversation.data?.messages.some((m) => m.status === 'pending') ?? false,
  };
}
