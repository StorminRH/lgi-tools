import type { ReactNode } from 'react';
import { cva } from 'class-variance-authority';
import { cn } from './cn';
import type { Tone } from './tones';
import { eyebrow } from './type-roles';

const gateVariants = cva('font-ui border rounded-card px-3.5 py-3.5 flex flex-col gap-2.5', {
  variants: {

    tone: {
      neutral: 'bg-surface-raised text-text border-border-idle',
      green: 'bg-pill-green-bg text-isk border-isk-dim',
      'green-strong': 'bg-pill-green-bg text-tone-green-strong border-isk-dim',
      orange: 'bg-pill-orange-bg text-tone-orange border-pill-orange-border',
      'orange-soft': 'bg-pill-orange-soft-bg text-tone-orange-soft border-pill-orange-soft-border',
      red: 'bg-pill-red-bg text-pill-red-text border-pill-red-border',
      'red-soft': 'bg-pill-red-soft-bg text-tone-red-soft border-pill-red-soft-border',
      magenta: 'bg-pill-magenta-bg text-tone-magenta border-pill-magenta-border',
      purple: 'bg-pill-purple-bg text-tone-purple border-pill-purple-border',
      yellow: 'bg-pill-yellow-bg text-tone-yellow border-pill-yellow-border',
      teal: 'bg-pill-teal-bg text-tone-teal border-pill-teal-border',
      blue: 'bg-surface-sunk text-tone-blue border-pill-blue-border',
    } satisfies Record<Tone, string>,
  },
  defaultVariants: { tone: 'orange' },
});

export function AccessGate({
  blocked,
  reason,
  action,
  title = 'Access needed',
  tone = 'orange',
  className,
  children,
}: {

  blocked: boolean;

  reason: ReactNode;

  action: ReactNode;

  title?: ReactNode;

  tone?: Tone;

  className?: string;
  children: ReactNode;
}) {
  if (!blocked) return <>{children}</>;

  return (
    <div className={cn(gateVariants({ tone }), className)}>
      <div className={eyebrow({ tone: 'inherit', weight: 'semibold' })}>{title}</div>

      <p className="text-ui text-text leading-[1.55]">{reason}</p>

      <div className="flex items-center gap-2">{action}</div>

    </div>

  );
}
