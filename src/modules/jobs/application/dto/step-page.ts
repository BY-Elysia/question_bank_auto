import type { JobStep } from '../../domain/job-step.js';
import type { PageInfo } from '../../../../shared/contracts/page-info.js';

/** StepPage contract. */
export type StepPage = {
  items: JobStep[];
  page: PageInfo;
};
