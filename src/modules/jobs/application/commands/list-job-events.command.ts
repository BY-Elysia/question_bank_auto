import type { EventPage } from '../dto/event-page.js';

/** 分页回放任务事件. Runtime validation is not implemented yet. */
export interface ListJobEventsInput {
  path: {
    jobId: string;
  };
  query: {
    cursor?: string;
    limit?: number;
  };
}

export type ListJobEventsResult = EventPage;
