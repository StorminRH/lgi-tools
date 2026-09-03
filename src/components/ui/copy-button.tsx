'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { cn } from './cn';
import { eyebrow } from './type-roles';

type CopyState = 'idle' | 'copied' | 'unavailable';

const STATE_CLASS: Record<CopyState, string | undefined> = {
  idle: undefined,
  copied: 'border-isk bg-isk text-isk-ink hover:text-isk-ink',
  unavailable: 'border-pill-red-border text-pill-red-text',
};

async function writeClipboard(value: string): Promise<CopyState> {
  if (!navigator.clipboard) return 'unavailable';
  try {
    await navigator.clipboard.writeText(value);
    return 'copied';
  } catch {
    return 'unavailable';
  }
}

function useCopyFeedback(value: string) {
  const [state, setState] = useState<CopyState>('idle');

  useEffect(() => {
    if (state !== 'copied') return;
    const timeout = window.setTimeout(() => setState('idle'), 1200);
    return () => window.clearTimeout(timeout);
  }, [state]);

  return {
    state,
    copy: async () => setState(await writeClipboard(value)),
  };
}

export function CopyButton({
  value,
  displayValue,
  label = 'Copy',
  copiedLabel = 'Copied',
  unavailableLabel = 'Select text',
  feedbackLabel,
  unavailableAnnouncement = 'Clipboard unavailable; select the value manually',
  disabled = false,
  className,
}: {
  value: string;
  displayValue?: ReactNode;
  label?: string;
  copiedLabel?: string;
  unavailableLabel?: string;
  feedbackLabel?: string;
  unavailableAnnouncement?: string;
  disabled?: boolean;
  className?: string;
}) {
  const { state, copy } = useCopyFeedback(value);
  const labels: Record<CopyState, ReactNode> = {
    idle: label,
    copied: copiedLabel,
    unavailable: unavailableLabel,
  };
  const announcements: Record<CopyState, string> = {
    idle: '',
    copied: `${feedbackLabel ?? value} copied to clipboard`,
    unavailable: unavailableAnnouncement,
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-ctl border border-border-soft bg-bg-deep px-2.5 py-1.5 ' +
          'font-data text-ui text-name shadow-field-inset',
        className,
      )}
    >
      <span className="select-text tabular-nums text-isk">{displayValue ?? value}</span>

      <button
        type="button"
        disabled={disabled}
        onClick={() => void copy()}
        className={cn(
          'rounded-ctl border border-border-idle bg-section px-2 py-0.5 shadow-btn-bezel hover:border-isk-dim hover:text-isk ' +
            eyebrow({ size: 'micro' }),
          'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border-idle disabled:hover:text-name',
          STATE_CLASS[state],
        )}
      >
        {labels[state]}
      </button>

      <span className="sr-only" role="status" aria-live="polite">
        {announcements[state]}
      </span>

    </span>

  );
}
