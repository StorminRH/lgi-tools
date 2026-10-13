import type { ReactNode } from 'react';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionPanel } from '@/components/ui/section-panel';

export function LinkedCharactersCard({
  label,
  count,
  rows,
  children,
}: {
  label: string;
  count: number;
  rows: ReactNode;
  children?: ReactNode;
}) {
  return (
    <SectionPanel title={label} className="reveal reveal-1">
      {count === 0 ? <EmptyState>No characters linked to this account.</EmptyState> : rows}
      {children}
    </SectionPanel>
  );
}
