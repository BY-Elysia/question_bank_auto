import { configurationState } from '../model/settings';
import { useState } from 'react';
import type { WorkspaceView, ExtractionSettings } from '@/shared/contracts';
import type { Group } from '../model/groups';
import { useAction } from '@/shared/hooks/useAsync';
import { startExtraction } from '../api/extraction';
export function useConfigure(view: WorkspaceView, onDone: () => void) {
  const [metadata, setMetadata] = useState({
    version: 'v1.1',
    courseId: '',
    textbookId: '',
    title: view.workspace.title,
    publisher: '',
    subject: '',
    hasAnswer: true,
    answerHandlingMode: 'generate_brief',
  });
  const [mode, setMode] = useState<'sequential' | 'chapters'>('sequential'),
    [groups, setGroups] = useState<Group[]>([
      { id: 1, pages: [] },
      { id: 2, pages: [] },
    ]),
    [instructions, setInstructions] = useState(''),
    [cache, setCache] = useState<'prefix' | 'off'>('prefix');
  const action = useAction();
  const { grouped, valid } = configurationState(view, metadata, mode, groups);
  async function start() {
    if (!valid) return;
    await action.run(async () => {
      await startExtraction(view.workspace.id, {
        metadata: {
          ...metadata,
          answerHandlingMode: metadata.hasAnswer ? 'extract_visible' : metadata.answerHandlingMode,
        },
        instructions,
        cache,
        mode,
        chapters: mode === 'chapters' ? groups.map((g) => ({ pages: g.pages })) : [],
        concurrency: 2,
      } as ExtractionSettings);
      onDone();
    });
  }
  return {
    metadata,
    setMetadata,
    mode,
    setMode,
    groups,
    setGroups,
    instructions,
    setInstructions,
    cache,
    setCache,
    action,
    grouped,
    valid,
    start,
  };
}
