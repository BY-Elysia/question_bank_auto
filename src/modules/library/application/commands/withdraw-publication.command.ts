/** 撤回已发布快照. Runtime validation is not implemented yet. */
export interface WithdrawPublicationInput {
  path: {
    publicationId: string;
  };
  headers: {
    'Idempotency-Key': string;
  };
}

export type WithdrawPublicationResult = void;
