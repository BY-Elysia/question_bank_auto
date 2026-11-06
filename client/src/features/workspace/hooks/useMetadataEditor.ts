import { useState } from 'react';
import type { WorkspaceView, ExtractionSettings } from '@/shared/contracts';
import { useAction } from '@/shared/hooks/useAsync';
import { updateMetadata } from '../api/metadata';
export function useMetadataEditor(view: WorkspaceView, onSaved: () => void, onClose: () => void) {
  const [metadata, setMetadata] = useState<ExtractionSettings['metadata']>(
    view.workspace.settings?.metadata ?? {
      title: view.workspace.title,
      subject: '',
      publisher: '',
      version: 'v1.1',
      courseId: '',
      textbookId: '',
      hasAnswer: true,
    },
  );
  const action = useAction();
  const save = () =>
    action.run(async () => {
      await updateMetadata(view.workspace.id, view.revision, metadata);
      onSaved();
      onClose();
    });
  return { metadata, setMetadata, action, save };
}
