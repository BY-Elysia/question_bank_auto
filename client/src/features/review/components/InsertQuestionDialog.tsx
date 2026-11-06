import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ErrorNote } from '@/components/common';
import type { ReviewController } from '../hooks/useReview';
export function InsertQuestionDialog({ model }: { model: ReviewController }) {
  const [file, setFile] = useState<File | null>(null);
  return (
    <Dialog
      open={!!model.insertion}
      onOpenChange={(v) => {
        if (!v && !model.action.busy) model.setInsertion(null);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>补充漏题</DialogTitle>
          <DialogDescription>
            上传该题图片，在当前题目{model.insertion?.position === 'before' ? '上方' : '下方'}
            插入提取结果。上传后可离开页面，后台继续处理。
          </DialogDescription>
        </DialogHeader>
        <label className="field">
          题目图片
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <ErrorNote>{model.action.error}</ErrorNote>
        <Button disabled={!file || model.action.busy} onClick={() => file && model.insert(file)}>
          上传并提取
        </Button>
      </DialogContent>
    </Dialog>
  );
}
