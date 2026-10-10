'use client';

import { useId, type ReactNode, type RefObject } from 'react';
import { Button } from './button';
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
} from './dialog';

const TONE = {
  danger: { title: 'danger', button: 'danger' },
  neutral: { title: 'name', button: 'secondary' },
} as const;

function DialogError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="font-ui text-ui text-tone-red">
      {children}
    </p>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  consequence,
  children,
  busy,
  error,
  confirmLabel,
  cancelLabel = 'Cancel',
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
  cancelLabel?: string;
  busyLabel?: string;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  finalFocus?: RefObject<HTMLElement | null>;
  tone?: 'danger' | 'neutral';
  className?: string;
}) {
  const titleId = useId();
  const appearance = TONE[tone];
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
      labelledBy={titleId}
      finalFocus={finalFocus}
      className={className}
    >
      <DialogHeader titleId={titleId} title={title} size="h3" tone={appearance.title} />
      <DialogBody>
        <DialogDescription className="font-ui text-ui leading-relaxed text-text">
          {consequence}
        </DialogDescription>
        {children}
        <DialogError>{error}</DialogError>
      </DialogBody>
      <DialogFooter>
        <DialogClose render={<Button variant="secondary" size="sm" />} disabled={busy}>
          {cancelLabel}
        </DialogClose>
        <Button
          variant={appearance.button}
          size="sm"
          disabled={busy || confirmDisabled}
          onClick={onConfirm}
        >
          {busy ? busyLabel : confirmLabel}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
