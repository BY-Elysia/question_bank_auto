export interface PrefixEntry {
  responseId: string;
  expiresAt: number;
}
export interface PrefixCache {
  get(key: string): Promise<PrefixEntry | null>;
  set(key: string, value: PrefixEntry): Promise<void>;
  remove(key: string): Promise<void>;
}
export class MemoryPrefixCache implements PrefixCache {
  private entries = new Map<string, PrefixEntry>();
  async get(key: string) {
    return this.entries.get(key) ?? null;
  }
  async set(key: string, value: PrefixEntry) {
    this.entries.set(key, value);
  }
  async remove(key: string) {
    this.entries.delete(key);
  }
}
