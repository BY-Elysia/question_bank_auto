import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Minus, Plus, Maximize, Focus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Content, WorkspaceView } from '@/shared/contracts';
export function PageCanvas({
  pages,
  page,
  setPage,
  contents,
  selected,
  onSelect,
}: {
  pages: WorkspaceView['pages'];
  page: number;
  setPage: (n: number) => void;
  contents: Content[];
  selected: string | null;
  onSelect: (c: Content) => void;
}) {
  const [zoom, setZoom] = useState(100),
    [boxes, setBoxes] = useState(true),
    [failed, setFailed] = useState(false);
  const scroll = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const current = pages.find((p) => p.number === page);
  return (
    <section className="canvas-panel">
      <div className="canvas-toolbar">
        <span>
          <Focus size={15} />
          原图对照
        </span>
        <div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="缩小"
            disabled={zoom <= 50}
            onClick={() => setZoom((v) => v - 25)}
          >
            <Minus size={15} />
          </Button>
          <span className="mono">{zoom}%</span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="放大"
            disabled={zoom >= 250}
            onClick={() => setZoom((v) => v + 25)}
          >
            <Plus size={15} />
          </Button>
          <Button variant="ghost" size="icon" aria-label="适应画布" onClick={() => setZoom(100)}>
            <Maximize size={15} />
          </Button>
        </div>
      </div>
      <div
        ref={scroll}
        className="image-scroll"
        onPointerDown={(e) => {
          if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
          const el = e.currentTarget;
          drag.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
          el.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          e.currentTarget.scrollLeft = drag.current.left + drag.current.x - e.clientX;
          e.currentTarget.scrollTop = drag.current.top + drag.current.y - e.clientY;
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        {current && (
          <div className="page-image" style={{ width: `${zoom}%` }}>
            <img
              key={current.imageUrl}
              draggable={false}
              src={current.imageUrl}
              alt={`教材第 ${page} 页原图`}
              onLoad={() => setFailed(false)}
              onError={() => setFailed(true)}
            />
            {!failed &&
              boxes &&
              contents.flatMap((c) =>
                c.sources
                  .filter((s) => s.page === page)
                  .map((s, i) => (
                    <button
                      key={`${c.id}-${i}`}
                      className={`source-box ${selected === c.id ? 'active' : ''}`}
                      style={{
                        left: `${s.box[0] * 100}%`,
                        top: `${s.box[1] * 100}%`,
                        width: `${(s.box[2] - s.box[0]) * 100}%`,
                        height: `${(s.box[3] - s.box[1]) * 100}%`,
                      }}
                      aria-label={`定位内容 ${c.question?.label || c.id}`}
                      onClick={() => onSelect(c)}
                    >
                      <span>{c.question?.label || '内容'}</span>
                    </button>
                  )),
              )}
          </div>
        )}
        {failed && <p className="error-text">页图加载失败，请检查连接并刷新。</p>}
      </div>
      <div className="canvas-footer">
        <label>
          <input type="checkbox" checked={boxes} onChange={(e) => setBoxes(e.target.checked)} />
          显示来源框
        </label>
        <div>
          <Button
            size="icon"
            variant="ghost"
            aria-label="上一页"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            <ChevronLeft size={16} />
          </Button>
          <select
            aria-label="当前页"
            value={page}
            onChange={(e) => setPage(Number(e.target.value))}
          >
            {pages.map((p) => (
              <option value={p.number} key={p.number}>
                第 {p.number} / {pages.length} 页
              </option>
            ))}
          </select>
          <Button
            size="icon"
            variant="ghost"
            aria-label="下一页"
            disabled={page >= pages.length}
            onClick={() => setPage(page + 1)}
          >
            <ChevronRight size={16} />
          </Button>
        </div>
      </div>
    </section>
  );
}
