/** 撤销凭证. Runtime validation is not implemented yet. */
export interface RevokeCredentialInput {
  path: {
    credentialId: string;
  };
  headers: {
    'Idempotency-Key': string;
    'If-Match': string;
  };
}

export type RevokeCredentialResult = void;
