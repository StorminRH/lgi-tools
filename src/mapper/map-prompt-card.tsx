'use client';

import type { ReactNode } from 'react';
import { cn } from '@/components/ui/cn';
import type { DataAttributes } from '@/components/ui/menu';
import { mapFrostedSurface } from './map-frosted-surface';

const CARD_CLASS = cn('flex flex-col gap-2 p-3 text-ui', mapFrostedSurface);

/**
 * A decision card in the scanner prompt rail: an optional eyebrow, one line of
 * copy, then the caller's action rows. Every card is a labelled group, so a
 * screen reader announces what the buttons inside it decide.
 */
export function MapPromptCard({
  ariaLabel,
  eyebrow,
  body,
  children,
  ...data
}: DataAttributes & {
  readonly ariaLabel: string;
  readonly eyebrow?: string;
  readonly body: ReactNode;
  /** Action rows, laid out by the caller. */
  readonly children: ReactNode;
}) {
  return (
    <div {...data} role="group" aria-label={ariaLabel} className={CARD_CLASS}>
      {eyebrow === undefined ? null : (
        <span className="font-data text-label uppercase tracking-label text-muted">
          {eyebrow}
        </span>
      )}
      <p className="font-data text-micro text-name">{body}</p>
      {children}
    </div>
  );
}
