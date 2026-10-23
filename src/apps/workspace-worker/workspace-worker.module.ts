import { Module } from '@nestjs/common';
import { WORKFLOW_RUNNER } from '../../ai/runtime/workflow-runner.port.js';
import { UnimplementedWorkflowRunner } from '../../ai/runtime/unimplemented-workflow-runner.js';

@Module({
  providers: [{ provide: WORKFLOW_RUNNER, useClass: UnimplementedWorkflowRunner }],
  exports: [WORKFLOW_RUNNER],
})
export class WorkspaceWorkerModule {}
