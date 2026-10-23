import type { PublicationPage } from '../dto/publication-page.js';

/** 列出当前用户的发布快照. Runtime validation is not implemented yet. */
export interface ListPublicationsInput {
  query: {
    cursor?: string;
    limit?: number;
  };
}

export type ListPublicationsResult = PublicationPage;
