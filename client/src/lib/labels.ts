export const kindNames: Record<string, string> = {
  question: '习题',
  example: '例题',
  paragraph: '正文',
  heading: '标题',
  formula: '公式',
  figure: '插图',
  table: '表格',
  answer: '答案',
};
export const statusLabels: Record<string, string> = {
  preparing: '准备图片',
  ready: '待配置',
  extracting: '提取中',
  completed: '已完成',
  needs_review: '待校对',
  failed: '处理失败',
  cancelled: '已取消',
  interrupted: '已中断',
  deleting: '删除中',
  queued: '等待中',
  running: '处理中',
};
export function relativeDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
