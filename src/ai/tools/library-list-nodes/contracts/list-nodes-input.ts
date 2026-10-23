/** ListNodesInput contract. */
export type ListNodesInput = {
  /** Format: uuid */
  publicationId: string;
  cursor?: string;
  limit?: number;
};
