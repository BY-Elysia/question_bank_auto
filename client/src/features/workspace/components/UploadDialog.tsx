import { useRef } from 'react';
import { ArrowDown, ArrowUp, FilePlus2, LoaderCircle, UploadCloud, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ErrorNote } from '@/components/common';
import { useUpload } from '../hooks/useUpload';
export function UploadDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const { files, setFiles, title, setTitle, hover, setHover, action, choose, submit, move } =
    useUpload(onOpenChange, onCreated);
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!action.busy) onOpenChange(v);
      }}
    >
      <DialogContent className="upload-dialog">
        <DialogHeader>
          <div className="dialog-icon">
            <FilePlus2 />
          </div>
          <DialogTitle>让教材，成为结构化知识</DialogTitle>
          <DialogDescription>上传一本 PDF 或一组图片，我们会为你创建独立工作区。</DialogDescription>
        </DialogHeader>
        <label className="field">
          工作区名称
          <input
            value={title}
            maxLength={300}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例如：高中数学 · 必修第一册"
            disabled={action.busy}
          />
        </label>
        <input
          ref={input}
          aria-label="选择教材文件"
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp"
          multiple
          hidden
          disabled={action.busy}
          onChange={(e) => choose(e.target.files)}
        />
        <button
          type="button"
          className={`dropzone ${hover ? 'drag-over' : ''}`}
          disabled={action.busy}
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setHover(true);
          }}
          onDragLeave={() => setHover(false)}
          onDrop={(e) => {
            e.preventDefault();
            setHover(false);
            if (!action.busy) choose(e.dataTransfer.files);
          }}
        >
          <UploadCloud size={32} />
          <strong>{files.length ? '重新选择文件' : '拖拽文件到这里，或点击上传'}</strong>
          <span>PDF / PNG / JPEG / WebP · 总大小 ≤ 100 MB</span>
          <small>PDF 自动转图，无需手动转换</small>
        </button>
        {files.length > 0 && (
          <div className="upload-files">
            {files.map((f, i) => (
              <div key={`${f.name}-${i}`}>
                <span className="mono">{String(i + 1).padStart(2, '0')}</span>
                <span className="truncate">{f.name}</span>
                <small>{(f.size / 1024 / 1024).toFixed(1)} MB</small>
                <button title="上移" disabled={!i || action.busy} onClick={() => move(i, -1)}>
                  <ArrowUp size={14} />
                </button>
                <button
                  title="下移"
                  disabled={i === files.length - 1 || action.busy}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown size={14} />
                </button>
                <button
                  title="移除"
                  disabled={action.busy}
                  onClick={() => setFiles(files.filter((_, j) => i !== j))}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
        <ErrorNote>{action.error}</ErrorNote>
        <Button
          disabled={action.busy || !files.length || !title.trim()}
          onClick={submit}
          className="w-full"
        >
          {action.busy ? (
            <>
              <LoaderCircle className="spin" />
              上传并创建中…
            </>
          ) : (
            <>
              创建工作区 <ArrowUp className="rotate-45" />
            </>
          )}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
