'use client';

import type { Tone } from './tones';
import { useStyleProperty } from './use-style-ref';

export type ProgressTone = 'default' | 'evb' | Extract<Tone, 'green' | 'blue' | 'orange' | 'red' | 'neutral'>;

export function ProgressBar({ pct, tone = 'default' }: { pct: number; tone?: ProgressTone }) {
  const fillRef = useStyleProperty<HTMLDivElement>('--pct', `${pct}%`);
  return (
    <div className="progress-soft" data-tone={tone}>
      <div ref={fillRef} className="progress-soft-fill" aria-hidden />
    </div>
  );
}
