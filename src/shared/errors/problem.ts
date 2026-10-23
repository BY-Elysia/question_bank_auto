import type { ErrorDetail } from './error-detail.js';

/** Problem contract. */
export type Problem = {
  /** Format: uri */
  type: string;
  title: string;
  status: number;
  /** @enum {string} */
  code:
    | 'VALIDATION_FAILED'
    | 'UNAUTHENTICATED'
    | 'FORBIDDEN'
    | 'NOT_FOUND'
    | 'CONFLICT'
    | 'VERSION_CONFLICT'
    | 'PRECONDITION_REQUIRED'
    | 'IDEMPOTENCY_CONFLICT'
    | 'QUOTA_EXCEEDED'
    | 'RATE_LIMITED'
    | 'WORKSPACE_NOT_READY'
    | 'ASSET_IN_USE'
    | 'LEASE_EXPIRED'
    | 'EVENT_CURSOR_EXPIRED'
    | 'PROVIDER_UNAVAILABLE'
    | 'INTERNAL_ERROR'
    | 'NOT_IMPLEMENTED';
  detail: string;
  /** Format: uuid */
  requestId: string;
  retryable: boolean;
  errors?: ErrorDetail[];
};
