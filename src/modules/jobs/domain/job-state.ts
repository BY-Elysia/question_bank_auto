/** JobState contract. */
export type JobState =
  'queued' | 'running' | 'cancel_requested' | 'cancelled' | 'succeeded' | 'failed' | 'needs_input';
