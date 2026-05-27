import type { ReactNode } from 'react';
import { cn } from './cn';

/**
 * EntityRow — grid row (leading badge / name / optional chips / trailing stats).
 * Used for any "count × thing → stats" line. Tunable column template via
 * `cols`. When `chips` is provided the default cols add a dedicated chip column
 * so trailing stats stay aligned regardless of chip count.
 */
export function EntityRow({
  leading,
  name,
  chips,
  trailing,
  className,
  cols,
}: {
  leading?: ReactNode;
  name: ReactNode;
  chips?: ReactNode;
  trailing?: ReactNode;
  className?: string;
  cols?: string;
}) {
  const defaultCols = chips !== undefined ? '26px minmax(0,1fr) auto auto' : '26px minmax(0,1fr) auto';
  return (
    <div
      className={cn(
        'grid items-center gap-[6px] px-3.5 py-[5px] border-t border-border-soft text-[12px] hover:bg-[rgba(255,255,255,0.018)]',
        className,
      )}
      style={{ gridTemplateColumns: cols ?? defaultCols }}
    >
      {leading !== undefined && <span className="text-[10px] text-muted">{leading}</span>}
      <span className="text-name truncate leading-[1.5]">{name}</span>
      {trailing !== undefined && (
        <span className="flex items-center gap-2 shrink-0 justify-end">{trailing}</span>
      )}
      {chips !== undefined && (
        <span className="flex items-center gap-[4px] shrink-0">{chips}</span>
      )}
    </div>
  );
}

/**
 * ResourceRow — two- or three-column row for any "thing → meta → value"
 * listing (ore deposits, gas clouds, hackable cans). The caller picks
 * the column template; the primitive only owns spacing / divider / hover.
 */
export function ResourceRow({
  name,
  meta,
  value,
  cols,
  className,
}: {
  name: ReactNode;
  meta?: ReactNode;
  value?: ReactNode;
  cols: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid items-center gap-[6px] px-3.5 py-[6px] border-t border-border-soft text-[12px] first:border-t-0 hover:bg-[rgba(255,255,255,0.018)]',
        className,
      )}
      style={{ gridTemplateColumns: cols }}
    >
      <span className="text-name text-[12px] flex items-center gap-[6px]">{name}</span>
      {meta !== undefined && <span className="text-[10px] text-muted whitespace-nowrap">{meta}</span>}
      {value !== undefined && (
        <span className="text-[11px] text-isk whitespace-nowrap font-medium">{value}</span>
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
    <span className={cn('text-[10px] text-muted whitespace-nowrap', className)}>{children}</span>
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
      <span className="text-[9px] tracking-[0.12em] uppercase text-muted">{label}</span>
      {children}
    </div>
  );
}
