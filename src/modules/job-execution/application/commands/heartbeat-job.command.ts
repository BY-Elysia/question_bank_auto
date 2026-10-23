import type { Heartbeat } from '../dto/heartbeat.js';
import type { HeartbeatResult } from '../dto/heartbeat-result.js';

/** 续约并读取取消状态. Runtime validation is not implemented yet. */
export interface HeartbeatJobInput {
  path: {
    jobId: string;
  };
  headers: {
    'Idempotency-Key': string;
  };
  body: Heartbeat;
}

export type HeartbeatJobResult = HeartbeatResult;
