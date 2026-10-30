import { write } from '@/shared/api/http';
import type { ExtractionSettings } from '@/shared/contracts';
export const startExtraction = (id: string, settings: ExtractionSettings) =>
  write(`/workspaces/${encodeURIComponent(id)}/extract`, settings);
