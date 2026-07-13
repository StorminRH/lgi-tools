import type { ReactNode } from 'react';
import { cn } from './cn';
import { deriveRowLayout } from './row-layout';

/**
 * EntityRow — grid row (leading badge / name / optional chips / trailing stats).
 * Used for any "count × thing → stats" line. Tunable column template via
 * `colsClass` (a Tailwind `grid-cols-[…]` class — never an inline style, per
 * house style). When `chips` is provided the default columns add a
 * dedicated chip column so trailing stats stay aligned regardless of chip count.
 */
export function EntityRow({
  leading,
  name,
  chips,
  trailing,
  className,
  colsClass,
  inlineChips = false,
}: {
  leading?: ReactNode;
  name: ReactNode;
  chips?: ReactNode;
  trailing?: ReactNode;
  className?: string;
  colsClass?: string;
  /** Render chips beside the name instead of in their own trailing column, so
   *  the trailing stats keep a consistent right-aligned column across rows. */
  inlineChips?: boolean;
}) {
  const layout = deriveRowLayout({ leading, chips, trailing, colsClass, inlineChips });
  return (
    <div
      className={cn(
        'grid items-center gap-[6px] px-3.5 py-[5px] border-t border-border-soft text-ui hover:bg-row-hover',
        layout.colsClass,
        className,
      )}
    >
      {layout.showLeading && <span className="text-label text-muted">{leading}</span>}
      <RowName name={name} chips={chips} inline={layout.showInlineChips} />
      {layout.showTrailing && (
        <span className="flex items-center gap-2 shrink-0 justify-end">{trailing}</span>
      )}
      {layout.showChipColumn && (
        <span className="flex items-center gap-[4px] shrink-0">{chips}</span>
      )}
    </div>
  );
}

/** The name cell — chips beside the name when inlined, else the bare name. */
function RowName({
  name,
  chips,
  inline,
}: {
  name: ReactNode;
  chips?: ReactNode;
  inline: boolean;
}) {
  if (!inline) {
    return <span className="text-name truncate leading-[1.5]">{name}</span>;
  }
  return (
    <span className="flex items-center gap-2 min-w-0">
      <span className="text-name truncate leading-[1.5]">{name}</span>
      <span className="flex items-center gap-[4px] shrink-0">{chips}</span>
    </span>
  );
}

/**
 * ResourceRow — two- or three-column row for any "thing → meta → value"
 * listing (ore deposits, gas clouds, hackable cans). The caller picks the
 * column template via `colsClass` (a Tailwind `grid-cols-[…]` class, never an
 * inline style); the primitive only owns spacing / divider / hover.
 */
export function ResourceRow({
  name,
  meta,
  value,
  colsClass,
  className,
}: {
  name: ReactNode;
  meta?: ReactNode;
  value?: ReactNode;
  colsClass: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid items-center gap-[6px] px-3.5 py-[6px] border-t border-border-soft text-ui first:border-t-0 hover:bg-row-hover',
        colsClass,
        className,
      )}
    >
      <span className="text-name text-ui flex items-center gap-[6px]">{name}</span>
      {meta !== undefined && <span className="text-label text-muted whitespace-nowrap">{meta}</span>}
      {value !== undefined && (
        <span className="text-ui text-isk whitespace-nowrap font-medium">{value}</span>
      )}
    </div>
  );
}

/** Small helper for the bare stat pieces inside an EntityRow's trailing slot. */
export function Stat({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn('text-label text-muted whitespace-nowrap', className)}>{children}</span>
  );
}

/** EWAR row — labeled chip strip between header and body. */
export function LabeledChipRow({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="px-3.5 py-[5px] border-b border-border-soft bg-bg flex items-center gap-[7px] flex-wrap">
      <span className="text-label tracking-wide uppercase text-muted">{label}</span>
      {children}
    </div>
  );
}
