import type { PublicationPage } from '../../../../modules/library/application/dto/publication-page.js';

/** LibraryListSourcesResult contract. */
export type LibraryListSourcesResult = {
  /**
   * @description discriminator enum property added by openapi-typescript
   * @enum {string}
   */
  toolId: 'library.list-sources';
  output: PublicationPage;
};
