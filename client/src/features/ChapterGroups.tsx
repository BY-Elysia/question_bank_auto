import { useRef, useState } from 'react';
import { Check, Layers3, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { WorkspaceView } from '@/lib/api';
export type Group = { id: number; pages: number[] };
export function ChapterGroups({
  pages,
  groups,
  onChange,
}: {
  pages: WorkspaceView['pages'];
  groups: Group[];
  onChange: (g: Group[]) => void;
}) {
  const [selected, setSelected] = useState<number[]>([]),
    [target, setTarget] = useState(1);
  const last = useRef<number | null>(null);
  const assigned = new Set(groups.flatMap((g) => g.pages));
  function select(n: number, shift: boolean) {
    if (shift && last.current !== null) {
      const low = Math.min(n, last.current),
        high = Math.max(n, last.current);
      setSelected((old) => [
        ...new Set([
          ...old,
          ...pages.filter((p) => p.number >= low && p.number <= high).map((p) => p.number),
        ]),
      ]);
    } else setSelected((old) => (old.includes(n) ? old.filter((v) => v !== n) : [...old, n]));
    last.current = n;
  }
  function assign(id: number, values = selected) {
    onChange(
      groups.map((g) => ({
        ...g,
        pages:
          g.id === id
            ? [...new Set([...g.pages, ...values])].sort((a, b) => a - b)
            : g.pages.filter((p) => !values.includes(p)),
      })),
    );
    setSelected([]);
  }
  return (
    <section className="chapter-groups">
      <div className="section-bar">
        <div>
          <h3>把图片分配到章节</h3>
          <p>选择图片后分配，也可拖入章节。章节名称由 AI 自动识别。</p>
        </div>
        <span className="counter">
          未分配 {pages.length - assigned.size} / {pages.length}
        </span>
      </div>
      <div className="group-toolbar">
        <Button variant="outline" size="sm" onClick={() => setSelected(pages.map((p) => p.number))}>
          全选
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setSelected([])}>
          清除选择
        </Button>
        <span>已选 {selected.length} 页</span>
        <select
          aria-label="目标章节"
          value={target}
          onChange={(e) => setTarget(Number(e.target.value))}
        >
          {groups.map((g, i) => (
            <option value={g.id} key={g.id}>
              第 {i + 1} 章
            </option>
          ))}
        </select>
        <Button size="sm" disabled={!selected.length} onClick={() => assign(target)}>
          分配到章节
        </Button>
      </div>
      <div className="group-layout">
        <div className="thumbnail-grid">
          {pages.map((p) => {
            const group = groups.findIndex((g) => g.pages.includes(p.number)),
              checked = selected.includes(p.number);
            return (
              <button
                type="button"
                key={p.number}
                className={`thumbnail ${checked ? 'is-selected' : ''}`}
                aria-label={`选择第 ${p.number} 页`}
                aria-pressed={checked}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(
                    'application/x-pages',
                    JSON.stringify(checked ? selected : [p.number]),
                  );
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onClick={(e) => select(p.number, e.shiftKey)}
              >
                <img src={p.imageUrl} loading="lazy" alt={`第 ${p.number} 页`} />
                <span className="thumb-check">{checked && <Check size={12} />}</span>
                <div>
                  <b>{String(p.number).padStart(2, '0')}</b>
                  <small>{group < 0 ? '未分配' : `第 ${group + 1} 章`}</small>
                </div>
              </button>
            );
          })}
        </div>
        <div className="group-buckets">
          {groups.map((g, i) => (
            <div
              key={g.id}
              className="group-bucket"
              onDragOver={(e) => {
                e.preventDefault();
                e.currentTarget.classList.add('drag-over');
              }}
              onDragLeave={(e) => e.currentTarget.classList.remove('drag-over')}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove('drag-over');
                try {
                  const values: unknown = JSON.parse(e.dataTransfer.getData('application/x-pages'));
                  if (
                    Array.isArray(values) &&
                    values.every((n) => typeof n === 'number' && pages.some((p) => p.number === n))
                  )
                    assign(g.id, values);
                } catch {}
              }}
            >
              <div>
                <Layers3 size={16} />
                <strong>第 {i + 1} 章</strong>
                {groups.length > 2 && (
                  <button
                    aria-label={`删除第 ${i + 1} 章分组`}
                    onClick={() => {
                      onChange(groups.filter((v) => v.id !== g.id));
                      if (target === g.id) setTarget(groups.find((v) => v.id !== g.id)!.id);
                    }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <p>
                {g.pages.length
                  ? `${g.pages.length} 页 · ${g.pages.join('、')}`
                  : '拖入图片，或选择后点击分配'}
              </p>
              <Button
                variant="ghost"
                size="sm"
                disabled={!selected.length}
                onClick={() => assign(g.id)}
              >
                将选中图片移入
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            disabled={groups.length >= Math.min(100, pages.length)}
            onClick={() =>
              onChange([...groups, { id: Math.max(...groups.map((g) => g.id)) + 1, pages: [] }])
            }
          >
            <Plus size={15} />
            添加章节
          </Button>
          <small>每页只属于一个章节；组内保持原始页序。Shift + 点击可连续选择。</small>
        </div>
      </div>
    </section>
  );
}
