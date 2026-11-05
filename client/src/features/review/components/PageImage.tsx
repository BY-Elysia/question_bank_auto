import type { Content, WorkspaceView } from '@/shared/contracts';
import { usePageImage } from '../hooks/usePageImage';

export function PageImage({
  current,
  nextUrl,
  zoom,
  boxes,
  contents,
  selected,
  onSelect,
}: {
  current: WorkspaceView['pages'][number];
  nextUrl?: string;
  zoom: number;
  boxes: boolean;
  contents: Content[];
  selected: string | null;
  onSelect: (content: Content) => void;
}) {
  const image = usePageImage(current, nextUrl);
  const detail = image.ready && (zoom > 100 || image.detailReady) && current.detailUrl;
  return (
    <div
      className="page-image"
      style={{ width: `${zoom}%`, aspectRatio: `${current.width || 1} / ${current.height || 1}` }}
      aria-busy={!image.ready && !image.failed}
    >
      <img
        key={`${image.baseUrl}:${image.baseAttempt}`}
        src={image.baseUrl}
        alt={`教材第 ${current.number} 页原图`}
        width={current.width || undefined}
        height={current.height || undefined}
        decoding="async"
        fetchPriority="high"
        draggable={false}
        style={{ opacity: image.ready && !image.detailReady ? 1 : 0 }}
        onLoad={image.loaded}
        onError={image.error}
      />
      {detail && !image.detailFailed && (
        <img
          key={`detail:${image.detailAttempt}`}
          className="page-image-detail"
          src={detail}
          alt=""
          aria-hidden="true"
          decoding="async"
          draggable={false}
          style={{ opacity: image.detailReady ? 1 : 0 }}
          onLoad={image.detailLoaded}
          onError={image.detailError}
        />
      )}
      {!image.ready && (
        <div className="page-image-status" role="status">
          {image.failed ? (
            <>
              页图加载失败 <button onClick={image.retryBase}>重新加载</button>
            </>
          ) : (
            '正在加载页图…'
          )}
        </div>
      )}
      {detail && !image.detailReady && (
        <div className="page-image-quality" role="status">
          {image.detailFailed ? (
            <>
              高清图加载失败 <button onClick={image.retryDetail}>重试</button>
            </>
          ) : (
            '正在加载高清图…'
          )}
        </div>
      )}
      {image.ready &&
        boxes &&
        contents.flatMap((content) =>
          content.sources
            .filter((source) => source.page === current.number)
            .map((source, index) => (
              <button
                key={`${content.id}-${index}`}
                className={`source-box ${selected === content.id ? 'active' : ''}`}
                style={{
                  left: `${source.box[0] * 100}%`,
                  top: `${source.box[1] * 100}%`,
                  width: `${(source.box[2] - source.box[0]) * 100}%`,
                  height: `${(source.box[3] - source.box[1]) * 100}%`,
                }}
                aria-label={`定位内容 ${content.question?.label || content.id}`}
                onClick={() => onSelect(content)}
              >
                <span>{content.question?.label || '内容'}</span>
              </button>
            )),
        )}
    </div>
  );
}
