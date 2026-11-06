export interface ModelSettings {
  baseUrl: string;
  apiKey: string;
  model: string;
  visionModel: string;
  protocol: 'chat' | 'responses' | 'anthropic';
  prefixCache: boolean;
}
export interface ModelSettingsSource {
  get(): Promise<ModelSettings>;
}
export function environmentModelSettings(): ModelSettings {
  return {
    baseUrl: process.env.MODEL_BASE_URL || process.env.ARK_BASE_URL || '',
    apiKey: process.env.MODEL_API_KEY || process.env.ARK_API_KEY || '',
    model: process.env.REASONING_MODEL || process.env.MODEL_NAME || process.env.ARK_MODEL || '',
    visionModel: process.env.VISION_MODEL || process.env.MODEL_NAME || process.env.ARK_MODEL || '',
    protocol: (process.env.MODEL_PROTOCOL || 'responses') as ModelSettings['protocol'],
    prefixCache: !process.env.MODEL_PROTOCOL || process.env.MODEL_PROTOCOL === 'responses',
  };
}
