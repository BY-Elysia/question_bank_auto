import { relativeDate } from '@/lib/labels';
import { motion } from 'motion/react';
import {
  ArrowUpRight,
  BookOpen,
  FileScan,
  FolderOpen,
  Plus,
  Search,
  Sparkles,
  Layers3,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Status, Empty, ErrorNote, Loading } from '@/components/common';
import { navigate } from '@/shared/navigation';
import { useDashboard } from '../hooks/useDashboard';
export function Dashboard({ onUpload }: { onUpload: () => void }) {
  const { loading, error, refresh, query, setQuery, filter, setFilter, items, active, filtered } =
    useDashboard();
  return (
    <div className="dashboard">
      <div className="eyebrow">
        <span /> YOUR KNOWLEDGE, STRUCTURED
      </div>
      <div className="page-heading">
        <div>
          <h1>
            每一页，都有新可能<span>。</span>
          </h1>
          <p>从一本教材，到清晰、有序、可追溯的知识。</p>
        </div>
        <Button onClick={onUpload}>
          <Plus size={17} />
          新建工作区
        </Button>
      </div>
      <section className="hero-panel">
        <div className="hero-copy">
          <div className="soft-tag">
            <Sparkles size={14} /> AI 教材结构化
          </div>
          <h2>
            把繁复的整理，
            <br />
            交给智能工作流。
          </h2>
          <p>
            上传材料，识别题目，校对细节。
            <br />
            所有操作，在一个工作区自然衔接。
          </p>
          <button className="text-link" onClick={onUpload}>
            开始第一步 <ArrowUpRight size={16} />
          </button>
        </div>
        <div className="pipeline-art" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="paper-stack">
            <div />
            <div />
            <div className="paper-face">
              <span>TEXTBOOK</span>
              <BookOpen size={40} />
              <i />
              <i />
              <i />
              <small>每一页 · 有迹可循</small>
            </div>
          </div>
          <div className="art-chip chip-top">
            <FileScan size={16} />
            <span>识别 · 提取</span>
            <b />
          </div>
          <div className="art-chip chip-bottom">
            <Layers3 size={16} />
            <span>结构化 JSON</span>
            <CheckCircle2 size={14} />
          </div>
          <span className="art-caption">DOCUMENT → KNOWLEDGE</span>
        </div>
      </section>
      <div className="stats-row">
        {[
          { label: '全部工作区', value: items.length, icon: FolderOpen },
          { label: '正在处理', value: active, icon: FileScan },
          {
            label: '等待校对',
            value: items.filter((w) => w.status === 'needs_review').length,
            icon: Sparkles,
          },
        ].map((s) => (
          <div key={s.label}>
            <s.icon size={18} />
            <span>{s.label}</span>
            <strong>{s.value.toString().padStart(2, '0')}</strong>
          </div>
        ))}
      </div>
      <div className="section-bar">
        <div>
          <h2>
            我的工作区 <span>{items.length}</span>
          </h2>
          <p>继续上次的工作，或开启一本新教材。</p>
        </div>
        <label className="search">
          <Search size={16} />
          <input
            aria-label="搜索工作区"
            placeholder="搜索教材名称…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      <div className="filter-tabs" role="group" aria-label="工作区筛选">
        {[
          ['all', '全部'],
          ['active', '处理中'],
          ['review', '待校对'],
        ].map(([key, label]) => (
          <button
            key={key}
            className={filter === key ? 'selected' : ''}
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {error && (
        <>
          <ErrorNote>{error}</ErrorNote>
          <Button variant="outline" onClick={refresh}>
            重新连接
          </Button>
        </>
      )}
      {loading ? (
        <Loading />
      ) : filtered.length ? (
        <div className="workspace-grid">
          {filtered.map((w, i) => (
            <motion.button
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.035, 0.2) }}
              className="workspace-card"
              key={w.id}
              onClick={() => navigate(w.id)}
            >
              <div className="card-top">
                <span className="book-icon">
                  <BookOpen size={23} />
                </span>
                <Status status={w.status} />
              </div>
              <h3>{w.title}</h3>
              <p>
                {w.sourceKind === 'pdf' ? 'PDF 教材' : '图片教材'}
                <span>·</span>
                {w.totalPages} 页
              </p>
              <div className="card-bottom">
                <span>{relativeDate(w.updatedAt)}</span>
                <ArrowUpRight size={17} />
              </div>
            </motion.button>
          ))}
        </div>
      ) : (
        !error && (
          <div className="empty-workspaces">
            <Empty title={items.length ? '没有匹配的工作区' : '你的第一本教材，从这里开始'}>
              {items.length
                ? '试试其他关键词或筛选条件。'
                : '上传 PDF 或图片，原图、提取结果与修复记录都会保存在一起。'}
            </Empty>
            {!items.length && (
              <Button variant="outline" onClick={onUpload}>
                <Plus size={16} />
                上传教材
              </Button>
            )}
          </div>
        )
      )}
      <footer className="dashboard-footer">
        <span>
          <span className="tiny-dot" />
          为知识保留出处，为整理节省时间
        </span>
        <span>析页 / TEXTBOOK STUDIO</span>
      </footer>
    </div>
  );
}
