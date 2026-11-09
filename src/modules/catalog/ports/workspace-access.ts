/** Request-principal-bound authorization, independent of any assistant session. */
export const WORKSPACE_ACCESS = Symbol('WORKSPACE_ACCESS');
export interface WorkspaceAccess {
  authorize(workspaceId: string): Promise<void>;
}
