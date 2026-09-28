import { useEffect, useState } from 'react';

type CopyState = 'idle' | 'copied' | 'unavailable';

export function useCopyFeedback(value: string | (() => string)) {
  const [state, setState] = useState<CopyState>('idle');

  useEffect(() => {
    if (state !== 'copied') return;
    const timeout = window.setTimeout(() => setState('idle'), 1200);
    return () => window.clearTimeout(timeout);
  }, [state]);

  return {
    state,
    copy: async () => {
      try {
        if (!navigator.clipboard) {
          setState('unavailable');
          return;
        }
        await navigator.clipboard.writeText(typeof value === 'function' ? value() : value);
        setState('copied');
      } catch {
        setState('unavailable');
      }
    },
  };
}
