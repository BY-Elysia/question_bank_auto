import { z } from 'zod';
export class DomainError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
export function fail(status: number, message: string): never {
  throw new DomainError(status, message);
}
export function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) fail(400, z.prettifyError(result.error));
  return result.data;
}
export function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
