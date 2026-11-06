import { useState, useEffect } from 'react';
import { useResource } from '@/shared/hooks/useAsync';
import { getHealth } from '../api/health';
export function useAppShell() {
  const [hash, setHash] = useState(location.hash),
    [upload, setUpload] = useState(false),
    [collapsed, setCollapsed] = useState(false),
    [effects, setEffects] = useState(() => {
      try {
        return localStorage.getItem('textbook-effects') !== 'off';
      } catch {
        return true;
      }
    });
  const toggleEffects = () =>
    setEffects((current) => {
      const next = !current;
      try {
        localStorage.setItem('textbook-effects', next ? 'on' : 'off');
      } catch {}
      return next;
    });
  const health = useResource(getHealth, 60000);
  useEffect(() => {
    window.addEventListener('model-configured', health.refresh);
    return () => window.removeEventListener('model-configured', health.refresh);
  }, [health.refresh]);
  useEffect(() => {
    const route = () => setHash(location.hash);
    window.addEventListener('hashchange', route);
    return () => window.removeEventListener('hashchange', route);
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setUpload(true);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  const match = hash.match(/^#\/workspace\/([a-zA-Z0-9_-]{1,100})$/),
    id = match?.[1];
  return {
    id,
    section:
      hash === '#/assistant/settings'
        ? 'assistant-settings'
        : hash === '#/profile'
          ? 'profile'
          : hash === '#/assistant'
            ? 'assistant'
            : 'workspaces',
    upload,
    setUpload,
    collapsed,
    setCollapsed,
    health,
    effects,
    toggleEffects,
  };
}
