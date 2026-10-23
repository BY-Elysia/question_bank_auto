/** Usage contract. */
export type Usage = {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  modelCalls: number;
  estimatedCost: number | null;
  currency: ('CNY' | 'USD') | null;
};
