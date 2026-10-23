import type { ListSourcesInput } from './list-sources-input.js';

/** LibraryListSourcesCall contract. */
export type LibraryListSourcesCall = {
  /**
   * @description discriminator enum property added by openapi-typescript
   * @enum {string}
   */
  toolId: 'library.list-sources';
  input: ListSourcesInput;
};
