import type { QuestionRange } from '../../../ai/skills/question-boundary-detect/contracts/question-range.js';

/** 检查点和对应产物在控制服务事务中提交；恢复以此为准，本地文件仅为产物。 nextPageIndex 指 request.pageAssetIds 的零基下标；checkpoint 与 step 产物在同一次 commit 中前进，重放同提交不得推进两次。 */
export type Checkpoint = {
  sequence: number;
  nextPageIndex: number;
  pendingRanges: QuestionRange[];
  currentNodeId: string | null;
  candidateArtifactIds: string[];
  completedStepIds: string[];
};
