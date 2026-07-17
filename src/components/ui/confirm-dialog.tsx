'use client';

import type { ReactNode, RefObject } from 'react';
import { Button } from './button';
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogTitle,
} from './dialog';

const TONE = {
  danger: { title: 'text-pill-red-text', button: 'danger' },
  neutral: { title: 'text-name', button: 'secondary' },
} as const;

function DialogError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="font-mono text-ui text-tone-red">
      {children}
    </p>
  );
}

/**
 * Renders the domain-neutral confirm dialog with house behavior and tokens; callers own semantic
 * meaning and content while this primitive owns presentation.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  consequence,
  children,
  busy,
  error,
  confirmLabel,
  busyLabel = 'Working…',
  confirmDisabled,
  onConfirm,
  finalFocus,
  tone = 'danger',
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  consequence: ReactNode;
  children?: ReactNode;
  busy: boolean;
  error?: ReactNode;
  confirmLabel: string;
  busyLabel?: string;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  finalFocus?: RefObject<HTMLElement | null>;
  tone?: 'danger' | 'neutral';
  className?: string;
}) {
  const appearance = TONE[tone];
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
      finalFocus={finalFocus}
      className={className}
    >
      <DialogTitle
        className={
          'border-b border-border-soft px-4 py-3 font-display text-h3 font-semibold tracking-copy uppercase ' +
          appearance.title
        }
      >
        {title}
      </DialogTitle>
      <div className="flex flex-col gap-3 px-4 py-4">
        <DialogDescription className="font-mono text-ui leading-relaxed text-text">
          {consequence}
        </DialogDescription>
        {children}
        <DialogError>{error}</DialogError>
      </div>
      <footer className="flex items-center justify-end gap-2.5 border-t border-border-soft px-4 py-3">
        <DialogClose render={<Button variant="secondary" size="sm" />} disabled={busy}>
          Cancel
        </DialogClose>
        <Button
          variant={appearance.button}
          size="sm"
          disabled={confirmDisabled ?? busy}
          onClick={onConfirm}
        >
          {busy ? busyLabel : confirmLabel}
        </Button>
      </footer>
    </Dialog>
  );
}
