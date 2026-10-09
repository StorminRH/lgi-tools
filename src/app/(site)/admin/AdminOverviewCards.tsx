import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ReadoutList, ReadoutRow } from '@/components/ui/readout';
import { SectionHeader } from '@/components/ui/section-header';
import type { RangeKey } from '@/composition/admin-period';
import { CardLink } from './CardLink';
import { LevelRow } from './LevelRow';
import { loadAdminSignals } from './load-signals';
import {
  deriveAttention,
  deriveStatusGroups,
  type AttentionItem,
  type StatusGroup,
} from './signals';
import { levelReadout } from './status-tone';

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

function AttentionList({ items }: { items: AttentionItem[] }) {
  return (
    <Card data-admin-attention>
      <SectionHeader size="md" label="Needs attention" />
      {items.length === 0 ? (
        <EmptyState kind="clear">All clear</EmptyState>
      ) : (
        <ReadoutList>
          {items.map((item) => (
            <AttentionRow key={item.id} item={item} />
          ))}
        </ReadoutList>
      )}
    </Card>
  );
}

function StatusCard({ group }: { group: StatusGroup }) {
  return (
    <Card data-admin-status={group.id} className="h-full">
      <SectionHeader
        size="md"
        label={group.title}
        hint={<CardLink href={group.href}>{group.linkLabel}</CardLink>}
      />
      <ReadoutList>
        {group.lines.map((line) => (
          <LevelRow key={line.id} line={line} />
        ))}
      </ReadoutList>
    </Card>
  );
}

export async function AttentionCard({ rangeKey }: { rangeKey: RangeKey }) {
  const signals = await loadAdminSignals(rangeKey);
  return <AttentionList items={deriveAttention(signals, deriveStatusGroups(signals))} />;
}

export async function StatusCards({ rangeKey }: { rangeKey: RangeKey }) {
  const signals = await loadAdminSignals(rangeKey);
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {deriveStatusGroups(signals).map((group) => (
        <StatusCard key={group.id} group={group} />
      ))}
    </div>
  );
}
