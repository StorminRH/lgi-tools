'use client';

import type { ReactNode } from 'react';
import { cn } from '@/components/ui/cn';
import { useCascadeNav } from './cascade-context';

// The clickable wrapper for a catalog row (cascade column 0). A client island
// inside the server-rendered catalog table: clicking fans the product's inputs
// out as the depth-0 column, and the row highlights while it's the open one
// (mirrors the detail-page cascade's open-row styling). The cells themselves
// are server-rendered and handed in as `children`.
export function CatalogRow({
  blueprintTypeId,
  gridColsClass,
  children,
}: {
  blueprintTypeId: number;
  gridColsClass: string;
  children: ReactNode;
}) {
  const { path, openFrom } = useCascadeNav();
  const open = path[0] === String(blueprintTypeId);

  return (
    <button
      type="button"
      onClick={() => openFrom(0, blueprintTypeId)}
      aria-expanded={open}
      className={cn(
        'grid items-center gap-4 px-3 py-2 border-b border-border-soft last:border-b-0 w-full text-left cursor-pointer transition-colors hover:bg-[rgba(255,255,255,0.018)]',
        open && 'bg-[rgba(61,214,140,0.06)] shadow-[inset_2px_0_0_var(--color-isk)]',
        gridColsClass,
      )}
    >
      {children}
    </button>
  );
}
