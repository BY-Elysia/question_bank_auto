import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ErrorNote } from '@/components/common';
import type { WorkspaceView } from '@/shared/contracts';
import { useMetadataEditor } from '../hooks/useMetadataEditor';
export function MetadataDialog({
  view,
  onClose,
  onSaved,
}: {
  view: WorkspaceView;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { metadata, setMetadata, action, save } = useMetadataEditor(view, onSaved, onClose);
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !action.busy) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>教材基础信息</DialogTitle>
          <DialogDescription>保存后更新教材名称与导出信息，不重新提取题目。</DialogDescription>
        </DialogHeader>
        <div className="form-grid">
          {(['title', 'subject', 'publisher', 'version', 'courseId', 'textbookId'] as const).map(
            (key, i) => (
              <label className="field" key={key}>
                {['教材名称', '学科', '出版社', '数据版本', '课程 ID', '教材 ID'][i]}
                <input
                  value={metadata[key]}
                  onChange={(e) => setMetadata({ ...metadata, [key]: e.target.value })}
                />
              </label>
            ),
          )}
        </div>
        <label>
          <input
            type="checkbox"
            checked={metadata.hasAnswer}
            onChange={(e) =>
              setMetadata({
                ...metadata,
                hasAnswer: e.target.checked,
                answerHandlingMode: e.target.checked ? 'extract_visible' : 'leave_empty',
              })
            }
          />{' '}
          教材包含原文答案
        </label>
        <ErrorNote>{action.error}</ErrorNote>
        <Button
          onClick={save}
          disabled={action.busy || !metadata.title.trim() || !metadata.subject.trim()}
        >
          保存教材信息
        </Button>
      </DialogContent>
    </Dialog>
  );
}
