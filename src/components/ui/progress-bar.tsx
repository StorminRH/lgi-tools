'use client';

import { useEffect, useRef } from 'react';

export function ProgressBar({ pct, tone = 'default' }: { pct: number; tone?: 'default' | 'evb' }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.style.setProperty('--pct', `${pct}%`);
  }, [pct]);
  if (tone === 'evb') {
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
