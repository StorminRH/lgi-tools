import { useEffect, useState } from 'react';

/**
 * Wall-clock epoch milliseconds, refreshed every `intervalMs` while `active`.
 * The first render reads `Date.now()`. `active` is a flag or a predicate of
 * the current value, checked on every render. While it is off the clock keeps
 * its last value, and after it turns on again the next refresh comes a full
 * `intervalMs` later.
 */
export function useNow(intervalMs: number, active: boolean | ((now: number) => boolean) = true): number {
  const [now, setNow] = useState(() => Date.now());
  const on = typeof active === 'function' ? active(now) : active;
  useEffect(() => {
    if (!on) return;
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [on, intervalMs]);
  return now;
}
