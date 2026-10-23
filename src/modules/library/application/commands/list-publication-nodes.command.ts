import type { NodePage } from '../dto/node-page.js';

/** 获取已发布结构节点. Runtime validation is not implemented yet. */
export interface ListPublicationNodesInput {
  path: {
    publicationId: string;
  };
  query: {
    cursor?: string;
    limit?: number;
  };
}

export type ListPublicationNodesResult = NodePage;
