import { Module } from '@nestjs/common';
import { IdentityModule } from '../../modules/identity/identity.module.js';
import { WorkspacesModule } from '../../modules/workspaces/workspaces.module.js';
import { ProjectsModule } from '../../modules/projects/projects.module.js';
import { AssetsModule } from '../../modules/assets/assets.module.js';
import { DocumentsModule } from '../../modules/documents/documents.module.js';
import { ProposalsModule } from '../../modules/proposals/proposals.module.js';
import { JobsModule } from '../../modules/jobs/jobs.module.js';
import { LibraryModule } from '../../modules/library/library.module.js';
import { ModelConfigModule } from '../../modules/model-config/model-config.module.js';
import { RegistryModule } from '../../ai/registry/registry.module.js';

@Module({
  imports: [
    IdentityModule,
    WorkspacesModule,
    ProjectsModule,
    AssetsModule,
    DocumentsModule,
    ProposalsModule,
    JobsModule,
    LibraryModule,
    ModelConfigModule,
    RegistryModule,
  ],
})
export class ControlApiModule {}
