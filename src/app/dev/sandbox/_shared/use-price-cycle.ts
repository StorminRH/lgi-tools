'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// The pending → settle lifecycle every price-animation variant shares, so they
// all demo the same "confirming a live price" moment. A variant reads `phase`
// (and, for the value-tweening ones, `useRafProgress`) and renders accordingly:
//   idle    — holding the last-known figure
//   pending — confirming live (obscured / shimmering / scrambling)
//   settle  — the confirmed figure just landed; play the flourish, then hold
// `trigger()` runs one cycle; `autoLoop` re-runs it on a gentle cadence so the
// gallery moves without the operator clicking every card.

export type PricePhase = 'idle' | 'pending' | 'settle';

interface CycleOptions {
  pendingMs?: number;
  settleMs?: number;
  autoLoop?: boolean;
  loopGapMs?: number;
}

export function usePriceCycle({
  pendingMs = 1100,
  settleMs = 750,
  autoLoop = false,
  loopGapMs = 1500,
}: CycleOptions = {}) {
  const [phase, setPhase] = useState<PricePhase>('idle');
  // Latches true once a cycle reaches settle, so a figure holds the confirmed
  // value afterwards; reset at the start of each new cycle. Set from the timer
  // callbacks (not an effect body), so showing the held value needs no effect.
  const [settled, setSettled] = useState(false);
  // A counter that bumps each time a fresh cycle begins — variants key their
  // internal rAF/scramble runs off it so a re-trigger restarts cleanly.
  const [runId, setRunId] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const trigger = useCallback(() => {
    clearTimers();
    setRunId((n) => n + 1);
    setSettled(false);
    setPhase('pending');
    timers.current.push(
      setTimeout(() => {
        setPhase('settle');
        setSettled(true);
      }, pendingMs),
      setTimeout(() => setPhase('idle'), pendingMs + settleMs),
    );
  }, [clearTimers, pendingMs, settleMs]);

  useEffect(() => {
    if (!autoLoop) return;
    const period = pendingMs + settleMs + loopGapMs;
    // Kick off via a 0ms timer (not a synchronous call) so the first cycle's
    // state update lands in an async callback, then repeat on the period.
    const kick = setTimeout(trigger, 0);
    const interval = setInterval(trigger, period);
    return () => {
      clearTimeout(kick);
      clearInterval(interval);
      clearTimers();
    };
    // trigger is stable across these deps; re-arm only when timing/loop changes.
  }, [autoLoop, pendingMs, settleMs, loopGapMs, trigger, clearTimers]);

  useEffect(() => clearTimers, [clearTimers]);

  return {
    phase,
    runId,
    settled,
    trigger,
    pending: phase === 'pending',
    settling: phase === 'settle',
  };
}

// Linear 0→1 progress over `ms`, restarted whenever `runKey` changes and `active`
// is true. Used by the variants that tween a numeric value (count-up) or lock a
// scramble. Pure rAF + state — no inline styles, CSP-clean.
export function useRafProgress(active: boolean, ms: number, runKey: number): number {
  const [p, setP] = useState(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      startRef.current = null;
      return;
    }
    let raf = 0;
    startRef.current = null;
    const step = (t: number) => {
      if (startRef.current === null) startRef.current = t;
      const elapsed = t - startRef.current;
      const next = Math.min(1, elapsed / ms);
      setP(next);
      if (next < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [active, ms, runKey]);

  // Derive the inactive value rather than resetting state in the effect.
  return active ? p : 0;
}
