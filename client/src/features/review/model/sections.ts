import type { Content, WorkspaceView } from '@/shared/contracts';
type Section = WorkspaceView['document']['sections'][number];
/** A chapter includes its descendants; leaf sections include only their own content. */
export function sectionContentIds(
  sections: Section[],
  contents: Content[],
  sectionId: string | null,
) {
  if (sectionId === null) return new Set(contents.map((c) => c.id));
  const included = new Set([sectionId]);
  for (let changed = true; changed;) {
    changed = false;
    for (const section of sections) {
      if (section.parentId && included.has(section.parentId) && !included.has(section.id)) {
        included.add(section.id);
        changed = true;
      }
    }
  }
  return new Set(contents.filter((c) => c.sectionId && included.has(c.sectionId)).map((c) => c.id));
}
