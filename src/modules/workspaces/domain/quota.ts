/** Quota contract. */
export type Quota = {
  storageLimitBytes: number;
  storageUsedBytes: number;
  maxConcurrentJobs: number;
  modelTokenLimit: number;
  modelTokensUsed: number;
  /** Format: date-time */
  periodEndsAt: string;
};
