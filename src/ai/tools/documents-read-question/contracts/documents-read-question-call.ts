import type { ReadQuestionInput } from './read-question-input.js';

/** DocumentsReadQuestionCall contract. */
export type DocumentsReadQuestionCall = {
  /**
   * @description discriminator enum property added by openapi-typescript
   * @enum {string}
   */
  toolId: 'documents.read-question';
  input: ReadQuestionInput;
};
