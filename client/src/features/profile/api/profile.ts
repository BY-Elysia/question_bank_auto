import { request, write } from '@/shared/api/http';
export interface ModelConfig {
  baseUrl: string;
  apiKey?: string;
  model: string;
  visionModel: string;
  protocol: 'chat' | 'responses' | 'anthropic';
  prefixCache: boolean;
  hasApiKey?: boolean;
}
export interface Usage {
  input: number;
  output: number;
  cached: number;
  total: number;
  calls: number;
  unreported: number;
}
export const profileApi = {
  get: (signal?: AbortSignal) => request<ModelConfig>('/profile/model', { signal }),
  save: (value: ModelConfig) => {
    const { hasApiKey, ...body } = value;
    return write<ModelConfig>('/profile/model', body, 'PUT');
  },
  test: (value: ModelConfig) => {
    const { hasApiKey, ...body } = value;
    return write<{ ok: boolean; durationMs: number; reply?: string; message?: string }>(
      '/profile/model/test',
      body,
    );
  },
  usage: (signal?: AbortSignal) =>
    request<{ workspaces: (Usage & { id: string; title: string })[]; assistant: Usage }>(
      '/profile/usage',
      { signal },
    ),
};
