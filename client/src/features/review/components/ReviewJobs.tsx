import { Status } from '@/components/common';
import { Button } from '@/components/ui/button';
import type { ReviewController } from '../hooks/useReview';
export function ReviewJobs({ model, canReview }: { model: ReviewController; canReview: boolean }) {
  const { jobs, action, commandJob, activeJob } = model;
  return (
    <>
      {jobs
        .filter((j) =>
          ['running', 'queued', 'failed', 'interrupted', 'cancelled'].includes(j.status),
        )
        .map((j) => (
          <div className="job-notice" key={j.id}>
            <Status status={j.status} />
            <span>
              {
                { verify: '原文核对', repair: '内容修复', answers: '答案补全', parse: '题目提取' }[
                  j.kind
                ]
              }
              {j.error ? ` · ${j.error}` : ''}
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
            ) : (
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
