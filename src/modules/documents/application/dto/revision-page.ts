import type { DocumentRevision } from '../../domain/document-revision.js';
import type { PageInfo } from '../../../../shared/contracts/page-info.js';

/** RevisionPage contract. */
export type RevisionPage = {
  items: DocumentRevision[];
  page: PageInfo;
};
