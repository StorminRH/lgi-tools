import { cva } from 'class-variance-authority';
import type { ReactNode } from 'react';
import { cn } from './cn';

// A circular progress ring with centred content (3.7.5.7). A faint full-circle track
// with a progress arc over it; `progress` (0–1) fills the arc clockwise from 12
// o'clock. Built for the build-plan QTY ring — for now callers pass progress 0 (an
// empty track + the needed quantity in the centre), a placeholder for the future
// asset-acquisition feature that will fill it as items are gathered. SVG geometry +
// token strokes only (house style); sized square by `className`.

// The arc circle radius inside the 0–40 viewBox; the track + arc share it.
const RADIUS = 17;

export type QtyRingTone = 'neutral' | 'evb';

// Pure: the stroke-dasharray ("<filled> <circumference>") + circumference for a
// progress fraction at a given radius. Progress is clamped to 0–1 (non-finite → 0).
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
    tone: { neutral: 'stroke-muted', evb: 'stroke-evb-bright' } satisfies Record<QtyRingTone, string>,
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
  // 0–1; 0 shows just the track (the empty-ring placeholder).
  progress: number;
  tone?: QtyRingTone;
  // Accessible name (the ring + its centred figure read as one image).
  label?: string;
  // Square sizing lives at the call site.
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
      {/* Rotated −90° so the arc starts at the top. */}
      <svg viewBox="0 0 40 40" className="h-full w-full -rotate-90" aria-hidden>
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
