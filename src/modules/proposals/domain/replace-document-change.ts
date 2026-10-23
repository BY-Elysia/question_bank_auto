import type { DocumentContent } from '../../documents/domain/document-content.js';

/** ReplaceDocumentChange contract. */
export type ReplaceDocumentChange = {
  /**
   * @description discriminator enum property added by openapi-typescript
   * @enum {string}
   */
  kind: 'replace_document';
  content: DocumentContent;
};
