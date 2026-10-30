import type { ReactNode } from 'react';
import { LockKeyhole, LogOut } from 'lucide-react';
import { Logo, Loading, ErrorNote } from '@/components/common';
import { Button } from '@/components/ui/button';
import { useAccess } from '../hooks/useAccess';
export function AccessBoundary({ children }: { children: ReactNode }) {
  const { session, username, setUsername, password, setPassword, error, action, login, logout } =
    useAccess();
  if (session?.authenticated)
    return (
      <>
        {children}
        {session.enabled && (
          <Button
            className="logout-button"
            variant="outline"
            size="sm"
            onClick={logout}
            disabled={action.busy}
          >
            <LogOut size={14} />
            退出登录
          </Button>
        )}
      </>
    );
  if (!session && !error) return <Loading />;
  return (
    <main className="login-page">
      <section className="login-card">
        <Logo />
        <div className="login-icon">
          <LockKeyhole size={22} />
        </div>
        <h1>登录教材工作台</h1>
        <p>登录后访问你的教材、提取结果和校对记录。</p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void login();
          }}
        >
          <label className="field">
            账号
            <input
              autoComplete="username"
              maxLength={100}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </label>
          <label className="field">
            密码
            <input
              type="password"
              autoComplete="current-password"
              maxLength={256}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <ErrorNote>{error || action.error}</ErrorNote>
          <Button type="submit" className="w-full" disabled={!session || action.busy}>
            {action.busy ? '登录中…' : '登录'}
          </Button>
        </form>
      </section>
    </main>
  );
}
