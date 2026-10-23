import type { ListNodesInput } from './list-nodes-input.js';

/** LibraryListNodesCall contract. */
export type LibraryListNodesCall = {
  /**
   * @description discriminator enum property added by openapi-typescript
   * @enum {string}
   */
  toolId: 'library.list-nodes';
  input: ListNodesInput;
};
