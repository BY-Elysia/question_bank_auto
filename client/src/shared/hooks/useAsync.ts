import { useCallback, useEffect, useRef, useState } from 'react';
export type PollInterval<T> = number | ((data: T | undefined) => number);

export function useResource<T>(
  loadResource: (signal: AbortSignal) => Promise<T>,
  interval: PollInterval<T> = 0,
) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const refreshRef = useRef<() => void>(() => {});
  const refresh = useCallback(() => refreshRef.current(), []);
  useEffect(() => {
    let disposed = false,
      running = false,
      pending = false,
      failures = 0;
    let latest: T | undefined;
    let controller: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const available = () => !disposed && document.visibilityState !== 'hidden' && navigator.onLine;
    const delay = () => (typeof interval === 'function' ? interval(latest) : interval);
    const load = async () => {
      clearTimeout(timer);
      if (!available()) {
        pending = true;
        return;
      }
      if (running) {
        pending = true;
        return;
      }
      running = true;
      pending = false;
      controller = new AbortController();
      const signal = controller.signal;
      try {
        const result = await loadResource(signal);
        if (!disposed && !signal.aborted && !pending) {
          latest = result;
          failures = 0;
          setData(result);
          setError('');
        }
      } catch (e) {
        if (!disposed && !signal.aborted && !pending) {
          failures++;
          setError(e instanceof Error ? e.message : '连接失败');
        }
      } finally {
        running = false;
        if (!disposed && !signal.aborted && !pending) setLoading(false);
        if (available()) {
          if (pending) void load();
          else if (delay() > 0) {
            const wait = failures
              ? Math.min(60000, Math.max(2000, delay()) * 2 ** Math.min(failures - 1, 5))
              : delay();
            timer = setTimeout(load, wait);
          }
        }
      }
    };
    // Coalesce refreshes while a GET is in flight; after a write, discard that
    // possibly stale response and run just one fresh read, without overlap.
    refreshRef.current = () => {
      void load();
    };
    const availabilityChanged = () => {
      clearTimeout(timer);
      if (available()) {
        if (!running || controller?.signal.aborted) void load();
      } else {
        pending = true;
        controller?.abort();
      }
    };
    document.addEventListener('visibilitychange', availabilityChanged);
    window.addEventListener('online', availabilityChanged);
    window.addEventListener('offline', availabilityChanged);
    void load();
    return () => {
      disposed = true;
      controller?.abort();
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', availabilityChanged);
      window.removeEventListener('online', availabilityChanged);
      window.removeEventListener('offline', availabilityChanged);
      refreshRef.current = () => {};
    };
  }, [loadResource, interval]);
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
