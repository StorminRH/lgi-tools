'use client';

import type { ReactNode } from 'react';
import { cn } from './cn';
import { CheckIcon, CopyIcon } from './icons';
import { useCopyFeedback } from './use-copy-feedback';

type CopyState = ReturnType<typeof useCopyFeedback>['state'];

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
  const bubbles: Record<CopyState, ReactNode> = {
    idle: null,
    copied: copiedLabel,
    unavailable: unavailableLabel,
  };
  const announcements: Record<CopyState, string> = {
    idle: '',
    copied: `${feedbackLabel ?? value} copied to clipboard`,
    unavailable: unavailableAnnouncement,
  };

  return (
    <span className={cn('copy-chip', className)}>
      <span className="select-text font-ui text-nav tabular-nums text-name">{displayValue ?? value}</span>
      <button
        type="button"
        aria-label={label}
        disabled={disabled}
        data-state={state}
        onClick={() => void copy()}
        className="copy-icon-btn"
      >
        <CopyIcon size={15} className="copy-glyph-idle" />
        <CheckIcon size={15} className="copy-glyph-done" />
        {bubbles[state] ? (
          <span aria-hidden className="copy-bubble">
            {bubbles[state]}
          </span>
        ) : null}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {announcements[state]}
      </span>
    </span>
  );
}
