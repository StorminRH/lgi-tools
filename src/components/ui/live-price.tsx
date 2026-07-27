'use client';

import { useEffect, useRef } from 'react';
import { cn } from './cn';

type LivePriceSnapshot = { value: string; pending: boolean };

/**
 * Classifies a live-price commit without depending on the DOM so the first-mount and confirmation
 * contracts remain explicit.
 */
export function livePriceTransition(
  previous: LivePriceSnapshot | null,
  next: LivePriceSnapshot,
): 'none' | 'confirm' {
  if (previous === null || next.pending) return 'none';
  return previous.pending || previous.value !== next.value ? 'confirm' : 'none';
}

/**
 * A live ISK/percent figure rendered as plain tabular text. Pending confirmation
 * visibly pulses the seed; the confirmed value lands through a bright green
 * signal burst and short scale bounce. No replay occurs on initial mount.
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
  pending = false,
  className,
}: {
  value: string;
  pending?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const previous = useRef<LivePriceSnapshot | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const next = { value, pending };
    const transition = livePriceTransition(previous.current, next);
    previous.current = next;
    if (transition !== 'confirm') return;
    el.classList.remove('price-flash');
    void el.offsetWidth;
    el.classList.add('price-flash');
  }, [pending, value]);

  return (
    <span
      ref={ref}
      data-price-state={pending ? 'pending' : 'settled'}
      aria-busy={pending || undefined}
      className={cn('price-live font-data tabular-nums', pending && 'price-pending', className)}
    >
      {value}
    </span>
  );
}
