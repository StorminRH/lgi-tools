import type { ReactNode } from 'react';
import { cn } from './cn';
import { AlertIcon, CheckIcon, InboxIcon, InfoIcon } from './icons';

// Each kind draws its own glyph, so a section that failed to load never looks
// like one with nothing in it, even without colour.
const KIND = {
  empty: { Icon: InboxIcon, tone: 'text-faint' },
  unavailable: { Icon: AlertIcon, tone: 'text-tone-orange' },
  clear: { Icon: CheckIcon, tone: 'text-isk' },
  disconnected: { Icon: InfoIcon, tone: 'text-muted' },
} satisfies Record<string, { Icon: typeof InboxIcon; tone: string }>;

/**
 * The quiet line in place of a list or section's content.
 *
 * `kind` says why there is nothing: `empty` (no data yet), `unavailable` (the
 * read failed), `clear` (nothing wrong, such as no failures) or `disconnected`
 * (the source is not set up). `inset` drops the row padding and divider when
 * it sits inside a body that already pads its content.
 */
export function EmptyState({
  children,
  kind = 'empty',
  inset = false,
}: {
  children: ReactNode;
  kind?: keyof typeof KIND;
  inset?: boolean;
}) {
  const { Icon, tone } = KIND[kind];
  return (
    <div
      className={cn(
        'flex items-center gap-3 font-ui text-ui text-muted',
        !inset && 'border-b border-border-soft px-3.5 py-2.5 last:border-b-0',
      )}
    >
      <Icon size={16} className={cn('shrink-0', tone)} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
