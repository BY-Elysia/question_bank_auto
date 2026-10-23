import type { EventStream } from '../../../../shared/contracts/transport.js';
import type { JobEvent } from '../../domain/job-event.js';

/** 订阅可恢复的任务事件. Runtime validation is not implemented yet. */
export interface StreamJobEventsInput {
  path: {
    jobId: string;
  };
  headers: {
    'Last-Event-ID'?: string;
  };
}

export type StreamJobEventsResult = EventStream<JobEvent>;
