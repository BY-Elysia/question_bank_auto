import type { StructureNode } from '../../documents/domain/structure-node.js';

/** ReplaceStructureChange contract. */
export type ReplaceStructureChange = {
  /**
   * @description discriminator enum property added by openapi-typescript
   * @enum {string}
   */
  kind: 'replace_structure';
  nodes: StructureNode[];
};
