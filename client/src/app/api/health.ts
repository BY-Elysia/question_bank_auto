import { request } from '@/shared/api/http';
export const getHealth = (signal: AbortSignal) =>
  request<{ status: string; modelConfigured: boolean }>('/health', { signal });
