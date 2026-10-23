import type { GetMeInput, GetMeResult } from './commands/get-me.command.js';

export const IDENTITY_SERVICE = Symbol('IDENTITY_SERVICE');

/** Application boundary. Implement use cases here, not in Controllers. */
export interface IdentityService {
  getMe(input: GetMeInput): Promise<GetMeResult>;
}
