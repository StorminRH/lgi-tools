import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { Dot } from '@/components/ui/dot';
import { SectionHeader } from '@/components/ui/section-header';
import type { RangeKey } from '@/composition/admin-period';
import { CardLink } from './CardLink';
import { loadAdminSignals } from './load-signals';
import {
  deriveAttention,
  deriveStatusGroups,
  type AttentionItem,
  type StatusGroup,
} from './signals';
import { LEVEL_DOT_TONE } from './status-tone';
import { StatusLines } from './StatusLines';

function AttentionRow({ item }: { item: AttentionItem }) {
  return (
    <li className="flex flex-col gap-2 border-b border-border-soft px-3.5 py-3 last:border-b-0 sm:flex-row sm:items-center sm:gap-3">
      <span className="flex min-w-0 flex-1 items-start gap-3">
        <Dot tone={LEVEL_DOT_TONE[item.level]} size="lg" className="mt-1.5" />
        <span className="min-w-0">
          <span className="block font-ui text-ui text-text">{item.title}</span>
          <span className="block font-ui text-label text-muted">{item.detail}</span>
        </span>
      </span>
      <Link
        href={item.action.href}
        className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'shrink-0 self-start sm:self-center')}
      >
        {item.action.label} →
      </Link>
    </li>
  );
}

function AllClear() {
  return (
    <div className="flex items-start gap-3 px-3.5 py-4">
      <Dot tone="green" size="lg" className="mt-1.5" />
      <span>
        <span className="block font-ui text-ui text-text">All clear</span>
        <span className="block font-ui text-label text-muted">
          No failing jobs, dead letters, ESI pressure or pending reviews.
        </span>
      </span>
    </div>
  );
}

function AttentionList({ items }: { items: AttentionItem[] }) {
  return (
    <Card data-admin-attention>
      <SectionHeader size="md" label="Needs attention" hint={`${items.length} alerts`} />
      {items.length === 0 ? (
        <AllClear />
      ) : (
        <ul>
          {items.map((item) => (
            <AttentionRow key={item.id} item={item} />
          ))}
        </ul>
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
      <StatusLines lines={group.lines} />
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
