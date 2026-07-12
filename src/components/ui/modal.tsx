'use client';

import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react';
import { cn } from './cn';

// Lightweight overlay primitive wrapping the native HTML <dialog> element.
// The browser handles focus trap, Esc-to-close, and inert-ing the rest of
// the page for free; no framer-motion / headlessui / focus-trap-react in
// the bundle. Backdrop-click-to-close is wired explicitly because <dialog>
// doesn't do it by default.
export function Modal({
  open,
  onClose,
  labelledBy,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy?: string;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open === el.open) return; // already in the desired state
    if (open) el.showModal();
    else el.close();
  }, [open]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handleClose = () => onClose();
    el.addEventListener('close', handleClose);
    return () => el.removeEventListener('close', handleClose);
  }, [onClose]);

  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === ref.current) onClose();
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      onClick={handleBackdropClick}
      className={cn(
        'bg-section border border-border text-text font-mono p-0 m-auto rounded-card backdrop:bg-black/60',
        'w-[min(560px,calc(100vw-2rem))] max-h-[calc(100vh-2rem)]',
        className,
      )}
    >
      {children}
    </dialog>
  );
}
