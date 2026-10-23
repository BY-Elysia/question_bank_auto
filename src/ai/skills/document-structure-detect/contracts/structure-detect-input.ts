import type { StructureNode } from '../../../../modules/documents/domain/structure-node.js';

/** StructureDetectInput contract. */
export type StructureDetectInput = {
  /**
   * @description discriminator enum property added by openapi-typescript
   * @enum {string}
   */
  kind: 'document-structure-detect';
  /** @enum {string} */
  documentKind: 'textbook' | 'exam';
  pageAssetIds: string[];
  existingNodes: StructureNode[];
};
