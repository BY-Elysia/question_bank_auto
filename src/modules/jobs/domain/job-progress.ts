/** JobProgress contract. */
export type JobProgress = {
  completedUnits: number;
  totalUnits: number | null;
  phase: string;
};
