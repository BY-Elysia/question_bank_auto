import { Empty } from '@/components/common';
import type { WorkspaceView } from '@/shared/contracts';
export function ReviewIssues({
  issues,
  onLocate,
}: {
  issues: WorkspaceView['document']['issues'];
  onLocate: (page: number, contentId: string | null) => void;
}) {
  if (!issues.length)
    return <Empty title="暂无已记录的问题">你仍可以对照原图校对，或发起全书核对。</Empty>;
  return issues.map((issue, i) => (
    <div className="issue-card" key={i}>
      <span className={`issue-level ${issue.severity}`}>
        {issue.severity === 'error' ? '需处理' : '请注意'}
      </span>
      <p>{issue.message}</p>
      {issue.page && (
        <button className="text-link" onClick={() => onLocate(issue.page!, issue.contentId)}>
          定位第 {issue.page} 页
        </button>
      )}
    </div>
  ));
}
