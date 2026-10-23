import type { Checkpoint } from '../../domain/checkpoint.js';
import type { StepCommit } from '../dto/step-commit.js';

/** 原子提交步骤结果与恢复检查点. Runtime validation is not implemented yet. */
export interface CommitJobStepInput {
  path: {
    jobId: string;
  };
  headers: {
    'Idempotency-Key': string;
  };
  body: StepCommit;
}

export type CommitJobStepResult = Checkpoint;
