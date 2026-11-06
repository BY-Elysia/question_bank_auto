import { useRef, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Minus, Plus, Maximize, Focus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Content, WorkspaceView } from '@/shared/contracts';
import { PageImage } from './PageImage';
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
    [boxes, setBoxes] = useState(true);
  const scroll = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(true);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const node = scroll.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      const style = getComputedStyle(node);
      setViewport({ width: node.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
        height: node.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const source = pages.find(p => p.number === page);
  const fitZoom = viewport.width && source?.width && source.height
    ? Math.min(100, viewport.height * source.width / source.height / viewport.width * 100) : 100;
  const visibleZoom = fit ? fitZoom : zoom;
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [retained, setRetained] = useState({ page, pages: [page] });
  if (retained.page !== page)
    setRetained({ page, pages: [...retained.pages.filter(n => n !== page), page].slice(-3) });
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
            disabled={visibleZoom <= 25}
            onClick={() => { setFit(false); setZoom(Math.max(25, visibleZoom - 25)); }}
          >
            <Minus size={15} />
          </Button>
          <span className="mono">{fit ? '整页' : `${Math.round(zoom)}%`}</span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="放大"
            disabled={zoom >= 250}
            onClick={() => { setFit(false); setZoom(Math.min(250, visibleZoom + 25)); }}
          >
            <Plus size={15} />
          </Button>
          <Button variant="ghost" size="icon" aria-label="适应画布" onClick={() => { setZoom(100); setFit(true); }}>
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
        {retained.pages.map(n => {
          const current = pages.find(p => p.number === n);
          return current && <div key={current.imageUrl} hidden={n !== page}>
          <PageImage
            key={current.imageUrl}
            current={current}
            nextUrl={n === page ? pages.find((p) => p.number === page + 1)?.previewUrl : undefined}
            zoom={visibleZoom}
            requestDetail={!fit}
            boxes={boxes}
            contents={n === page ? contents : []}
            selected={selected}
            onSelect={onSelect}
          />
          </div>;
        })}
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
