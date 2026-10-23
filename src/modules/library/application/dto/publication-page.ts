import type { PageInfo } from '../../../../shared/contracts/page-info.js';
import type { Publication } from '../../domain/publication.js';

/** PublicationPage contract. */
export type PublicationPage = {
  items: Publication[];
  page: PageInfo;
};
