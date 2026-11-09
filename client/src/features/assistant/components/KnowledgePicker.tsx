import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ErrorNote } from '@/components/common';
import type { useKnowledge } from '../hooks/useKnowledge';
export function KnowledgePicker({
  model,
  disabled,
}: {
  model: ReturnType<typeof useKnowledge>;
  disabled: boolean;
}) {
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => model.setOpen(true)}>
        教材资料
        {model.scope.data?.workspaceIds.length ? ` · ${model.scope.data.workspaceIds.length}` : ''}
      </Button>
      <Dialog open={model.open} onOpenChange={model.setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>选择本次对话的教材</DialogTitle>
            <DialogDescription>
              助手只读取选定教材。修改范围后，后续回答会重新建立资料上下文。
            </DialogDescription>
          </DialogHeader>
          <div className="knowledge-list">
            {model.available.data?.map((w) => (
              <label key={w.id}>
                <input
                  type="checkbox"
                  checked={model.chosen.includes(w.id)}
                  disabled={disabled || model.action.busy}
                  onChange={(e) =>
                    model.setChosen((v) =>
                      e.target.checked ? [...v, w.id] : v.filter((id) => id !== w.id),
                    )
                  }
                />
                <span>
                  {w.title}
                  <small>
                    {w.totalPages} 页 ·{' '}
                    {['completed', 'needs_review'].includes(w.status)
                      ? '可查询'
                      : '仅查询已发布部分'}
                  </small>
                </span>
              </label>
            ))}
          </div>
          {!model.available.loading && !model.available.data?.length && (
            <p>还没有可用工作区，请先上传教材。</p>
          )}
          {disabled && <p>请先停止当前任务，再修改资料范围。</p>}
          <ErrorNote>{model.available.error || model.scope.error || model.action.error}</ErrorNote>
          <Button
            disabled={disabled || model.action.busy || model.chosen.length > 10}
            onClick={model.save}
          >
            应用资料范围
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
