import type { ReactNode } from 'react';
import { cva } from 'class-variance-authority';
import { cn } from './cn';
import type { Tone } from './tones';

// Domain-agnostic access gate. Renders its children when access is granted;
// when blocked it replaces JUST this element with a short notice (a title + a
// reason line) and a grant action — rendering none of the gated children, so
// the withheld data never reaches the page.
//
// Deliberately dumb: the blocked decision, the reason, and the grant control
// all arrive as props. The gate never computes whether access is granted and
// never imports scope-health or any feature's scope set — that derivation is an
// app-layer / composition concern (e.g. a page deriving per-character scope
// health and passing the result down). Knowing only `blocked` keeps this a
// primitive any future scoped surface (assets, owned blueprints, corp) can
// reuse with different data.
const gateVariants = cva('font-mono border rounded-[6px] px-3.5 py-3.5 flex flex-col gap-2.5', {
  variants: {
    // Mirrors pill.tsx's tone → token mapping so the palette has one home and no
    // new colour tokens are introduced. The tone drives the title (inherited
    // text colour) and the panel accent; the reason body overrides to neutral.
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
  // Whether access is currently withheld. Computed upstream (e.g. from a
  // character's scope health) and passed in — the gate never derives it.
  blocked: boolean;
  // Why this access is needed, in plain words (the explain-then-consent line).
  reason: ReactNode;
  // The grant control, composed upstream (e.g. the relink button).
  action: ReactNode;
  // The block heading. Abstract default; callers may override.
  title?: ReactNode;
  // Abstract tone for the block accent.
  tone?: Tone;
  // Positioning override for the block panel (e.g. inset margins when nested in
  // a card). Ignored when access is granted — only children render then.
  className?: string;
  children: ReactNode;
}) {
  if (!blocked) return <>{children}</>;

  return (
    <div className={cn(gateVariants({ tone }), className)}>
      <div className="text-label font-semibold tracking-[0.12em] uppercase">{title}</div>
      <p className="text-ui text-text leading-[1.55]">{reason}</p>
      <div className="flex items-center gap-2">{action}</div>
    </div>
  );
}
