import { useEffect, useState } from 'react';
import { useAction } from '@/shared/hooks/useAsync';
import { accessApi } from '../api/access';
export function useAccess() {
  const [session, setSession] = useState<{ enabled: boolean; authenticated: boolean }>();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const action = useAction();
  useEffect(() => {
    let active = true;
    accessApi
      .session()
      .then((value) => {
        if (active) setSession(value);
      })
      .catch(() => {
        if (active) setError('连接失败，请刷新重试');
      });
    const expired = () => setSession({ enabled: true, authenticated: false });
    window.addEventListener('access-expired', expired);
    return () => {
      active = false;
      window.removeEventListener('access-expired', expired);
    };
  }, []);
  const login = () =>
    action.run(async () => {
      await accessApi.login(username, password);
      setPassword('');
      setSession({ enabled: true, authenticated: true });
    });
  const logout = () =>
    action.run(async () => {
      await accessApi.logout();
      setSession({ enabled: true, authenticated: false });
    });
  return { session, username, setUsername, password, setPassword, error, action, login, logout };
}
