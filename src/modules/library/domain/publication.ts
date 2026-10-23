/** 发布是不可变快照；重复发布同一文档版本返回同一资源，文档后续编辑不修改此快照。 */
export type Publication = {
  /** Format: uuid */
  id: string;
  /** Format: uuid */
  projectId: string;
  /** Format: uuid */
  documentId: string;
  documentRevision: number;
  title: string;
  /** @enum {string} */
  kind: 'textbook' | 'exam';
  questionCount: number;
  /** Format: date-time */
  createdAt: string;
  /** @enum {string} */
  status: 'published' | 'withdrawn';
};
