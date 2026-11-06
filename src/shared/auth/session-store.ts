/** Revocable, opaque sessions. Only token digests cross the storage boundary. */
export interface SessionStore {
  has(digest: string, now: number): Promise<boolean>;
  replace(previous: string, digest: string, expiresAt: number, now: number): Promise<void>;
  revoke(digest: string): Promise<void>;
}
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
