import { useCallback } from 'react';
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
  const load = useCallback(
    (signal: AbortSignal) =>
      binding ? changesApi.list(binding.workspaceId, signal) : Promise.resolve([]),
    [binding?.workspaceId, binding?.revision],
  );
  const changes = useResource(load),
    action = useAction();
  // The workspace revision is the single invalidation key, including undo and SSE mutations.
  const mutation = () => binding?.onChange();
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
