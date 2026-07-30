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
 * visibly pulses the seed; the confirmed value lands through one brightness
 * flash and settles. No replay occurs on initial mount.
 *
 * CSP-clean: both motions are stylesheet \@keyframes (`.price-pending` /
 * `.price-flash` in globals.css). Pending is React `className`; the one-shot
 * confirm flash is applied through `classList` after two animation frames so
 * (a) same-tick remove+add still replays and (b) React Strict Mode's
 * setup→cleanup→setup can cancel an unarmed flash and reclassify the confirm.
 * `animationend` removes `.price-flash` so it cannot linger. No inline style.
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
    const prior = previous.current;
    const transition = livePriceTransition(prior, next);

    if (pending || transition !== 'confirm') {
      previous.current = next;
      el.classList.remove('price-flash');
      return;
    }

    previous.current = next;

    const onEnd = (event: AnimationEvent) => {
      if (event.target !== el || event.animationName !== 'price-flash') return;
      el.classList.remove('price-flash');
    };

    // Clear any in-flight flash synchronously, then arm on the following frames
    // so Strict Mode cleanup can cancel before the class is applied. Only roll
    // the snapshot back when the arm never committed — a real dep change after
    // arm must keep `next` so a later settled value change still confirms.
    el.classList.remove('price-flash');
    let armed = false;
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        armed = true;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        void el.offsetWidth;
        el.classList.add('price-flash');
        el.addEventListener('animationend', onEnd);
      });
    });

    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
      el.removeEventListener('animationend', onEnd);
      el.classList.remove('price-flash');
      if (!armed) previous.current = prior;
    };
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
