import type { ReactNode } from 'react';
import { cn } from '@/components/ui/cn';
import { LivePrice } from '@/components/ui/live-price';
import { dataLabel, eyebrow } from '@/components/ui/type-roles';
import { formatIsk } from '@/lib/format/isk';

/**
 * The head over a cockpit column: an eyebrow label with its faint item count,
 * a dotted leader, then the column's ISK total. The raw ledger and the build
 * plan's tier columns share it so the two views stay in step.
 */
export function LedgerColumnHead({
  label,
  count,
  total,
  pending,
  collapseNarrow = false,
}: {
  label: ReactNode;
  count: number;
  total: number;
  pending: boolean;
  /**
   * Stack the total under the label when the column is narrow. The caller
   * must sit inside an `@container`, or the query binds to an outer one.
   */
  collapseNarrow?: boolean;
}) {
  return (
    <div
      className={cn(
        eyebrow({
          font: 'inherit',
          weight: 'semibold',
          emphasis: 'strong',
          className: 'mb-2 flex items-center gap-x-2 whitespace-nowrap',
        }),
        collapseNarrow && '@max-[14rem]:flex-col @max-[14rem]:items-start',
      )}
    >
      <span className="flex items-center gap-2">
        {label}
        <span className="text-faint">· {count}</span>
      </span>
      <span
        className={cn(
          'h-0 flex-1 border-b border-dotted border-border-idle',
          collapseNarrow && '@max-[14rem]:hidden',
        )}
      />
      <LivePrice
        value={formatIsk(total)}
        pending={pending}
        className="text-ui font-semibold tracking-normal text-isk"
      />
    </div>
  );
}

/** An item's name, clamped to two lines, over its one-line uppercase label. */
export function ItemNameStack({
  name,
  label,
  className,
}: {
  name: string;
  label: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-px', className)}>
      <span className="line-clamp-2 break-words font-data text-ui font-medium leading-[1.28] text-name">
        {name}
      </span>
      <span className={dataLabel({ className: 'truncate' })}>
        {label}
      </span>
    </div>
  );
}
