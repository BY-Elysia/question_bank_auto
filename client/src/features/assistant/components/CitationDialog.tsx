import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ErrorNote } from '@/components/common';
import RichText from '@/components/RichText';
import { useCitation } from '../hooks/useKnowledge';
export function CitationDialog({
  conversationId,
  id,
  onClose,
}: {
  conversationId: string;
  id: string;
  onClose: () => void;
}) {
  const m = useCitation(conversationId, id),
    e = m.data?.citation;
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="citation-dialog">
        <DialogHeader>
          <DialogTitle>{e ? `${e.title} · 题目 ${e.label}` : '读取来源'}</DialogTitle>
          <DialogDescription>查看提取的原文与对应书页，核对回答依据。</DialogDescription>
        </DialogHeader>
        <ErrorNote>{m.error}</ErrorNote>
        {m.loading && <p>正在读取来源…</p>}
        {e && (
          <>
            <p>
              {e.section} · 引用修订 {e.revision}
            </p>
            {m.data?.status === 'changed' && (
              <p role="status">
                教材已更新至修订 {m.data.currentRevision}
                。下面文字保留引用时的内容，图片为当前教材原图。
              </p>
            )}
            {m.data?.status === 'deleted' && <p role="status">原工作区已删除，无法打开原图。</p>}
            <div className="citation-pages">
              {[...new Set(e.sources.map((s) => s.page))].map((p) => (
                <Button
                  key={p}
                  size="sm"
                  variant={p === m.page ? 'default' : 'outline'}
                  onClick={() => m.setPage(p)}
                >
                  第 {p} 页
                </Button>
              ))}
            </div>
            <div className="citation-content">
              <RichText text={e.excerpt} />
              {m.image && (
                <div className="citation-image">
                  <img src={m.image} alt={`来源第 ${m.page} 页原图`} />
                  {e.sources
                    .filter((s) => s.page === m.page)
                    .map((s, i) => (
                      <span
                        key={i}
                        style={{
                          left: `${s.box[0] * 100}%`,
                          top: `${s.box[1] * 100}%`,
                          width: `${(s.box[2] - s.box[0]) * 100}%`,
                          height: `${(s.box[3] - s.box[1]) * 100}%`,
                        }}
                      />
                    ))}
                </div>
              )}
            </div>
            {m.data?.status === 'current' && (
              <Button
                variant="outline"
                onClick={() => {
                  sessionStorage.setItem(
                    'review-source',
                    JSON.stringify({
                      workspaceId: e.workspaceId,
                      contentId: e.contentId,
                      page: m.page,
                      revision: e.revision,
                    }),
                  );
                  window.dispatchEvent(new Event('review-source-selected'));
                  onClose();
                  location.hash = `/workspace/${e.workspaceId}`;
                }}
              >
                在教材中定位此题
              </Button>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
