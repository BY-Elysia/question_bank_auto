import type { DocumentSummary } from '../../domain/document-summary.js';
import type { PageInfo } from '../../../../shared/contracts/page-info.js';

/** DocumentPage contract. */
export type DocumentPage = {
  items: DocumentSummary[];
  page: PageInfo;
};
