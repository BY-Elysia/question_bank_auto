import type { Publication } from '../../domain/publication.js';
import type { PublicationCreate } from '../dto/publication-create.js';

/** 发布指定文档版本到题库. Runtime validation is not implemented yet. */
export interface PublishDocumentInput {
  headers: {
    'Idempotency-Key': string;
  };
  body: PublicationCreate;
}

export type PublishDocumentResult = Publication;
