import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionHeader } from '@/components/ui/section-header';

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
    <Card className="reveal reveal-1">
      <SectionHeader size="md" label={label} />
      {count === 0 ? <EmptyState>No characters linked to this account.</EmptyState> : rows}
      {children}
    </Card>
  );
}
