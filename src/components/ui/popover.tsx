'use client';

import { Popover as Base } from '@base-ui/react/popover';
import { cva } from 'class-variance-authority';
import type { ReactNode } from 'react';
import { cn } from './cn';
import { panelSurface, popIn } from './dropdown-panel';
import { useOverlayPortalContainer } from './overlay-portal-container';
import { scrollArea } from './scroll-area';
import type { Tone } from './tones';
import { eyebrow } from './type-roles';

export type PopoverTone = Extract<Tone, 'neutral' | 'green'>;

/** Stay on the chosen side, shifting along it to fit, rather than flipping across the trigger. */
const KEEP_SIDE = { side: 'shift', align: 'shift', fallbackAxisSide: 'none' } as const;

const popup = cva(
  'flex w-[272px] flex-col gap-3 rounded-card border px-[14px] py-[12px] font-ui text-ui leading-snug normal-case tracking-normal outline-none ' +
    popIn,
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
  align = 'center',
  openOnHover = true,
  keepSide = false,
  onOpenChange,
  triggerClassName,
  className,
}: {
  trigger: ReactNode;
  children: ReactNode;
  label: string;
  tone?: PopoverTone;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  openOnHover?: boolean;
  /**
   * For content that grows while open: the popup shifts to fit and scrolls
   * past the viewport, so it never flips away from the pointer and closes.
   */
  keepSide?: boolean;
  onOpenChange?: (open: boolean) => void;
  triggerClassName?: string;
  className?: string;
}) {
  const overlayContainer = useOverlayPortalContainer();
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
      <Base.Portal container={overlayContainer}>
        <Base.Positioner
          side={side}
          align={align}
          sideOffset={8}
          collisionAvoidance={keepSide ? KEEP_SIDE : undefined}
          className="z-dropdown"
        >
          <Base.Popup
            aria-label={label}
            className={cn(
              popup({ tone }),
              keepSide && [scrollArea, 'max-h-[calc(100dvh-1rem)] overflow-y-auto'],
              className,
            )}
          >
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

export function PopoverRow({
  label,
  children,
  description,
  layout = 'value',
}: {
  label: string;
  children: ReactNode;
  description?: string;
  layout?: 'value' | 'description';
}) {
  if (layout === 'description') {
    return (
      <div className="flex flex-col gap-1 text-ui leading-snug">
        <span className="text-text">{label}</span>
        <div className="text-muted">{children}</div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1 text-ui leading-snug">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-muted">{label}</span>
        <span className="min-w-0 text-right tabular-nums text-text">{children}</span>
      </div>
      {description ? <p className="text-muted">{description}</p> : null}
    </div>
  );
}
