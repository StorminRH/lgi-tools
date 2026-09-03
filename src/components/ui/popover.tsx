'use client';

import { Popover as Base } from '@base-ui/react/popover';
import { cva } from 'class-variance-authority';
import type { ReactNode } from 'react';
import { cn } from './cn';
import { panelSurface } from './dropdown-panel';
import type { Tone } from './tones';
import { eyebrow } from './type-roles';

export type PopoverTone = Extract<Tone, 'neutral' | 'green'>;

const popup = cva(
  'flex w-[272px] flex-col gap-3 rounded-card border px-[14px] py-[12px] text-ui normal-case tracking-normal outline-none ' +
    'origin-[var(--transform-origin)] transition-[opacity,transform] duration-fast motion-reduce:transition-none ' +
    'data-[starting-style]:scale-95 data-[starting-style]:opacity-0 ' +
    'data-[ending-style]:scale-95 data-[ending-style]:opacity-0',
  {
    variants: {
      tone: {
        neutral: `${panelSurface} text-text`,
        green: 'glass-panel text-text border-isk-dim shadow-popover-green',
      } satisfies Record<PopoverTone, string>,
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export function Popover({
  trigger,
  children,
  label,
  tone = 'neutral',
  side = 'bottom',
  openOnHover = true,
  onOpenChange,
  triggerClassName,
  className,
}: {
  trigger: ReactNode;
  children: ReactNode;
  label: string;
  tone?: PopoverTone;
  side?: 'top' | 'bottom' | 'left' | 'right';
  openOnHover?: boolean;
  onOpenChange?: (open: boolean) => void;
  triggerClassName?: string;
  className?: string;
}) {
  return (
    <Base.Root modal={false} onOpenChange={onOpenChange}>
      <Base.Trigger
        type="button"
        aria-label={label}
        openOnHover={openOnHover}
        delay={0}
        closeDelay={90}
        className={triggerClassName}
      >
        {trigger}
      </Base.Trigger>
      <Base.Portal>
        <Base.Positioner side={side} sideOffset={8} className="z-dropdown">
          <Base.Popup aria-label={label} className={cn(popup({ tone }), className)}>
            {children}
          </Base.Popup>
        </Base.Positioner>
      </Base.Portal>
    </Base.Root>
  );
}

export function PopoverHeading({ children }: { children: ReactNode }) {
  return (
    <div className={eyebrow({ tone: 'isk', weight: 'semibold', emphasis: 'strong' })}>
      {children}
    </div>
  );
}

export function PopoverRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <p className="font-ui text-body leading-snug text-muted">
      <span className="font-semibold text-text">{label}</span> —{' '}
      <span className="font-data">{children}</span>
    </p>
  );
}
