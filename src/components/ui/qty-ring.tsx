import { cva } from 'class-variance-authority';
import type { ReactNode } from 'react';
import { cn } from './cn';

const RADIUS = 17;

export type QtyRingTone = 'neutral' | 'isk';

export function ringDash(
  progress: number,
  radius: number,
): { dash: string; circumference: number } {
  const circumference = 2 * Math.PI * radius;
  const p = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  return { dash: `${p * circumference} ${circumference}`, circumference };
}

const arc = cva('fill-none', {
  variants: {
    tone: { neutral: 'stroke-muted', isk: 'stroke-isk' } satisfies Record<QtyRingTone, string>,
  },
  defaultVariants: { tone: 'neutral' },
});

export function QtyRing({
  progress,
  tone = 'neutral',
  label,
  className,
  children,
}: {
  progress: number;
  tone?: QtyRingTone;
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  const { dash } = ringDash(progress, RADIUS);
  return (
    <span
      className={cn('relative inline-flex shrink-0 items-center justify-center', className)}
      role={label ? 'img' : undefined}
      aria-label={label}
    >
      <svg viewBox="0 0 40 40" className="h-full w-full -rotate-90 -scale-y-100" aria-hidden>
        <circle cx="20" cy="20" r={RADIUS} className="fill-none stroke-border-soft" strokeWidth={2.5} />
        {progress > 0 && (
          <circle
            cx="20"
            cy="20"
            r={RADIUS}
            className={arc({ tone })}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeDasharray={dash}
          />
        )}
      </svg>
      <span className="absolute inset-0 flex items-center justify-center">{children}</span>
    </span>
  );
}
