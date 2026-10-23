import { OperationNotImplemented } from '../../shared/errors/operation-not-implemented.js';
import type { WorkflowRunner } from './workflow-runner.port.js';

export class UnimplementedWorkflowRunner implements WorkflowRunner {
  async execute(): Promise<never> {
    throw new OperationNotImplemented('executeWorkflow');
  }
}
