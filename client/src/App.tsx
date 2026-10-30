import { lazy, Suspense } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  FolderOpen,
  LayoutGrid,
  Plus,
  PanelLeftClose,
  PanelLeftOpen,
  BookOpen,
  Command,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Logo, Loading } from '@/components/common';
import { Dashboard } from '@/features/workspace/components/Dashboard';
const WorkspacePage = lazy(() =>
  import('@/features/workspace/components/Workspace').then((m) => ({ default: m.WorkspacePage })),
);
import { UploadDialog } from '@/features/workspace/components/UploadDialog';
import { navigate } from '@/shared/navigation';
import { useAppShell } from '@/app/hooks/useAppShell';
export default function App() {
  const { id, upload, setUpload, collapsed, setCollapsed, health } = useAppShell();
  return (
    <div className={`app-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className="app-sidebar">
        <button className="brand-button" onClick={() => navigate()} aria-label="析页首页">
          <Logo />
        </button>
        <div className="sidebar-label">工作空间</div>
        <button className={`nav-item ${!id ? 'active' : ''}`} onClick={() => navigate()}>
          <LayoutGrid size={18} />
          <span>我的工作区</span>
          <span className="nav-count">⌘</span>
        </button>
        <button className="nav-item" onClick={() => setUpload(true)}>
          <Plus size={18} />
          <span>新建工作区</span>
        </button>
        {id && (
          <div className="nav-item active current-workspace">
            <FolderOpen size={18} />
            <span>当前教材</span>
          </div>
        )}
        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <BookOpen size={16} />
            <p>
              你的材料与整理记录
              <br />
              都保存在工作区中。
            </p>
          </div>
          <div className="local-profile">
            <span>析</span>
            <div>
              教材工作台<small>独立工作空间</small>
            </div>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="app-topbar">
          <div>
            <button
              aria-label={collapsed ? '展开导航' : '收起导航'}
              onClick={() => setCollapsed((v) => !v)}
            >
              {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            </button>
            <span className="divider" />
            <span>工作空间</span>
            <span className="breadcrumb-sep">/</span>
            <strong>{id ? '教材工作区' : '总览'}</strong>
          </div>
          <div>
            <span
              className={`connection ${health.error ? 'offline' : ''}`}
              title={health.error || '后端连接正常'}
            >
              {health.error ? <WifiOff size={13} /> : <Wifi size={13} />}
              <span>
                {health.error
                  ? '连接中断'
                  : health.loading
                    ? '连接中'
                    : health.data?.modelConfigured
                      ? '模型已配置'
                      : '模型待配置'}
              </span>
            </span>
            <Button size="sm" variant="ghost" onClick={() => setUpload(true)} className="shortcut">
              <Command size={13} />K
            </Button>
          </div>
        </header>
        <main>
          <AnimatePresence mode="wait">
            <motion.div
              key={id ?? 'dashboard'}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              <Suspense fallback={<Loading />}>
                {id ? (
                  <WorkspacePage key={id} id={id} />
                ) : (
                  <Dashboard onUpload={() => setUpload(true)} />
                )}
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <UploadDialog open={upload} onOpenChange={setUpload} onCreated={navigate} />
    </div>
  );
}
