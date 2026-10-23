import type { Job } from '../../domain/job.js';
import type { PageInfo } from '../../../../shared/contracts/page-info.js';

/** JobPage contract. */
export type JobPage = {
  items: Job[];
  page: PageInfo;
};
