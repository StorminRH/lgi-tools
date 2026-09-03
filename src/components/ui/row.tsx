import type { ReactNode } from 'react';
import { cn } from './cn';
import { eyebrow } from './type-roles';
import { deriveRowLayout } from './row-layout';

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

export function LabeledChipRow({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="px-3.5 py-[5px] border-b border-border-soft bg-bg flex items-center gap-[7px] flex-wrap">
      <span className={eyebrow()}>{label}</span>

      {children}
    </div>

  );
}
