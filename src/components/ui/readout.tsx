import type { ReactNode } from 'react';
import { cn } from './cn';
import { Dot } from './dot';
import type { DotTone } from './tones';

export type ReadoutLineProps = {
  label: ReactNode;
  value?: ReactNode;
  /** A second line of detail under the label. It wraps rather than truncates. */
  note?: ReactNode;
  /** Draws a status dot before the label. */
  tone?: DotTone;
  /** The verdict the dot's colour stands for, such as "Warning", read to screen readers only. */
  status?: string;
  /** Healthy values stay `default`; only problems should draw the eye. */
  valueTone?: 'default' | 'muted' | 'orange' | 'red';
  /** Sits at the end of the first line: a chevron, a pill, a small button. */
  trailing?: ReactNode;
};

const VALUE_TONE = {
  default: 'text-name',
  muted: 'text-muted',
  orange: 'text-tone-orange',
  red: 'text-tone-red',
} satisfies Record<NonNullable<ReadoutLineProps['valueTone']>, string>;

// One text-ui line box tall, so whatever sits inside centres on the label's
// first line however many lines the label, note or value wrap to.
const firstLineSlot = 'flex h-lh shrink-0 items-center text-ui';

function StatusMark({ tone, status }: Pick<ReadoutLineProps, 'tone' | 'status'>) {
  if (tone === undefined) return status ? <span className="sr-only">{status}</span> : null;
  return (
    <span className={firstLineSlot}>
      <Dot tone={tone} size="lg" label={status} />
    </span>
  );
}

/**
 * The inner layout of a key/value status row: dot, label over note, value,
 * trailing slot. Use it on its own inside a Collapsible summary; lists use
 * ReadoutRow. Only phrasing elements, so it is valid inside `<summary>`.
 *
 * Overflow-safe by construction: the label column takes the free space and
 * wraps long words; the value is capped at half the row and wraps instead of
 * pushing into the label.
 */
export function ReadoutLine({
  label,
  value,
  note,
  tone,
  status,
  valueTone = 'default',
  trailing,
}: ReadoutLineProps) {
  return (
    <span className="flex min-w-0 flex-1 items-start gap-3">
      <StatusMark tone={tone} status={status} />
      <span className="min-w-0 flex-1">
        <span className="block font-ui text-ui text-text wrap-break-word">{label}</span>
        {note === undefined ? null : (
          <span className="block font-data text-micro text-muted wrap-break-word">{note}</span>
        )}
      </span>
      {value === undefined ? null : (
        <span
          className={cn(
            'max-w-1/2 text-right font-data text-ui tabular-nums wrap-anywhere',
            VALUE_TONE[valueTone],
          )}
        >
          {value}
        </span>
      )}
      {trailing === undefined ? null : <span className={firstLineSlot}>{trailing}</span>}
    </span>
  );
}

export function ReadoutRow(props: ReadoutLineProps) {
  return (
    <li className="border-b border-border-soft px-3.5 py-2.5 last:border-b-0">
      <ReadoutLine {...props} />
    </li>
  );
}

export function ReadoutList({ children }: { children: ReactNode }) {
  return <ul>{children}</ul>;
}
