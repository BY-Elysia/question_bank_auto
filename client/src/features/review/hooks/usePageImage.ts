import { useEffect, useState } from 'react';
import type { WorkspaceView } from '@/shared/contracts';

export function usePageImage(current: WorkspaceView['pages'][number], nextUrl?: string) {
  const [original, setOriginal] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [baseAttempt, setBaseAttempt] = useState(0);
  const baseUrl = original ? current.imageUrl : current.previewUrl || current.imageUrl;

  useEffect(() => {
    if (!ready || !nextUrl) return;
    const connection = (
      navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
    ).connection;
    if (connection?.saveData || connection?.effectiveType?.includes('2g')) return;
    // At most one adjacent preview, and only after the visible page has loaded.
    const image = new Image();
    image.decoding = 'async';
    image.fetchPriority = 'low';
    image.src = nextUrl;
    return () => {
      image.src = '';
    };
  }, [ready, nextUrl]);

  return {
    baseUrl,
    ready,
    failed,
    baseAttempt,
    loaded: () => setReady(true),
    error: () => {
      if (!original && baseUrl !== current.imageUrl) setOriginal(true);
      else setFailed(true);
    },
    retryBase: () => {
      setFailed(false);
      setReady(false);
      setBaseAttempt((value) => value + 1);
    },
  };
}
