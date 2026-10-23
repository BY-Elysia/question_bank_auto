/** DeleteQuestionChange contract. */
export type DeleteQuestionChange = {
  /**
   * @description discriminator enum property added by openapi-typescript
   * @enum {string}
   */
  kind: 'delete_question';
  /** Format: uuid */
  questionId: string;
};
