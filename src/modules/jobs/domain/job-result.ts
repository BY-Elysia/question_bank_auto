/** 提取/编辑/组卷返回 proposalIds；导入返回新 documentIds；转图/导出返回 assetIds；检索返回 questionVersionIds。 */
export type JobResult = {
  proposalIds: string[];
  assetIds: string[];
  documentIds: string[];
  questionVersionIds: string[];
};
