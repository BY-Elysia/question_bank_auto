import type { PageInfo } from '../../../../shared/contracts/page-info.js';
import type { Project } from '../../domain/project.js';

/** ProjectPage contract. */
export type ProjectPage = {
  items: Project[];
  page: PageInfo;
};
