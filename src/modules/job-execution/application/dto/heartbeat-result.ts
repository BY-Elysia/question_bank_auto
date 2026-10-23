/** HeartbeatResult contract. */
export type HeartbeatResult = {
  /** Format: date-time */
  expiresAt: string;
  cancelRequested: boolean;
};
