export interface ModelRequest {
  cache?: 'prefix' | 'off';
  cacheScope?: string;
  system: string;
  input: unknown;
  messages?: { role: 'user' | 'assistant'; content: string }[];
  images: { page: number; url: string }[];
  signal: AbortSignal;
  role: 'vision' | 'reasoning';
  maxOutputTokens?: number;
  outputMode?: 'text' | 'json_object';
  structuredOutput?: { name: string; schema: Record<string, unknown> };
}
export interface ModelClient {
  complete(request: ModelRequest): Promise<{
    text: string;
    usage: unknown;
    model: string;
    cache?: unknown;
    outputFormat?: 'json_object' | 'json_schema' | 'text';
    completionStatus?: 'completed' | 'incomplete';
  }>;
}
