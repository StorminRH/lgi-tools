'use client';

import { Dialog as Base } from '@base-ui/react/dialog';
import {
  useState,
  type ComponentProps,
  type ReactNode,
  type RefObject,
} from 'react';
import { Button } from './button';
import { cn } from './cn';
import { CloseIcon } from './icons';
import { OverlayPortalContainerProvider } from './overlay-portal-container';
import { displayTitle } from './type-roles';

export type DialogFocusTarget = ComponentProps<typeof Base.Popup>['finalFocus'];

const popup =
  'fixed left-1/2 top-1/2 z-overlay -translate-x-1/2 -translate-y-1/2 outline-none ' +
  'transition-[scale,opacity] duration-panel ease-panel ' +
  'data-[starting-style]:scale-[0.92] data-[starting-style]:opacity-0 ' +
  'data-[ending-style]:scale-[0.92] data-[ending-style]:opacity-0 motion-reduce:transition-none ' +
  'glass-dense glass-lit border border-border text-text font-ui rounded-panel shadow-dd';

export function Dialog({
  open,
  onOpenChange,
  labelledBy,
  children,
  className,
  finalFocus,
  initialFocus,
  keepMounted = false,
}: {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  labelledBy?: string;
  children: ReactNode;
  className?: string;
  finalFocus?: DialogFocusTarget;
  initialFocus?: RefObject<HTMLElement | null>;
  keepMounted?: boolean;
}) {
  const [popupEl, setPopupEl] = useState<HTMLDivElement | null>(null);

  return (
    <Base.Root open={open} onOpenChange={(next) => onOpenChange?.(next)} modal>
      <Base.Portal keepMounted={keepMounted}>
        <Base.Backdrop className="fixed inset-0 z-overlay bg-black/60 backdrop-blur-sm transition-opacity duration-panel data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 motion-reduce:transition-none" />
        <Base.Popup
          ref={setPopupEl}
          {...(labelledBy !== undefined ? { 'aria-labelledby': labelledBy } : {})}
          finalFocus={finalFocus}
          initialFocus={initialFocus}
          className={cn(popup, className)}
        >
          <OverlayPortalContainerProvider container={popupEl}>
            {children}
          </OverlayPortalContainerProvider>
        </Base.Popup>
      </Base.Portal>
    </Base.Root>
  );
}

export const DialogClose = Base.Close;
export const DialogTitle = Base.Title;
export const DialogDescription = Base.Description;

/** The dialog's × button, a ghost Button that closes through Base UI. */
export function DialogCloseButton({
  label,
  disabled,
  className,
}: {
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <DialogClose
      render={<Button variant="ghost" size="sm" className={className} />}
      aria-label={label}
      disabled={disabled}
    >
      <CloseIcon size={14} />
    </DialogClose>
  );
}

/**
 * The standard title bar: a display title, an optional description, and a ×
 * when `closeLabel` names it. ConfirmDialog leaves the × out.
 */
export function DialogHeader({
  titleId,
  title,
  description,
  closeLabel,
  closeDisabled,
  size = 'h2',
  tone = 'name',
  className,
}: {
  titleId: string;
  title: ReactNode;
  description?: ReactNode;
  closeLabel?: string;
  closeDisabled?: boolean;
  size?: 'h2' | 'h3';
  tone?: 'name' | 'danger';
  className?: string;
}) {
  return (
    <header
      className={cn(
        'flex shrink-0 items-start justify-between gap-3 border-b border-border-soft px-4 py-3',
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <DialogTitle id={titleId} className={displayTitle({ size, tone, wrap: true })}>
          {title}
        </DialogTitle>
        {description ? (
          <DialogDescription className="font-ui text-ui text-muted">
            {description}
          </DialogDescription>
        ) : null}
      </div>
      {closeLabel === undefined ? null : (
        <DialogCloseButton label={closeLabel} disabled={closeDisabled} />
      )}
    </header>
  );
}

/** The padded column between the header and the footer; pass a gap to override. */
export function DialogBody({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-3 px-4 py-4', className)} {...props} />;
}

const FOOTER_ALIGN = { end: 'justify-end', between: 'justify-between' } as const;

/** The bordered action row; `between` splits a leading action from the rest. */
export function DialogFooter({
  align = 'end',
  children,
}: {
  align?: keyof typeof FOOTER_ALIGN;
  children?: ReactNode;
}) {
  return (
    <footer
      className={`flex shrink-0 items-center gap-2.5 border-t border-border-soft px-4 py-3 ${FOOTER_ALIGN[align]}`}
    >
      {children}
    </footer>
  );
}
