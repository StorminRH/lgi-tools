'use client';

import { useEffect, useRef } from 'react';

/**
 * Thin horizontal bar for "value relative to max" displays (telemetry charts).
 * The fill width is set as a `--pct` custom property via the CSSOM after mount
 * rather than an inline `style` attribute — the production CSP's strict
 * `style-src` drops inline `style="…"` attributes, but JS-applied styles aren't
 * gated. The `.progress-fill` rule (globals.css) reads `--pct`, defaulting to
 * 0% until the effect runs, so the bar grows in on hydration.
 */
export function ProgressBar({ pct }: { pct: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.style.setProperty('--pct', `${pct}%`);
  }, [pct]);
  return (
    <div className="h-[4px] bg-[#0a1018] border border-[#101820]">
      <div ref={ref} className="progress-fill h-full bg-[#10283a]" aria-hidden />
    </div>
  );
}
