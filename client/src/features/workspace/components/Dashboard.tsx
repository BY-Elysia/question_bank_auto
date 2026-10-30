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
  LayoutGrid,
  List,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Status, Empty, ErrorNote, Loading } from '@/components/common';
import { navigate } from '@/shared/navigation';
import { useDashboard } from '../hooks/useDashboard';
export function Dashboard({ onUpload }: { onUpload: () => void }) {
  const {
    loading,
    error,
    refresh,
    query,
    setQuery,
    filter,
    setFilter,
    items,
    active,
    filtered,
    layout,
    setLayout,
  } = useDashboard();
  return (
    <div className="dashboard">
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR LIBRARY</div>
          <h1>教材库</h1>
          <p>从原始书页到结构化题目，让每一份知识都有出处。</p>
        </div>
        <Button onClick={onUpload}>
          <Plus size={17} />
          新建工作区
        </Button>
      </div>
      {!items.length && (
        <section className="library-welcome">
          <div className="welcome-copy">
            <span className="soft-tag">
              <Sparkles size={14} /> 教材整理助手
            </span>
            <h2>一本教材，三步整理。</h2>
            <p>上传后自动转图，提取题目，再对照原文完成校对。</p>
            <button className="text-link" onClick={onUpload}>
              导入 PDF 或图片 <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="welcome-steps">
            {[
              { number: '01', icon: FileScan, title: '导入材料', note: 'PDF · 图片' },
              { number: '02', icon: Layers3, title: '智能提取', note: '章节 · 题目 · 答案' },
              { number: '03', icon: CheckCircle2, title: '校对导出', note: '原图对照 · JSON' },
            ].map((step) => (
              <div key={step.number}>
                <span className="welcome-step-number">{step.number}</span>
                <step.icon size={22} />
                <strong>{step.title}</strong>
                <small>{step.note}</small>
              </div>
            ))}
          </div>
        </section>
      )}
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
      <div className="library-toolbar">
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
        <div className="view-switch" role="group" aria-label="展示方式">
          <button
            aria-label="卡片视图"
            aria-pressed={layout === 'grid'}
            onClick={() => setLayout('grid')}
          >
            <LayoutGrid size={16} />
          </button>
          <button
            aria-label="列表视图"
            aria-pressed={layout === 'list'}
            onClick={() => setLayout('list')}
          >
            <List size={17} />
          </button>
        </div>
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
        <div className={`workspace-grid ${layout === 'list' ? 'is-list' : ''}`}>
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
              <div className={`book-cover cover-${i % 3}`} aria-hidden="true">
                <BookOpen size={32} />
                <span>{w.sourceKind === 'pdf' ? 'PDF' : 'IMAGES'}</span>
                <i />
                <i />
              </div>
              <div className="card-details">
                <div className="card-top">
                  <span className="card-kind">
                    {w.sourceKind === 'pdf' ? 'PDF 教材' : '图片教材'}
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
                  <span className="card-open">
                    打开工作区 <ArrowUpRight size={15} />
                  </span>
                </div>
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
