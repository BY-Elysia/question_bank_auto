import { Status } from '@/components/common';
import { Button } from '@/components/ui/button';
import type { ReviewController } from '../hooks/useReview';
export function ReviewJobs({ model, canReview }: { model: ReviewController; canReview: boolean }) {
  const { jobs, action, commandJob, activeJob } = model;
  return (
    <>
      {jobs
        .filter(
          (j) =>
            !j.supersededBy &&
            (['running', 'queued', 'failed', 'interrupted', 'cancelled'].includes(j.status) ||
              (j.kind === 'answers' && j.status === 'needs_review' && j.issues.length > 0)),
        )
        .map((j) => (
          <div className="job-notice" key={j.id}>
            <Status
              status={
                j.kind === 'answers' && j.status === 'failed'
                  ? 'answers_failed'
                  : j.kind === 'answers' && j.status === 'needs_review'
                    ? 'answers_partial'
                    : j.status
              }
            />
            <span>
              {
                {
                  verify: '原文核对',
                  repair: '内容修复',
                  answers: '答案补全',
                  parse: '题目提取',
                  insert: '补充题目',
                }[j.kind]
              }
              {j.kind === 'answers' && j.error
                ? ' · 已保存成功结果，可从断点继续。'
                : j.error
                  ? ` · ${j.error}`
                  : ''}
              {j.kind === 'answers' && j.status === 'needs_review'
                ? ` · ${j.issues.length} 条问题，其他题目已继续处理。`
                : ''}
            </span>
            {['running', 'queued'].includes(j.status) ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={action.busy}
                onClick={() => commandJob(j.id, 'cancel')}
              >
                取消任务
              </Button>
            ) : j.status === 'needs_review' ? null : (
              <Button
                size="sm"
                variant="ghost"
                disabled={action.busy || activeJob || !canReview}
                onClick={() => commandJob(j.id, 'resume')}
              >
                恢复任务
              </Button>
            )}
          </div>
        ))}
    </>
  );
}
