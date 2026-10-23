import type { PageInfo } from '../../../../shared/contracts/page-info.js';
import type { StructureNode } from '../../../documents/domain/structure-node.js';

/** NodePage contract. */
export type NodePage = {
  items: StructureNode[];
  page: PageInfo;
};
