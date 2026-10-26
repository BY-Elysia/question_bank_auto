import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { ErrorNote } from '@/components/common';
import { type Content, write, bookUrl } from '@/lib/api';
import { useAction } from '@/lib/hooks';
export function EditDialog({
  id,
  content,
  revision,
  onClose,
  onSaved,
}: {
  id: string;
  content: Content;
  revision: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Content>(() => structuredClone(content));
  const action = useAction();
  function updateLeaf(index: number, field: 'prompt' | 'answer' | 'explanation', value: string) {
    setDraft((old) => {
      const d = structuredClone(old),
        q = index < 0 ? d.question! : d.question!.children[index];
      if (field === 'prompt') q.prompt = value;
      else {
        if (!q.answer)
          q.answer = {
            text: '',
            explanation: '',
            origin: 'human',
            review: 'accepted',
            sources: [],
          };
        q.answer[field === 'answer' ? 'text' : 'explanation'] = value;
      }
      return d;
    });
  }
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !action.busy) onClose();
      }}
    >
      <DialogContent className="edit-dialog">
        <DialogHeader>
          <DialogTitle>编辑内容</DialogTitle>
          <DialogDescription>保存会创建新修订，修改后的答案标记为人工确认。</DialogDescription>
        </DialogHeader>
        <div className="editor-fields">
          {draft.question ? (
            [draft.question, ...draft.question.children].map((q, i) => (
              <fieldset key={i}>
                <legend>{i === 0 ? '题目内容' : `小问 ${q.label || i}`}</legend>
                <label className="field">
                  题干
                  <textarea
                    aria-label={i === 0 ? '题干' : `小问 ${i} 题干`}
                    rows={4}
                    value={q.prompt}
                    onChange={(e) => updateLeaf(i - 1, 'prompt', e.target.value)}
                  />
                </label>
                {q.options.map((o, j) => (
                  <label className="field" key={j}>
                    选项 {o.id}
                    <textarea
                      rows={2}
                      value={o.text}
                      onChange={(e) =>
                        setDraft((old) => {
                          const d = structuredClone(old),
                            leaf = i === 0 ? d.question! : d.question!.children[i - 1];
                          leaf.options[j].text = e.target.value;
                          return d;
                        })
                      }
                    />
                  </label>
                ))}
                <label className="field">
                  答案
                  <textarea
                    rows={2}
                    value={q.answer?.text ?? ''}
                    onChange={(e) => updateLeaf(i - 1, 'answer', e.target.value)}
                  />
                </label>
                <label className="field">
                  解题步骤
                  <textarea
                    rows={3}
                    value={q.answer?.explanation ?? ''}
                    onChange={(e) => updateLeaf(i - 1, 'explanation', e.target.value)}
                  />
                </label>
                {q.answer && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setDraft((old) => {
                        const d = structuredClone(old);
                        (i === 0 ? d.question! : d.question!.children[i - 1]).answer = null;
                        return d;
                      })
                    }
                  >
                    清空答案
                  </Button>
                )}
              </fieldset>
            ))
          ) : (
            <label className="field">
              正文
              <textarea
                rows={10}
                value={draft.text}
                onChange={(e) => setDraft({ ...draft, text: e.target.value })}
              />
            </label>
          )}
          {draft.table && (
            <label className="field">
              表格内容（每行一行，单元格用 Tab 分隔）
              <textarea
                rows={6}
                value={draft.table.map((row) => row.join('\t')).join('\n')}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    table: e.target.value.split('\n').map((row) => row.split('\t')),
                  })
                }
              />
            </label>
          )}
          {draft.caption !== null && (
            <label className="field">
              图注
              <input
                value={draft.caption}
                onChange={(e) => setDraft({ ...draft, caption: e.target.value })}
              />
            </label>
          )}
        </div>
        <ErrorNote>{action.error}</ErrorNote>
        <Button
          disabled={action.busy}
          onClick={() =>
            action.run(async () => {
              await write(
                bookUrl(id) + `/contents/${content.id}`,
                { expectedRevision: revision, content: draft },
                'PATCH',
              );
              onSaved();
              onClose();
            })
          }
        >
          {action.busy ? '保存中…' : '保存修改'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
