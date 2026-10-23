/** Framework-independent error used by all unfinished use cases. */
export class OperationNotImplemented extends Error {
  constructor(readonly operationId: string) {
    super(`Operation ${operationId} is defined but not implemented.`);
    this.name = 'OperationNotImplemented';
  }
}
