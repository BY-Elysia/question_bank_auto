import type { Credential } from '../../domain/credential.js';
import type { CredentialRotate } from '../dto/credential-rotate.js';

/** 轮换凭证密钥. Runtime validation is not implemented yet. */
export interface RotateCredentialInput {
  path: {
    credentialId: string;
  };
  headers: {
    'Idempotency-Key': string;
    'If-Match': string;
  };
  body: CredentialRotate;
}

export type RotateCredentialResult = Credential;
