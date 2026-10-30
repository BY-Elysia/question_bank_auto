import { useRef, useState } from 'react';
import type { WorkspaceView } from '@/shared/contracts';
import type { Group } from '../model/groups';
export function useChapterGroups(
  pages: WorkspaceView['pages'],
  groups: Group[],
  onChange: (groups: Group[]) => void,
) {
  const [selected, setSelected] = useState<number[]>([]),
    [target, setTarget] = useState(1);
  const last = useRef<number | null>(null);
  const assigned = new Set(groups.flatMap((g) => g.pages));
  function select(n: number, shift: boolean) {
    if (shift && last.current !== null) {
      const low = Math.min(n, last.current),
        high = Math.max(n, last.current);
      setSelected((old) => [
        ...new Set([
          ...old,
          ...pages.filter((p) => p.number >= low && p.number <= high).map((p) => p.number),
        ]),
      ]);
    } else setSelected((old) => (old.includes(n) ? old.filter((v) => v !== n) : [...old, n]));
    last.current = n;
  }
  function assign(id: number, values = selected) {
    onChange(
      groups.map((g) => ({
        ...g,
        pages:
          g.id === id
            ? [...new Set([...g.pages, ...values])].sort((a, b) => a - b)
            : g.pages.filter((p) => !values.includes(p)),
      })),
    );
    setSelected([]);
  }
  return { selected, setSelected, target, setTarget, assigned, select, assign };
}
