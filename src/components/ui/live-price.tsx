'use client';

import { useEffect, useRef } from 'react';
import { cn } from './cn';

/**
 * A live ISK/percent figure rendered as plain tabular text. When the value
 * changes (a live price lands), a brief brightness pulse "flashes the new value
 * in" — the quieter successor to the odometer's dim + digit-slide. No pulse on
 * the initial mount; only genuine value changes flash.
 *
 * CSP-clean: the pulse is a stylesheet \@keyframes (`.price-flash` in
 * globals.css) applied via className and restarted on each change with the
 * remove → reflow → re-add trick (without the forced reflow the browser
 * coalesces remove+add and the animation never replays). No inline style.
 *
 * Accessible: the figure is a single plain text node, so a screen reader reads
 * "123.4M ISK" directly, once. (The odometer needed an sr-only value + an
 * aria-hidden digit ladder only because its visual was ten stacked 0–9 strips;
 * this has no decorative DOM, so it needs neither.) Deliberately no aria-live —
 * a refresh must not announce on every tick.
 */
export function LivePrice({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // First commit: record the value, don't flash (figures shouldn't pulse on
    // load/navigation — the pulse is reserved for genuine value changes).
    if (prev.current === null) {
      prev.current = value;
      return;
    }
    if (prev.current === value) return;
    prev.current = value;
    el.classList.remove('price-flash');
    void el.offsetWidth;
    el.classList.add('price-flash');
  }, [value]);

  return (
    <span ref={ref} className={cn('tabular-nums', className)}>
      {value}
    </span>
  );
}
