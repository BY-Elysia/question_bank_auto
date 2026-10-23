import type { Publication } from '../../domain/publication.js';

/** 读取来源快照. Runtime validation is not implemented yet. */
export interface GetPublicationInput {
  path: {
    publicationId: string;
  };
}

export type GetPublicationResult = Publication;
