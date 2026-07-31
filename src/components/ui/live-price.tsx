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

/** Minimal element surface the confirm-flash scheduler mutates. */
export type ConfirmFlashHost = {
  classList: { add(token: string): void; remove(token: string): void };
  offsetWidth: number;
  addEventListener(type: 'animationend', listener: (event: AnimationEvent) => void): void;
  removeEventListener(type: 'animationend', listener: (event: AnimationEvent) => void): void;
};

/** Frame and motion hooks the confirm-flash scheduler reads (injectable for tests). */
export type ConfirmFlashScheduler = {
  requestAnimationFrame: (callback: FrameRequestCallback) => number;
  cancelAnimationFrame: (handle: number) => void;
  /** Read at arm time — true when the flash must not be applied. */
  prefersReducedMotion: () => boolean;
};

/**
 * Browser-backed confirm-flash hooks. Always call through `window` — extracting
 * `requestAnimationFrame` as a bare function throws TypeError: Illegal invocation.
 */
function browserConfirmFlashScheduler(): ConfirmFlashScheduler {
  return {
    requestAnimationFrame: (callback) => window.requestAnimationFrame(callback),
    cancelAnimationFrame: (handle) => window.cancelAnimationFrame(handle),
    prefersReducedMotion: () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  };
}

/**
 * Clears any in-flight `.price-flash`, arms a one-shot flash after two animation
 * frames, and removes the class on `animationend`. Cleanup cancels unarmed
 * frames; `isArmed` reports whether the inner frame already ran.
 */
export function scheduleConfirmFlash(
  el: ConfirmFlashHost,
  scheduler: ConfirmFlashScheduler,
): { cleanup: () => void; isArmed: () => boolean } {
  const onEnd = (event: AnimationEvent) => {
    if (event.target !== event.currentTarget) return;
    if (event.animationName !== 'price-flash') return;
    el.classList.remove('price-flash');
  };

  el.classList.remove('price-flash');
  let armed = false;
  let inner = 0;
  const outer = scheduler.requestAnimationFrame(() => {
    inner = scheduler.requestAnimationFrame(() => {
      armed = true;
      if (scheduler.prefersReducedMotion()) return;
      void el.offsetWidth;
      el.classList.add('price-flash');
      el.addEventListener('animationend', onEnd);
    });
  });

  return {
    isArmed: () => armed,
    cleanup: () => {
      scheduler.cancelAnimationFrame(outer);
      scheduler.cancelAnimationFrame(inner);
      el.removeEventListener('animationend', onEnd);
      el.classList.remove('price-flash');
    },
  };
}

/**
 * A live ISK/percent figure rendered as plain tabular text. Pending confirmation
 * visibly pulses the seed; the confirmed value lands through one brightness
 * flash and settles. No replay occurs on initial mount.
 *
 * CSP-clean: both motions are stylesheet \@keyframes (`.price-pending` /
 * `.price-flash` in globals.css). Pending is React `className`; the one-shot
 * confirm flash is applied through `scheduleConfirmFlash` after two animation
 * frames so (a) same-tick remove+add still replays and (b) React Strict Mode's
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

    // Commit the snapshot before arming. Strict Mode runs setup → cleanup →
    // setup; cleanup rolls the snapshot back only when the arm never committed
    // so the second setup still sees confirm. A real dep change after arm keeps
    // `next` so a later settled value change (including A→B→A) still confirms.
    previous.current = next;
    const flash = scheduleConfirmFlash(el, browserConfirmFlashScheduler());
    return () => {
      flash.cleanup();
      if (!flash.isArmed()) previous.current = prior;
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
