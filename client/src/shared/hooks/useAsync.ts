import { useCallback, useEffect, useRef, useState } from 'react';
export function useResource<T>(loadResource: (signal: AbortSignal) => Promise<T>, interval = 0) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const result = await loadResource(abort.signal);
        if (!abort.signal.aborted) {
          setData(result);
          setError('');
        }
      } catch (e) {
        if (!abort.signal.aborted) setError(e instanceof Error ? e.message : '连接失败');
      } finally {
        if (!abort.signal.aborted) {
          setLoading(false);
          if (interval) timer = setTimeout(load, interval);
        }
      }
    };
    void load();
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [loadResource, interval, version]);
  return { data, error, loading, refresh };
}
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  async function run(action: () => Promise<unknown>) {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await action();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败');
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return { busy, error, run, setError };
}
