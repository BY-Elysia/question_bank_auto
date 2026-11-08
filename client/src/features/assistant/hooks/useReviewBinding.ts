import { useCallback, useState, useEffect } from 'react';
import { knowledgeApi } from '../api/knowledge';
import { changesApi } from '../api/changes';
import { useResource, useAction } from '@/shared/hooks/useAsync';
export interface ReviewBinding {
  workspaceId: string;
  contentId: string | null;
  revision: number;
  page: number;
  onChange: () => void;
  onClose: () => void;
}
export function useReviewBinding(binding?: ReviewBinding) {
  const [epoch, setEpoch] = useState(0);
  const load = useCallback(
    (signal: AbortSignal) =>
      binding ? changesApi.list(binding.workspaceId, signal) : Promise.resolve([]),
    [binding?.workspaceId],
  );
  const changes = useResource(load),
    action = useAction();
  useEffect(() => {
    changes.refresh();
  }, [epoch, binding?.revision]);
  const mutation = () => {
    setEpoch((x) => x + 1);
    binding?.onChange();
  };
  return {
    changes,
    action,
    mutation,
    prepare: async (id: string) => {
      if (!binding) return;
      if (!binding.contentId) throw new Error('请先在教材中选中一道题');
      return knowledgeApi.save(
        id,
        [binding.workspaceId],
        {
          workspaceId: binding.workspaceId,
          contentId: binding.contentId,
          childIndex: null,
          revision: binding.revision,
        },
        true,
      );
    },
    undo: (id: string) =>
      action.run(async () => {
        if (binding) {
          await changesApi.undo(binding.workspaceId, id, binding.revision);
          mutation();
        }
      }),
  };
}
