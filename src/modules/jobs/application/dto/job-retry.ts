/** 只允许 failed 或 cancelled。新建任务 ID，保留原冻结计划；原文档版本不再匹配时返回 409，必须显式发起新任务。 */
export type JobRetry = {
  fromCheckpoint: boolean;
};
