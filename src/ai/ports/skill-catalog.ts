export type SkillId = string;
export interface SkillPackage {
  id: SkillId;
  version: string;
  instructions: string;
  modelRole: 'vision' | 'reasoning';
}
export interface SkillCatalog {
  get(id: SkillId): Promise<SkillPackage>;
}
export interface SkillPin {
  hash: string;
  version: string;
}
export interface InvocationRecord {
  id: string;
  skill: string;
  version: string;
  instructionHash: string;
  model: string;
  usage: unknown;
  cache?: unknown;
  at: string;
  attempt: number;
  validationError?: string | null;
  durationMs?: number;
  providerError?: string;
  outputFormat?: string;
  completionStatus?: 'completed' | 'incomplete';
  trace?: { system: string; input: unknown; pages: number[]; rawOutput: string | null };
}
export interface RunRecords {
  pin(bookId: string, jobId: string, skillId: string, expected: SkillPin): Promise<void>;
  record(bookId: string, jobId: string, invocation: InvocationRecord): Promise<void>;
}
