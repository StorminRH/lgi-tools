'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { cn } from './cn';

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

/**
 * Renders the domain-neutral copy button with house behavior and tokens; callers own semantic
 * meaning and content while this primitive owns presentation.
 */
export function CopyButton({
  value,
  displayValue,
  label = 'Copy',
  copiedLabel = 'Copied',
  className,
}: {
  value: string;
  displayValue?: ReactNode;
  label?: string;
  copiedLabel?: string;
  className?: string;
}) {
  const { state, copy } = useCopyFeedback(value);
  const labels: Record<CopyState, ReactNode> = {
    idle: label,
    copied: copiedLabel,
    unavailable: 'Select text',
  };
  const announcements: Record<CopyState, string> = {
    idle: '',
    copied: `${value} copied to clipboard`,
    unavailable: 'Clipboard unavailable; select the value manually',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-ctl border border-border-soft bg-bg-deep px-2.5 py-1.5 ' +
          'font-mono text-ui text-name shadow-field-inset',
        className,
      )}
    >
      <span className="select-text tabular-nums text-isk">{displayValue ?? value}</span>
      <button
        type="button"
        onClick={() => void copy()}
        className={cn(
          'rounded-ctl border border-border-idle bg-section px-2 py-0.5 font-mono text-micro tracking-label uppercase ' +
            'text-muted shadow-btn-bezel hover:border-isk-dim hover:text-isk',
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
