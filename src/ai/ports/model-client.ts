export interface ModelRequest {
  cache?: 'prefix' | 'off';
  cacheScope?: string;
  system: string;
  input: unknown;
  images: { page: number; url: string }[];
  signal: AbortSignal;
  role: 'vision' | 'reasoning';
}
export interface ModelClient {
  complete(
    request: ModelRequest,
  ): Promise<{ text: string; usage: unknown; model: string; cache?: unknown }>;
}
