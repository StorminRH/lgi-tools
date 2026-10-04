'use client';

import type { ReactNode } from 'react';
import { cn } from './cn';
import { AlertIcon, CloseIcon, InfoIcon, RetryIcon } from './icons';

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

/** The whole notice is the retry target; the arrow marks it. */
function RetryBannerButton({ label, onRetry }: { label: string; onRetry?: () => void }) {
  if (!onRetry) return null;
  return (
    <>
      <button type="button" aria-label={label} onClick={onRetry} className="banner-retry-hit" />
      <span aria-hidden className="banner-retry">
        <RetryIcon size={14} />
      </span>
    </>
  );
}

export function Banner({
  tone,
  children,
  onDismiss,
  dismissLabel = 'Dismiss notice',
  onRetry,
  retryLabel = 'Try again',
  className,
}: {
  tone: 'info' | 'warn';
  children: ReactNode;
  onDismiss?: () => void;
  dismissLabel?: string;
  /** Something failed to load: clicking anywhere on the notice tries again. */
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}) {
  const { role, Icon } = TONE[tone];
  return (
    <div role={role} data-tone={tone} data-retry={onRetry ? '' : undefined} className={cn('banner-glass', className)}>
      <span aria-hidden className="banner-icon">
        <Icon size={16} />
      </span>
      <div className="min-w-0 flex-1 font-ui text-ui text-text">{children}</div>
      <RetryBannerButton label={retryLabel} onRetry={onRetry} />
      <DismissBannerButton label={dismissLabel} onDismiss={onDismiss} />
    </div>
  );
}
