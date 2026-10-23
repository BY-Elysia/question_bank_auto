import type { ProposalPage } from '../dto/proposal-page.js';

/** 列出模型或组卷修改建议. Runtime validation is not implemented yet. */
export interface ListDocumentProposalsInput {
  path: {
    documentId: string;
  };
  query: {
    cursor?: string;
    limit?: number;
  };
}

export type ListDocumentProposalsResult = ProposalPage;
