import { request, write } from '@/shared/api/http';
import type { ModelConfig, ModelScope, Usage } from '../model/configuration';
export type { ModelConfig, ModelScope, Usage } from '../model/configuration';
export function modelSettingsApi(scope: ModelScope) {
  const base = scope === 'assistant' ? '/assistant/model' : '/profile/model';
  return {
    get: (signal?: AbortSignal) => request<ModelConfig>(base, { signal }),
    save: (value: ModelConfig) => {
      const { hasApiKey, ...body } = value;
      return write<ModelConfig>(base, body, 'PUT');
    },
    test: (value: ModelConfig) => {
      const { hasApiKey, ...body } = value;
      return write<{ ok: boolean; durationMs: number; reply?: string; message?: string }>(
        base + '/test',
        body,
      );
    },
  };
}
export const profileApi = {
  ...modelSettingsApi('textbook'),
  usage: (signal?: AbortSignal) =>
    request<{ workspaces: (Usage & { id: string; title: string })[]; assistant: Usage }>(
      '/profile/usage',
      { signal },
    ),
};
