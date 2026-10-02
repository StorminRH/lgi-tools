'use client';

import { useEffect, useRef } from 'react';
import type { Tone } from './tones';

export type ProgressTone = 'default' | 'evb' | Extract<Tone, 'green' | 'blue' | 'orange' | 'red' | 'neutral'>;

export function ProgressBar({ pct, tone = 'default' }: { pct: number; tone?: ProgressTone }) {
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
