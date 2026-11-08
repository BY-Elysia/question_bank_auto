import type { Change } from '@/shared/contracts';
import { ContentBody } from '@/components/ContentBody';
import { Button } from '@/components/ui/button';
export function ChangeCards({
  changes,
  busy,
  onUndo,
}: {
  changes: Change[];
  busy: boolean;
  onUndo: (id: string) => void;
}) {
  return (
    <div className="assistant-changes">
      {changes
        .slice(-3)
        .reverse()
        .map((c) => (
          <article key={c.id} className="change-card">
            <strong>
              {c.undoneAt ? '已撤销' : '已修改'} · 题目 {c.after.question?.label}
            </strong>
            <details>
              <summary>查看修改差异</summary>
              <div className="change-diff">
                <section>
                  <h4>修改前</h4>
                  <ContentBody content={c.before} />
                </section>
                <section>
                  <h4>修改后</h4>
                  <ContentBody content={c.after} />
                </section>
              </div>
            </details>
            {!c.undoneAt && (
              <Button variant="outline" size="sm" disabled={busy} onClick={() => onUndo(c.id)}>
                撤销此次修改
              </Button>
            )}
          </article>
        ))}
    </div>
  );
}
