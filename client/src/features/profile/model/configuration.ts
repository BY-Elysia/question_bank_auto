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
export type ModelScope = 'textbook' | 'assistant';
