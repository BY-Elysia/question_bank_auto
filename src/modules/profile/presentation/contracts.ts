import { z } from 'zod';
import { ModelSettingsInput } from '../domain/settings.js';
export { ModelSettingsInput };
export const ModelSettingsView = z
  .object({ ...ModelSettingsInput.shape })
  .omit({ apiKey: true })
  .extend({ hasApiKey: z.boolean() });
export const ModelTestResult = z.object({
  ok: z.boolean(),
  durationMs: z.number(),
  model: z.string().optional(),
  reply: z.string().optional(),
  message: z.string().optional(),
});
export const UsageTotal = z.object({
  input: z.number(),
  output: z.number(),
  cached: z.number(),
  total: z.number(),
  calls: z.number(),
  unreported: z.number(),
});
export const UsageSummary = z.object({
  workspaces: z.array(UsageTotal.extend({ id: z.string(), title: z.string() })),
  assistant: UsageTotal,
});
export const profileRoutes = [
  ['get', '/api/profile/model', 'getModelSettings', null, 'ModelSettingsView', 200],
  [
    'put',
    '/api/profile/model',
    'saveModelSettings',
    'ModelSettingsInput',
    'ModelSettingsView',
    200,
  ],
  [
    'post',
    '/api/profile/model/test',
    'testModelSettings',
    'ModelSettingsInput',
    'ModelTestResult',
    201,
  ],
  ['get', '/api/profile/usage', 'getModelUsage', null, 'UsageSummary', 200],
] as const;
