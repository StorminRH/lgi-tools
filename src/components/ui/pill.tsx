import type { ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './cn';
import type { PillTone } from './tones';

export type { PillTone };

// Two sizes: 'sm' (default) matches the dense wireframe card-meta spec —
// 9px / 600 / 4px tracking. 'md' is the clickable-affordance size used by
// the FilterBar and any other interactive pill consumer that needs more
// click target + readability.
const pillVariants = cva(
  'font-mono font-semibold rounded-[2px] border inline-flex items-center',
  {
    variants: {
      tone: {
        neutral:      'bg-[#161e28] text-muted border-[#1e2c3a]',
        green:        'bg-[#0f2218] text-[#3dd68c] border-[#1a3a28]',
        'green-strong':'bg-[#0f2218] text-[#44dd99] border-[#1a3a28]',
        orange:       'bg-[#1f1508] text-[#d68c3d] border-[#3a2510]',
        'orange-soft':'bg-[#1a0f0a] text-[#cc7733] border-[#3a2010]',
        red:          'bg-[#1a0a0a] text-[#dd4444] border-[#3a1010]',
        'red-soft':   'bg-[#1a1010] text-[#cc5555] border-[#3a1515]',
        magenta:      'bg-[#1a0a1a] text-[#cc55cc] border-[#3a103a]',
        purple:       'bg-[#100a1a] text-[#aa55ff] border-[#2a1040]',
        yellow:       'bg-[#1a1a0a] text-[#ccaa33] border-[#332e10]',
        teal:         'bg-[#0a1a14] text-[#33cc88] border-[#104a2a]',
        blue:         'bg-[#0a101a] text-[#3399cc] border-[#10283a]',
      } satisfies Record<PillTone, string>,
      size: {
        sm: 'text-[9px] px-[6px] py-[2px] tracking-[0.04em]',
        md: 'text-[11px] px-[9px] py-[3px] tracking-[0.05em]',
      },
    },
    defaultVariants: { tone: 'neutral', size: 'sm' },
  },
);

// Inferred from the cva — never a separately hand-maintained union.
export type PillSize = NonNullable<VariantProps<typeof pillVariants>['size']>;

export function Pill({
  tone,
  size,
  children,
  className,
}: VariantProps<typeof pillVariants> & {
  children: ReactNode;
  className?: string;
}) {
  return <span className={cn(pillVariants({ tone, size }), className)}>{children}</span>;
}
