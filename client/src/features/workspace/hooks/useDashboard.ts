import { useState } from 'react';
import { useResource } from '@/shared/hooks/useAsync';
import { workspaceApi } from '../api/workspaces';
export function useDashboard() {
  const { data, loading, error, refresh } = useResource(workspaceApi.list, 6000);
  const [query, setQuery] = useState(''),
    [filter, setFilter] = useState('all');
  const items = data ?? [],
    active = items.filter((w) => ['preparing', 'extracting'].includes(w.status)).length;
  const filtered = items
    .filter(
      (w) =>
        w.title.toLowerCase().includes(query.toLowerCase()) &&
        (filter === 'all' ||
          (filter === 'active'
            ? ['preparing', 'extracting'].includes(w.status)
            : w.status === 'needs_review')),
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { loading, error, refresh, query, setQuery, filter, setFilter, items, active, filtered };
}
