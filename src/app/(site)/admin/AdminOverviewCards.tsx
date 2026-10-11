import Link from 'next/link';
import { levelReadout } from '@/components/status-level-tone';
import { buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ReadoutList, ReadoutRow } from '@/components/ui/readout';
import {
  deriveAttention,
  deriveStatusGroups,
  type AdminSignals,
  type AttentionItem,
  type StatusGroupId,
} from './signals';

/** The overview's three status cards: their titles, where they link, and skeleton rows. */
export const STATUS_CARDS = [
  { id: 'app', title: 'App', href: '/admin/health', linkLabel: 'Health', rows: 4 },
  { id: 'esi', title: 'ESI', href: '/admin/esi', linkLabel: 'ESI', rows: 4 },
  { id: 'jobs', title: 'Jobs', href: '/admin/health#scheduled', linkLabel: 'Jobs', rows: 5 },
] as const satisfies readonly { id: StatusGroupId; title: string; href: string; linkLabel: string; rows: number }[];

function AttentionRow({ item }: { item: AttentionItem }) {
  return (
    <ReadoutRow
      label={item.title}
      note={item.detail}
      {...levelReadout(item.level)}
      trailing={
        <Link href={item.action.href} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
          {item.action.label} <span aria-hidden="true">→</span>
        </Link>
      }
    />
  );
}

export function AttentionList({ signals }: { signals: AdminSignals }) {
  const items = deriveAttention(signals, deriveStatusGroups(signals));
  if (items.length === 0) return <EmptyState kind="clear">All clear</EmptyState>;
  return (
    <ReadoutList>
      {items.map((item) => (
        <AttentionRow key={item.id} item={item} />
      ))}
    </ReadoutList>
  );
}
