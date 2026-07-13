'use client';

import type { ReactNode } from 'react';
import { cn } from './cn';

const TONE = {
  info: {
    role: 'status',
    container: 'border-isk-dim bg-pill-green-bg',
    dot: 'bg-isk shadow-status-info',
  },
  warn: {
    role: 'alert',
    container: 'border-pill-orange-border bg-pill-orange-bg',
    dot: 'bg-dps-mid shadow-status-warn',
  },
} as const;

function DismissBannerButton({ label, onDismiss }: { label: string; onDismiss?: () => void }) {
  if (!onDismiss) return null;
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onDismiss}
      className="ml-auto text-ui text-faint hover:text-name"
    >
      ×
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
  const appearance = TONE[tone];
  return (
    <div
      role={appearance.role}
      className={cn(
        'flex items-center gap-3 rounded-ctl border px-4 py-2.5 font-mono text-ui text-text shadow-card-edge',
        appearance.container,
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'h-[7px] w-[7px] shrink-0 rounded-full',
          appearance.dot,
        )}
      />
      <div className="min-w-0 flex-1">{children}</div>
      <DismissBannerButton label={dismissLabel} onDismiss={onDismiss} />
    </div>
  );
}
