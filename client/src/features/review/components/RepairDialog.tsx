import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { ErrorNote } from '@/components/common';
import { Button } from '@/components/ui/button';
import type { ReviewController } from '../hooks/useReview';
export function RepairDialog({ model }: { model: ReviewController }) {
  const { repair, setRepair, action, instruction, setInstruction, job } = model;
  return (
    <Dialog
      open={!!repair}
      onOpenChange={(v) => {
        if (!v && !action.busy) setRepair(null);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>对照原图，修复内容</DialogTitle>
          <DialogDescription>说明需要修正的内容，AI 将生成候选供你审核。</DialogDescription>
        </DialogHeader>
        <label className="field">
          修复要求
          <textarea
            rows={5}
            value={instruction}
            maxLength={8000}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="例如：修正第二个小问中的公式，保留其他内容"
          />
        </label>
        <ErrorNote>{action.error}</ErrorNote>
        <Button
          disabled={!instruction.trim() || action.busy}
          onClick={() => repair && job('repair', repair)}
        >
          {action.busy ? '提交中…' : '生成修复候选'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
