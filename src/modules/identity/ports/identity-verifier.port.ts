import type { UserScope, WorkerScope } from '../../../shared/contracts/identity-context.js';

export const IDENTITY_VERIFIER = Symbol('IDENTITY_VERIFIER');

export interface IdentityVerifier {
  verifyUser(token: string): Promise<UserScope>;
  verifyWorker(token: string): Promise<WorkerScope>;
}
