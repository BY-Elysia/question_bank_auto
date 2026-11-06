import { FileScan, CheckCircle2, Layers3, ArrowRight, LoaderCircle } from 'lucide-react';
import { motion } from 'motion/react';
import type { WorkspaceView } from '@/shared/contracts';
import { Status } from '@/components/common';
export function Processing({ view }: { view: WorkspaceView }) {
  const w = view.workspace,
    preparing = w.status === 'preparing';
  const count = preparing
    ? w.preparedPages
    : view.chapters.reduce((n, c) => n + c.processedPages, 0);
  const percent = Math.round((count / w.totalPages) * 100);
  return (
    <div className="processing">
      <div className="processing-heading">
        <div className="scan-orb">
          <em className="processing-orbit" aria-hidden="true">
            <b />
            <b />
            <b />
          </em>
          <FileScan size={36} />
          <i />
        </div>
        <div className="eyebrow">{preparing ? 'PREPARING YOUR PAGES' : 'INTELLIGENCE AT WORK'}</div>
        <h2>{preparing ? '正在为每一页做好准备' : '让教材的结构，逐渐清晰'}</h2>
        <p>
          {preparing
            ? 'PDF 正在自动转为图片。完成后即可填写提取信息。'
            : '按章节识别结构与题目，处理跨页内容，保留每一处来源。'}
        </p>
      </div>
      <div className="progress-summary">
        <div>
          <span>{preparing ? '图片准备' : '页面提取'}</span>
          <strong>
            {count}
            <small> / {w.totalPages} 页</small>
          </strong>
        </div>
        <div
          className="progress-track"
          role="progressbar"
          aria-label="页面处理进度"
          aria-valuenow={count}
          aria-valuemin={0}
          aria-valuemax={w.totalPages}
        >
          <motion.div animate={{ width: `${percent}%` }} />
        </div>
        <p>
          {percent === 100 && !preparing
            ? '页面已完成，正在合并结果、检查与处理答案…'
            : '进度自动更新，可以离开此页面，稍后继续。'}
        </p>
      </div>
      <div className="process-flow">
        <span>
          <FileScan />
          页图
        </span>
        <ArrowRight />
        <span className="highlight">
          <Layers3 />
          结构与题目
        </span>
        <ArrowRight />
        <span>
          <CheckCircle2 />
          校对与导出
        </span>
      </div>
      {!!view.chapters.length && (
        <div className="chapter-progress-grid">
          {view.chapters.map((c, i) => (
            <div className="chapter-progress" key={c.id}>
              <div>
                <span className="mono">CHAPTER {String(i + 1).padStart(2, '0')}</span>
                <Status status={c.status} />
              </div>
              <h3>{c.title ?? `第 ${i + 1} 章 · 识别中`}</h3>
              <div className="progress-track">
                <motion.div animate={{ width: `${(c.processedPages / c.pages.length) * 100}%` }} />
              </div>
              <footer>
                <span>
                  {c.processedPages} / {c.pages.length} 页
                </span>
                <span>{c.preview?.contents.length ?? 0} 个内容块</span>
              </footer>
              {c.error && <p className="error-text">{c.error}</p>}
            </div>
          ))}
        </div>
      )}
      <div className="live-note">
        <LoaderCircle size={14} className="spin" />
        保留正式队列与检查点，跨页题目完整后再发布。
      </div>
    </div>
  );
}
