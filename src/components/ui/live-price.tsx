'use client';

import { useEffect, useRef } from 'react';
import { cn } from './cn';

export type LivePriceSnapshot = { value: string; pending: boolean };

export function livePriceTransition(
  previous: LivePriceSnapshot | null,
  next: LivePriceSnapshot,
): 'none' | 'confirm' {
  if (previous === null || next.pending) return 'none';
  return previous.pending || previous.value !== next.value ? 'confirm' : 'none';
}

export type ConfirmFlashHost = {
  classList: { add(token: string): void; remove(token: string): void };
  offsetWidth: number;
  addEventListener(type: 'animationend', listener: (event: AnimationEvent) => void): void;
  removeEventListener(type: 'animationend', listener: (event: AnimationEvent) => void): void;
};

export type ConfirmFlashScheduler = {
  requestAnimationFrame: (callback: FrameRequestCallback) => number;
  cancelAnimationFrame: (handle: number) => void;

  prefersReducedMotion: () => boolean;
};

function browserConfirmFlashScheduler(): ConfirmFlashScheduler {
  return {
    requestAnimationFrame: (callback) => window.requestAnimationFrame(callback),
    cancelAnimationFrame: (handle) => window.cancelAnimationFrame(handle),
    prefersReducedMotion: () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  };
}

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
