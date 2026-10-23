import type { Credential } from '../../domain/credential.js';
import type { CredentialCreate } from '../dto/credential-create.js';

/** 加密保存用户模型凭证. Runtime validation is not implemented yet. */
export interface CreateCredentialInput {
  headers: {
    'Idempotency-Key': string;
  };
  body: CredentialCreate;
}

export type CreateCredentialResult = Credential;
