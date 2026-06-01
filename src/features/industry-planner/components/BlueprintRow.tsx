import type { ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@/components/ui/cn';
import { TypeIcon } from '@/components/ui/type-icon';

// A single blueprint row for the dashboard, echoing the retired catalog row's
// visual (icon + name + a trailing slot) but stripped of margin/sort coupling.
// Presentational and hook-free, so it renders from both the server favorites
// section and the client recently-viewed island. When `href` is set the whole
// row is a link to the planner detail page; without it (a disabled placeholder)
// it renders as a static, dimmed row.

const ROW =
  'grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-2.5 px-3.5 py-[7px] border-t border-border-soft first:border-t-0 text-[12px]';

export function BlueprintRow({
  typeId,
  name,
  href,
  trailing,
  dimmed = false,
}: {
  typeId: number;
  name: string;
  href?: string;
  trailing?: ReactNode;
  dimmed?: boolean;
}) {
  const inner = (
    <>
      <TypeIcon typeId={typeId} size={32} mono={name.slice(0, 2)} />
      <span className="truncate text-name">{name}</span>
      <span className="text-[10px] text-muted whitespace-nowrap">{trailing}</span>
    </>
  );

  if (!href) {
    return <div className={cn(ROW, dimmed && 'opacity-45')}>{inner}</div>;
  }

  return (
    <Link
      href={href}
      className={cn(
        ROW,
        'no-underline hover:bg-[rgba(255,255,255,0.018)]',
        dimmed && 'opacity-45',
      )}
    >
      {inner}
    </Link>
  );
}
