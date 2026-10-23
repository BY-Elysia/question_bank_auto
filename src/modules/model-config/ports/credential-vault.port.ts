import type { UserScope } from '../../../shared/contracts/identity-context.js';

export const CREDENTIAL_VAULT = Symbol('CREDENTIAL_VAULT');

/** Only gateway adapters may resolve secrets. No secret is added to job plans. */
export interface CredentialVault {
  resolveActiveSecret(scope: UserScope, credentialId: string): Promise<string>;
  revoke(scope: UserScope, credentialId: string): Promise<void>;
}
