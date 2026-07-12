'use client';

import { useEffect, useRef } from 'react';

/**
 * Thin horizontal bar for "value relative to max" displays (telemetry charts).
 * The fill width is set as a `--pct` custom property via the CSSOM after mount
 * rather than an inline `style` attribute (house style — keeps styling off the
 * element). The `.progress-fill` rule (globals.css) reads `--pct`, defaulting to
 * 0% until the effect runs, so the bar grows in on hydration.
 */
export function ProgressBar({ pct, tone = 'default' }: { pct: number; tone?: 'default' | 'evb' }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.style.setProperty('--pct', `${pct}%`);
  }, [pct]);
  if (tone === 'evb') {
    // The EVE-industry-blue fill (gradient + glow) reused from the active-jobs
    // bar (`.industry-bar-fill`), a touch taller than the default telemetry bar.
    return (
      <div className="h-[6px] overflow-hidden rounded-ctl border border-evb-border bg-evb-track">
        <div ref={ref} className="industry-bar-fill" aria-hidden />
      </div>
    );
  }
  return (
    <div className="h-[4px] bg-progress-track border border-progress-track-border">
      <div ref={ref} className="progress-fill h-full bg-progress-fill" aria-hidden />
    </div>
  );
}
