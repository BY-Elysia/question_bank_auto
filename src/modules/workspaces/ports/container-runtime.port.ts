export const CONTAINER_RUNTIME = Symbol('CONTAINER_RUNTIME');

/** Docker implementation is deferred; image, mounts and limits are server policy. */
export interface ContainerRuntime {
  start(workspaceId: string, generation: number): Promise<void>;
  stop(workspaceId: string, generation: number): Promise<void>;
}
