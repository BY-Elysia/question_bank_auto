import type { DocumentContent } from '../../../documents/domain/document-content.js';
import type { LeaseContext } from '../../domain/lease-context.js';
import type { Problem } from '../../../../shared/errors/problem.js';
import type { ProposalDraft } from '../../../proposals/domain/proposal-draft.js';

/** 失败要求 error；成功按 workflow 类型限制结果。仅 document-import 可提供 importedContent 并创建新文档。控制服务校验、登记资产、创建 proposal/文档和终态，在一个业务事务中完成；模型结果不直接覆盖现有文档。 */
export type JobComplete = {
  lease: LeaseContext;
  /** @enum {string} */
  state: 'succeeded' | 'failed' | 'cancelled' | 'needs_input';
  proposals: ProposalDraft[];
  artifactIds: string[];
  importedContent?: DocumentContent;
  questionVersionIds: string[];
  error?: Problem;
} & unknown;
