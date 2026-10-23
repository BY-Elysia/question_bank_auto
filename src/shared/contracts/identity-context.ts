/** Created by authentication adapters, never from an HTTP request body. */
export interface UserScope {
  userId: string;
  workspaceId: string;
}

export interface WorkerScope extends UserScope {
  containerGeneration: number;
  scopes: readonly string[];
}
