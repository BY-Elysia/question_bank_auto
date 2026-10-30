// Type-only boundary to backend contracts; no server implementation enters the browser bundle.
import type { z } from 'zod';
import type {
  WorkspaceList,
  WorkspaceViewResponse,
} from '../../../src/modules/workspaces/presentation/contracts';
export type {
  Content,
  Document,
  Source,
  Question,
} from '../../../src/modules/textbooks/domain/content';
export type { Proposal } from '../../../src/modules/textbooks/domain/book';
export type {
  ExtractionSettings,
  Workspace,
} from '../../../src/modules/workspaces/domain/workspace';
export type Workspaces = z.infer<typeof WorkspaceList>;
export type WorkspaceView = z.infer<typeof WorkspaceViewResponse>;
