import type { NodePage } from '../../../../modules/library/application/dto/node-page.js';

/** LibraryListNodesResult contract. */
export type LibraryListNodesResult = {
  /**
   * @description discriminator enum property added by openapi-typescript
   * @enum {string}
   */
  toolId: 'library.list-nodes';
  output: NodePage;
};
