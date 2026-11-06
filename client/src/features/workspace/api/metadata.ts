import { write } from '@/shared/api/http';
import type { ExtractionSettings } from '@/shared/contracts';
export const updateMetadata = (
  id: string,
  revision: number,
  metadata: ExtractionSettings['metadata'],
) => write(`/workspaces/${id}/metadata`, { revision, metadata }, 'PATCH');
