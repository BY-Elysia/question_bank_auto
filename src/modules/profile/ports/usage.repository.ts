export interface UsageTotal {
  input: number;
  output: number;
  cached: number;
  total: number;
  calls: number;
  unreported: number;
}
export interface UsageRepository {
  summarize(bookIds: string[]): Promise<UsageTotal>;
}
