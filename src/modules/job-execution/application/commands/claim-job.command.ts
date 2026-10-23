import type { Lease } from '../../domain/lease.js';
import type { WorkerClaim } from '../dto/worker-claim.js';

/** 领取分配给当前工作区的任务. Runtime validation is not implemented yet. */
export interface ClaimJobInput {
  headers: {
    'Idempotency-Key': string;
  };
  body: WorkerClaim;
}

export type ClaimJobResult = Lease;
