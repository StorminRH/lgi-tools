'use client';

import type { ReactNode } from 'react';
import { cn } from './cn';
import { AlertIcon, CloseIcon, InfoIcon } from './icons';

const TONE = {
  info: { role: 'status', Icon: InfoIcon },
  warn: { role: 'alert', Icon: AlertIcon },
} as const;

function DismissBannerButton({ label, onDismiss }: { label: string; onDismiss?: () => void }) {
  if (!onDismiss) return null;
  return (
    <button type="button" aria-label={label} onClick={onDismiss} className="banner-dismiss">
      <CloseIcon size={14} />
    </button>
  );
}

export function Banner({
  tone,
  children,
  onDismiss,
  dismissLabel = 'Dismiss notice',
  className,
}: {
  tone: 'info' | 'warn';
  children: ReactNode;
  onDismiss?: () => void;
  dismissLabel?: string;
  className?: string;
}) {
  const { role, Icon } = TONE[tone];
  return (
    <div role={role} data-tone={tone} className={cn('banner-glass', className)}>
      <span aria-hidden className="banner-icon">
        <Icon size={16} />
      </span>
      <div className="min-w-0 flex-1 font-ui text-ui text-text">{children}</div>
      <DismissBannerButton label={dismissLabel} onDismiss={onDismiss} />
    </div>
  );
}
