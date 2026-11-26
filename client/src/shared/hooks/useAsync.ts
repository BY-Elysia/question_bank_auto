import { useCallback, useEffect, useRef, useState } from 'react';
export type PollInterval<T> = number | ((data: T | undefined) => number);

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const arrB = b as unknown[];
    if (a.length !== arrB.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], arrB[i])) return false;
    return true;
  }
  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;
  const keysA = Object.keys(objA);
  if (keysA.length !== Object.keys(objB).length) return false;
  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(objB, key) || !deepEqual(objA[key], objB[key]))
      return false;
  }
  return true;
}

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
    setData(undefined);
    setError('');
    setLoading(true);
    let disposed = false,
      running = false,
      pending = false,
      failures = 0,
      seq = 0,
      hasLatest = false;
    let latest: T | undefined;
    let controller: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const available = () => !disposed && document.visibilityState !== 'hidden' && navigator.onLine;
    const delay = () => (typeof interval === 'function' ? interval(latest) : interval);
    const load = async () => {
      clearTimeout(timer);
      if (!available()) {
        pending = true;
        if (!navigator.onLine && !hasLatest) {
          setError('当前处于离线状态，请检查网络连接');
          setLoading(false);
        }
        return;
      }
      if (running && !controller?.signal.aborted) {
        pending = true;
        return;
      }
      const reqSeq = ++seq;
      running = true;
      pending = false;
      controller = new AbortController();
      const signal = controller.signal;
      try {
        const result = await loadResource(signal);
        if (!disposed && reqSeq === seq && !signal.aborted && !pending) {
          const changed = !hasLatest || !deepEqual(latest, result);
          latest = result;
          hasLatest = true;
          failures = 0;
          // Polling often returns identical documents; preserve object identity so
          // math previews and source overlays do not render again on every poll.
          if (changed) setData(result);
          setError('');
        }
      } catch (e) {
        if (!disposed && reqSeq === seq && !signal.aborted && !pending) {
          failures++;
          setError(e instanceof Error ? e.message : '连接失败');
        }
      } finally {
        if (reqSeq === seq) {
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
        if (!navigator.onLine && !hasLatest) {
          setError('当前处于离线状态，请检查网络连接');
          setLoading(false);
        }
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
