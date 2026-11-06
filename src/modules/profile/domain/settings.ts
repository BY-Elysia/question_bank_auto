import { z } from 'zod';
export const ModelSettingsInput = z
  .strictObject({
    baseUrl: z
      .string()
      .url()
      .max(2000)
      .refine((value) => {
        const url = new URL(value);
        return (
          ['http:', 'https:'].includes(url.protocol) &&
          !url.username &&
          !url.password &&
          !url.search &&
          !url.hash
        );
      }, 'Use an HTTP(S) base URL without credentials or query parameters'),
    apiKey: z.string().trim().max(4096).optional(),
    model: z.string().trim().min(1).max(300),
    visionModel: z.string().trim().max(300).default(''),
    protocol: z.enum(['chat', 'responses', 'anthropic']),
    prefixCache: z.boolean().default(false),
  })
  .refine(
    (v) => !v.prefixCache || v.protocol === 'responses',
    'Explicit prefix cache requires Ark Responses',
  );
export type ModelSettingsInput = z.infer<typeof ModelSettingsInput>;
