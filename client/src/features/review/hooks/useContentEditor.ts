import { useState } from 'react';
import type { Content } from '@/shared/contracts';
import { useAction } from '@/shared/hooks/useAsync';
import { reviewApi } from '../api/review';
export function useContentEditor(
  id: string,
  content: Content,
  revision: number,
  onSaved: () => void,
  onClose: () => void,
) {
  const [draft, setDraft] = useState<Content>(() => structuredClone(content));
  const action = useAction();
  function updateLeaf(index: number, field: 'prompt' | 'answer' | 'explanation', value: string) {
    setDraft((old) => {
      const d = structuredClone(old),
        q = index < 0 ? d.question! : d.question!.children[index];
      if (field === 'prompt') q.prompt = value;
      else {
        if (!q.answer)
          q.answer = {
            text: '',
            explanation: '',
            origin: 'human',
            review: 'accepted',
            sources: [],
          };
        q.answer[field === 'answer' ? 'text' : 'explanation'] = value;
      }
      return d;
    });
  }
  function updateOption(index: number, option: number, value: string) {
    setDraft((old) => {
      const d = structuredClone(old);
      const q = index < 0 ? d.question! : d.question!.children[index];
      q.options[option].text = value;
      return d;
    });
  }
  function clearAnswer(index: number) {
    setDraft((old) => {
      const d = structuredClone(old);
      (index < 0 ? d.question! : d.question!.children[index]).answer = null;
      return d;
    });
  }
  const save = () =>
    action.run(async () => {
      await reviewApi.edit(id, content.id, revision, draft);
      onSaved();
      onClose();
    });
  return { draft, setDraft, action, updateLeaf, updateOption, clearAnswer, save };
}
