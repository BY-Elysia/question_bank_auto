import type { WorkspaceView } from '@/shared/contracts';
import type { Group } from './groups';
export function configurationState(
  view: WorkspaceView,
  metadata: { title: string; subject: string },
  mode: 'sequential' | 'chapters',
  groups: Group[],
) {
  const grouped =
    groups.every((g) => g.pages.length > 0) &&
    new Set(groups.flatMap((g) => g.pages)).size === view.pages.length;
  const valid =
    metadata.title.trim() &&
    metadata.subject.trim() &&
    (mode === 'sequential' || grouped) &&
    view.actions.configure;
  return { grouped, valid };
}
