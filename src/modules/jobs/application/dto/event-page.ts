import type { JobEvent } from '../../domain/job-event.js';
import type { PageInfo } from '../../../../shared/contracts/page-info.js';

/** EventPage contract. */
export type EventPage = {
  items: JobEvent[];
  page: PageInfo;
};
