'use client';

import { useEffect, useRef } from 'react';

export function ProgressBar({ pct, tone = 'default' }: { pct: number; tone?: 'default' | 'evb' }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.style.setProperty('--pct', `${pct}%`);
  }, [pct]);
  return (
    <div className="progress-soft" data-tone={tone}>
      <div ref={ref} className="progress-soft-fill" aria-hidden />
    </div>
  );
}
